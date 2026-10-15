// The share API behind the Pages Functions in functions/ (thin wrappers around these).
// Kept free of Cloudflare types so the tests can run it with in-memory KV and R2.
//
//   POST /api/share            { song, samples }  → { code, url }   (write-once, KV: SHARES)
//   GET  /api/share/:code      → { v, song, samples }, cached for a year
//   PUT  /api/sample/:key      raw sample bytes; key = their hash  (R2: SAMPLES)
//   GET  /api/sample/:key      → the bytes, cached for a year

import { SAMPLES_MAX_BYTES, SONG_MAX_BYTES, parseSongCode, sampleKey, shareable, songCode, validateSong, type SharedSong } from "../engine/share";

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>;
}
export interface R2Like {
  head(key: string): Promise<unknown | null>;
  put(key: string, body: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}
interface DONamespace { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } }
export interface ShareEnv { SHARES?: KVLike; SAMPLES?: R2Like; LIMITER?: DONamespace }

const KEY_RE = /^[0-9a-f]{32}$/;
/** All shared samples together stay under this (R2's free tier is 10 GB). Counted in KV, so it's approximate. */
export const SAMPLES_TOTAL_CAP = 2 * 1024 ** 3;
const TOTAL_KEY = "_stats:sampleBytes";
const MAX_SAMPLES = 64;
const FOREVER = "public, max-age=31536000, immutable";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

/** Per-IP rate limit (a Durable Object counts the last minute). No limiter (local dev): allowed. */
async function limited(req: Request, env: ShareEnv, perMinute: number): Promise<boolean> {
  if (!env.LIMITER) return false;
  try {
    const ip = req.headers.get("cf-connecting-ip") ?? "local";
    const r = await env.LIMITER.get(env.LIMITER.idFromName(ip)).fetch(new Request(`https://limit/?per=${perMinute}`));
    return r.status === 429;
  } catch {
    return false; // the limiter being down shouldn't stop sharing
  }
}

export async function postShare(req: Request, env: ShareEnv): Promise<Response> {
  if (!env.SHARES) return json({ error: "Sharing isn't set up on this server" }, 503);
  if (await limited(req, env, 20)) return json({ error: "Too many shares from here: try again in a minute" }, 429, { "retry-after": "60" });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > SONG_MAX_BYTES + 16 * 1024) return json({ error: "That song is too big to share (512 KB max)" }, 413);
  const text = await req.text();
  if (text.length > SONG_MAX_BYTES + 16 * 1024) return json({ error: "That song is too big to share (512 KB max)" }, 413);
  let body: { song?: unknown; samples?: unknown };
  try { body = JSON.parse(text); } catch { return json({ error: "Not JSON" }, 400); }
  const why = validateSong(body.song);
  if (why) return json({ error: `Not a TILT song: ${why}` }, 400);
  const song = shareable(body.song as SharedSong["song"]);
  if (new TextEncoder().encode(JSON.stringify(song)).length > SONG_MAX_BYTES) return json({ error: "That song is too big to share (512 KB max)" }, 413);

  // Samples: the song's sample id → the key it was uploaded under (it must be there).
  const samples: Record<string, string> = {};
  const raw = body.samples ?? {};
  if (typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > MAX_SAMPLES) return json({ error: "Bad sample list" }, 400);
  for (const [id, key] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9a-z]{1,64}$/.test(id) || typeof key !== "string" || !KEY_RE.test(key)) return json({ error: "Bad sample list" }, 400);
    if (!env.SAMPLES || !(await env.SAMPLES.head(key))) return json({ error: "A sample wasn't uploaded first" }, 400);
    samples[id] = key;
  }

  const code = await songCode(song);
  const existing = await env.SHARES.get(code);
  // Write-once: the code is the song's hash, so what's there already is this song.
  if (!existing) await env.SHARES.put(code, JSON.stringify({ v: 1, song, samples } satisfies SharedSong), { metadata: { at: Date.now() } });
  return json({ code, url: `${new URL(req.url).origin}/s/${code}` }, existing ? 200 : 201);
}

export async function getShare(code: string, env: ShareEnv): Promise<Response> {
  if (!env.SHARES) return json({ error: "Sharing isn't set up on this server" }, 503);
  const c = parseSongCode(code);
  if (!c) return json({ error: "That isn't a song code" }, 400);
  const v = await env.SHARES.get(c);
  // Not found yet may just be KV catching up (eventually consistent): never cache a miss.
  if (!v) return json({ error: "No song with that code" }, 404, { "cache-control": "no-store" });
  return new Response(v, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": FOREVER } });
}

export async function putSampleBlob(req: Request, key: string, env: ShareEnv): Promise<Response> {
  if (!env.SAMPLES) return json({ error: "Sample sharing isn't set up on this server" }, 503);
  if (!KEY_RE.test(key)) return json({ error: "Bad sample key" }, 400);
  if (await limited(req, env, 60)) return json({ error: "Too many uploads: try again in a minute" }, 429, { "retry-after": "60" });
  if (Number(req.headers.get("content-length") ?? 0) > SAMPLES_MAX_BYTES) return json({ error: "Sample too big (5 MB max)" }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > SAMPLES_MAX_BYTES) return json({ error: "Sample too big (5 MB max)" }, 413);
  if (bytes.length < 6) return json({ error: "Not a sample" }, 400);
  if ((await sampleKey(bytes)) !== key) return json({ error: "The sample doesn't match its key" }, 400);
  if (await env.SAMPLES.head(key)) return json({ key }, 200); // stored already: same bytes, same key
  // The storage cap: past it, songs still share, just without new samples (the app says which).
  const total = Number((await env.SHARES?.get(TOTAL_KEY)) ?? 0) || 0;
  if (total + bytes.length > SAMPLES_TOTAL_CAP) return json({ error: "Sample storage is full" }, 507);
  await env.SAMPLES.put(key, bytes);
  await env.SHARES?.put(TOTAL_KEY, String(total + bytes.length));
  return json({ key }, 201);
}

export async function getSampleBlob(key: string, env: ShareEnv): Promise<Response> {
  if (!env.SAMPLES) return json({ error: "Sample sharing isn't set up on this server" }, 503);
  if (!KEY_RE.test(key)) return json({ error: "Bad sample key" }, 400);
  const o = await env.SAMPLES.get(key);
  if (!o) return json({ error: "No such sample" }, 404, { "cache-control": "no-store" });
  return new Response(await o.arrayBuffer(), { headers: { "content-type": "application/octet-stream", "cache-control": FOREVER } });
}
