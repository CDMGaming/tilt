// Sharing a whole song: its code (a hash of the song, so the same song always gets the
// same code and any edit a new one), what a shared song may contain, and the
// no-server fallback link (#song=...). Pure: runs in the app, the Pages Functions and tests.

import { MAX_BARS, MAX_SCENES, MAX_TRACKS, type Song } from "./model";
import { SCALES } from "./music";

/** Caps: the song as JSON, and all its user samples together. */
export const SONG_MAX_BYTES = 512 * 1024;
export const SAMPLES_MAX_BYTES = 5 * 1024 * 1024;

/** Crockford base32: no I, L, O, U (they read as 1, 1, 0, V). */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LEN = 8;

/**
 * "TILT-7K3QX9AB", "tilt 7k3q-x9ab", "7K3QX9AB" → "7K3QX9AB"; anything else → null.
 * A setup code is never 8 characters (at least 10), so the two kinds can't be mixed up.
 */
export function parseSongCode(text: string): string | null {
  const t = text.trim().toUpperCase().replace(/^TILT[-\s]?/, "").replace(/[-\s]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return t.length === CODE_LEN && [...t].every((c) => B32.includes(c)) ? t : null;
}
export const showCode = (code: string) => `TILT-${code}`;

/** Fields that aren't the song itself: where it sits in your library, its share history. */
const LOCAL_FIELDS = ["libId", "shares", "sharedFrom"] as const;

/** The song as it's shared: a deep copy without the local fields. */
export function shareable(song: Song): Song {
  const s = JSON.parse(JSON.stringify(song)) as Song & Record<string, unknown>;
  for (const k of LOCAL_FIELDS) delete s[k];
  return s;
}

/** JSON with object keys sorted at every level: the same song always gives the same text. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** The first 8 base32 characters of the SHA-256 of the canonical song (40 bits). */
export async function songCode(song: Song): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(shareable(song)))));
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5 && out.length < CODE_LEN) { out += B32[(acc >> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= CODE_LEN) break;
  }
  return out;
}

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** Is this a song TILT can open? Returns why not, or null when it's fine. */
export function validateSong(v: unknown): string | null {
  if (!v || typeof v !== "object") return "not a song";
  const s = v as Record<string, unknown>;
  if (s.version !== 1) return "unknown song version";
  if (typeof s.title !== "string" || s.title.length > 120) return "bad title";
  if (!num(s.tempo, 20, 400) || !num(s.key, 0, 11) || !num(s.swing, 0, 100)) return "bad tempo, key or swing";
  if (typeof s.scale !== "string" || !SCALES.some((x) => x.id === s.scale)) return "unknown scale";
  if (!Array.isArray(s.scenes) || !s.scenes.length || s.scenes.length > MAX_SCENES) return "bad scenes";
  const sceneIds = new Set<number>();
  for (const sc of s.scenes as Record<string, unknown>[]) {
    if (!sc || !num(sc.id, 0, 1e9) || typeof sc.name !== "string" || sc.name.length > 60 || !num(sc.repeat, 1, 64)) return "bad scene";
    sceneIds.add(sc.id as number);
  }
  if (!Array.isArray(s.tracks) || s.tracks.length > MAX_TRACKS) return "bad tracks";
  for (const t of s.tracks as Record<string, unknown>[]) {
    if (!t || !num(t.id, 0, 1e9) || typeof t.kind !== "string" || !t.clips || typeof t.clips !== "object" || !t.params || typeof t.params !== "object") return "bad track";
    for (const [sid, c] of Object.entries(t.clips as Record<string, Record<string, unknown>>)) {
      if (!sceneIds.has(Number(sid))) return "a clip in a scene that isn't there";
      if (!c || !num(c.bars, 1, MAX_BARS) || !Array.isArray(c.notes) || c.notes.length > 4096) return "bad clip";
      for (const n of c.notes as Record<string, unknown>[]) {
        if (!n || !num(n.pitch, 0, 127) || !num(n.start, 0, MAX_BARS * 4 * 96 * 4) || !num(n.len, 1, MAX_BARS * 4 * 96 * 4) || !num(n.vel, 0, 127)) return "bad note";
      }
    }
    for (const r of (t.samples as unknown[] | undefined) ?? []) if (r !== null && r !== undefined && typeof r !== "string") return "bad sample reference";
  }
  return null;
}

// ---------------------------------------------------------------- the no-server link

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t));
  return new Uint8Array(await out.arrayBuffer());
}

/** The song, deflated and base64url'd, for a link that needs no server: …/#song=<this>. */
export async function songToFragment(song: Song): Promise<string> {
  return b64url(await pipe(new TextEncoder().encode(JSON.stringify(shareable(song))), new CompressionStream("deflate")));
}

/** Back from #song=…; throws when it isn't a song. */
export async function songFromFragment(frag: string): Promise<Song> {
  const json = JSON.parse(new TextDecoder().decode(await pipe(unb64url(frag), new DecompressionStream("deflate"))));
  const why = validateSong(json);
  if (why) throw new Error(why);
  return json as Song;
}

// ---------------------------------------------------------------- user samples

/** A user sample as uploaded: rate (u32), name length (u16), name (UTF-8), 16-bit PCM. */
export function packSample(name: string, rate: number, data: Float32Array): Uint8Array {
  const nm = new TextEncoder().encode(name.slice(0, 40));
  const out = new Uint8Array(6 + nm.length + data.length * 2);
  const v = new DataView(out.buffer);
  v.setUint32(0, rate, true);
  v.setUint16(4, nm.length, true);
  out.set(nm, 6);
  for (let i = 0; i < data.length; i++) v.setInt16(6 + nm.length + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return out;
}

export function unpackSample(bytes: Uint8Array): { name: string; rate: number; data: Float32Array } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = v.getUint32(0, true), nl = v.getUint16(4, true);
  const name = new TextDecoder().decode(bytes.subarray(6, 6 + nl));
  const n = Math.floor((bytes.length - 6 - nl) / 2);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = v.getInt16(6 + nl + i * 2, true) / 32767;
  return { name, rate, data };
}

/** Content key of an uploaded sample (hex SHA-256, 32 characters). */
export async function sampleKey(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return [...h].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What's stored under a code: the song, and its user samples (song's sample id → upload key). */
export interface SharedSong { v: 1; song: Song; samples: Record<string, string> }
