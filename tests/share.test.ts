// Song sharing: codes, the server API (with in-memory KV and R2), the #song fallback,
// size limits, samples, and the QR code generator.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { songFromSetup, encodeSetup } from "../src/engine/dice.ts";
import { addNote, ensureClip } from "../src/engine/songops.ts";
import {
  SAMPLES_MAX_BYTES, SONG_MAX_BYTES, canonicalJson, packSample, parseSongCode, sampleKey, shareable, songCode,
  songFromFragment, songToFragment, unpackSample, validateSong,
} from "../src/engine/share.ts";
import { getSampleBlob, getShare, postShare, putSampleBlob, type ShareEnv } from "../src/server/shareapi.ts";
import { alignmentPositions, codewords, formatBits, functionPatterns, makeQr, maskAt, rsDivisor, rsRemainder, versionBits, zigzag } from "../src/ui/qr.ts";

function demo() {
  const s = songFromSetup({ key: 9, scale: "minor", tempo: 122, swing: 10, lineup: [{ kind: "drums", preset: 1 }, { kind: "acid", preset: 2 }, { kind: "lead", preset: 0 }] });
  s.title = "Night Drive";
  const c = ensureClip(s, s.tracks[1], s.scenes[0].id);
  for (const [p, t] of [[45, 0], [48, 96], [52, 192]]) addNote(s, c, { pitch: p, start: t, len: 48, vel: 100 });
  s.tracks[1].params.cutoff = 1234;
  s.tracks[1].clips[s.scenes[0].id].auto = { cutoff: [{ tick: 0, v: 0.2 }, { tick: 96, v: 0.8 }] } as never;
  return s;
}

function memKV() {
  const m = new Map<string, string>();
  let puts = 0;
  return { m, get puts() { return puts; }, get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { puts++; m.set(k, v); } };
}
function memR2() {
  const m = new Map<string, Uint8Array>();
  return { m, head: async (k: string) => (m.has(k) ? {} : null), put: async (k: string, b: Uint8Array) => { m.set(k, b); return {}; }, get: async (k: string) => (m.has(k) ? { arrayBuffer: async () => m.get(k)!.slice().buffer } : null) };
}
const post = (body: unknown) => new Request("https://tilt-jam.pages.dev/api/share", { method: "POST", body: JSON.stringify(body) });

Deno.test("song codes: 8 characters, told apart from setup codes, forgiving to type", async () => {
  const code = await songCode(demo());
  assertEquals(code.length, 8);
  assertEquals(parseSongCode(`TILT-${code}`), code);
  assertEquals(parseSongCode(`tilt ${code.toLowerCase().slice(0, 4)}-${code.toLowerCase().slice(4)}`), code);
  assertEquals(parseSongCode("TILT-7K3QX9AO"), "7K3QX9A0"); // O typed for 0
  // A setup code is never mistaken for a song code.
  assertEquals(parseSongCode(encodeSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }] })), null);
  assertEquals(parseSongCode("TILT-ABC"), null);
});

Deno.test("song codes: same song, same code; any edit, a new one; library fields don't count", async () => {
  const a = demo(), b = demo();
  assertEquals(await songCode(a), await songCode(b));
  // Key order and local fields (library id, share history, where it came from) don't change it.
  const shuffled = JSON.parse(canonicalJson(a));
  Object.assign(b, { libId: "s123", shares: [{ code: "AAAAAAAA", at: 1 }], sharedFrom: "BBBBBBBB" });
  assertEquals(await songCode(shuffled), await songCode(b));
  const edited = demo();
  edited.tracks[1].clips[edited.scenes[0].id].notes[0].vel = 99;
  assertNotEquals(await songCode(edited), await songCode(a));
  const retitled = demo();
  retitled.title = "Night Drive 2";
  assertNotEquals(await songCode(retitled), await songCode(a));
});

Deno.test("share then load: the song comes back identical (notes, automation, presets, scene order)", async () => {
  const kv = memKV(), env: ShareEnv = { SHARES: kv, SAMPLES: memR2() };
  const song = demo();
  song.scenes.push({ id: 99, name: "Outro", repeat: 2, tempo: null, fadeIn: false, fadeOut: true });
  song.scenes.reverse();
  const r = await postShare(post({ song, samples: {} }), env);
  assertEquals(r.status, 201);
  const { code, url } = await r.json();
  assertEquals(code, await songCode(song));
  assertEquals(url, `https://tilt-jam.pages.dev/s/${code}`);
  const g = await getShare(`TILT-${code}`, env);
  assertEquals(g.status, 200);
  assert(g.headers.get("cache-control")!.includes("immutable"));
  const back = await g.json();
  assertEquals(back.song, shareable(song));
  // Sharing it again: the same code, nothing written twice (write-once).
  const again = await postShare(post({ song, samples: {} }), env);
  assertEquals(again.status, 200);
  assertEquals((await again.json()).code, code);
  assertEquals(kv.puts, 1);
});

Deno.test("share API: misses aren't cached, bad songs and oversize songs are refused, no storage = 503", async () => {
  const env: ShareEnv = { SHARES: memKV() };
  const miss = await getShare("TILT-ZZZZZZZZ", env);
  assertEquals(miss.status, 404);
  assertEquals(miss.headers.get("cache-control"), "no-store");
  assertEquals((await getShare("hello", env)).status, 400);
  assertEquals((await postShare(post({ song: { version: 1, title: "x" } }), env)).status, 400);
  assertEquals((await postShare(new Request("https://x/api/share", { method: "POST", body: "{not json" }), env)).status, 400);
  const big = demo();
  big.title = "x".repeat(10);
  (big as unknown as Record<string, unknown>).junk = "x".repeat(SONG_MAX_BYTES);
  assertEquals((await postShare(post({ song: big }), env)).status, 413);
  assertEquals((await postShare(post({ song: demo() }), {})).status, 503);
  assertEquals(validateSong(demo()), null);
  const badNote = demo();
  badNote.tracks[1].clips[badNote.scenes[0].id].notes[0].pitch = 300;
  assertEquals(validateSong(badNote), "bad note");
});

Deno.test("share API: the rate limit answers 429", async () => {
  const env: ShareEnv = { SHARES: memKV(), LIMITER: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("slow down", { status: 429 }) }) } };
  const r = await postShare(post({ song: demo() }), env);
  assertEquals(r.status, 429);
  assertEquals(r.headers.get("retry-after"), "60");
});

Deno.test("samples: packed and unpacked, stored under their own hash, required before the share", async () => {
  const data = new Float32Array(4410).map((_, i) => Math.sin(i / 10) * 0.5);
  const bytes = packSample("my kick", 44100, data);
  const back = unpackSample(bytes);
  assertEquals([back.name, back.rate, back.data.length], ["my kick", 44100, data.length]);
  assert(Math.abs(back.data[100] - data[100]) < 1e-4);
  const r2 = memR2(), env: ShareEnv = { SHARES: memKV(), SAMPLES: r2 };
  const key = await sampleKey(bytes);
  const put = (k: string, b: Uint8Array) => putSampleBlob(new Request(`https://x/api/sample/${k}`, { method: "PUT", body: b as Uint8Array<ArrayBuffer> }), k, env);
  assertEquals((await put("0".repeat(32), bytes)).status, 400); // the key must be its hash
  assertEquals((await put(key, bytes)).status, 201);
  assertEquals(new Uint8Array(await (await getSampleBlob(key, env)).arrayBuffer()), bytes);
  // A share that points at a sample nobody uploaded is refused.
  assertEquals((await postShare(post({ song: demo(), samples: { abc123: "f".repeat(32) } }), env)).status, 400);
  assertEquals((await postShare(post({ song: demo(), samples: { abc123: key } }), env)).status, 201);
  // Over the cap.
  const huge = new Uint8Array(SAMPLES_MAX_BYTES + 10);
  assertEquals((await put(await sampleKey(huge), huge)).status, 413);
});

Deno.test("#song= fallback: the whole song in the link, back identical", async () => {
  const song = demo();
  const frag = await songToFragment(song);
  assert(/^[\w-]+$/.test(frag), "base64url only");
  assertEquals(await songFromFragment(frag), shareable(song));
  let threw = false;
  try { await songFromFragment(frag.slice(0, frag.length / 2)); } catch { threw = true; }
  assert(threw, "a cut-off link is refused");
});

// ---------------------------------------------------------------- QR code

Deno.test("QR: format and version bits, alignment positions and error correction match the standard", () => {
  // Level M format bits for masks 0-7 (ISO/IEC 18004 table C.1).
  const want = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
  assertEquals([0, 1, 2, 3, 4, 5, 6, 7].map((m) => formatBits(m).toString(2).padStart(15, "0")), want);
  assertEquals(versionBits(7), 0x07c94);
  assertEquals(alignmentPositions(7), [6, 22, 38]);
  assertEquals(alignmentPositions(10), [6, 28, 50]);
  // "HELLO WORLD", version 1-M: the textbook data codewords and their 10 EC codewords.
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assertEquals(rsRemainder(data, rsDivisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

Deno.test("QR: a share link reads back out of the symbol (patterns, format, unmasked data)", () => {
  const url = "https://tilt-jam.pages.dev/s/7K3QX9AB";
  const q = makeQr(url)!;
  assert(q, "fits");
  const { dark: fixed, fn } = functionPatterns(q.version, q.mask);
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (fn[y][x]) assertEquals(q.dark[y][x], fixed[y][x]);
  // The format bits in the symbol name the mask that was used.
  let f = 0;
  for (let i = 0; i <= 5; i++) f |= (q.dark[i][8] ? 1 : 0) << i;
  f |= (q.dark[7][8] ? 1 : 0) << 6; f |= (q.dark[8][8] ? 1 : 0) << 7; f |= (q.dark[8][7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) f |= (q.dark[8][14 - i] ? 1 : 0) << i;
  assertEquals(f, formatBits(q.mask));
  // Unmask the data modules in placement order: the codewords come back, and the text with them.
  const bits: number[] = [];
  for (const [x, y] of zigzag(q.size, fn)) bits.push(q.dark[y][x] !== maskAt(q.mask, x, y) ? 1 : 0);
  const cw = codewords(new TextEncoder().encode(url), q.version);
  const read = cw.map((_, i) => parseInt(bits.slice(i * 8, i * 8 + 8).join(""), 2));
  assertEquals(read, cw);
  // Byte mode, the length, then the text (1 block at this size: data comes first).
  const s = bits.join("");
  assertEquals(s.slice(0, 4), "0100");
  const n = parseInt(s.slice(4, 12), 2);
  assertEquals(n, url.length);
  const text = new TextDecoder().decode(Uint8Array.from({ length: n }, (_, i) => parseInt(s.slice(12 + i * 8, 20 + i * 8), 2)));
  assertEquals(text, url);
});

Deno.test("samples: the 2 GB total cap refuses new samples (507), already-stored ones still pass", async () => {
  const { SAMPLES_TOTAL_CAP } = await import("../src/server/shareapi.ts");
  const kv = memKV(), r2 = memR2(), env: ShareEnv = { SHARES: kv, SAMPLES: r2 };
  const a = packSample("a", 44100, new Float32Array(100).fill(0.1)), b = packSample("b", 44100, new Float32Array(100).fill(0.2));
  const put = async (bytes: Uint8Array) => { const k = await sampleKey(bytes); return (await putSampleBlob(new Request(`https://x/api/sample/${k}`, { method: "PUT", body: bytes as Uint8Array<ArrayBuffer> }), k, env)).status; };
  assertEquals(await put(a), 201);
  assertEquals(Number(kv.m.get("_stats:sampleBytes")), a.length);
  kv.m.set("_stats:sampleBytes", String(SAMPLES_TOTAL_CAP - 10)); // nearly full
  assertEquals(await put(b), 507);
  assertEquals(await put(a), 200); // the same sample again: nothing new to store
});

Deno.test("an opened shared song, shared again untouched, keeps its code", async () => {
  const { normalizeSong } = await import("../src/engine/model.ts");
  const env: ShareEnv = { SHARES: memKV(), SAMPLES: memR2() };
  const song = demo(); // not normalized, as a song built in code can be
  const { code } = await (await postShare(post({ song }), env)).json();
  const opened = normalizeSong((await (await getShare(code, env)).json()).song); // what the app does when it opens it
  Object.assign(opened, { libId: "s999", sharedFrom: code });
  assertEquals(await songCode(opened), code);
  assertEquals((await (await postShare(post({ song: opened }), env)).json()).code, code);
});

Deno.test("shared songs carry how they open (whole song or scene 1), the chain and its repeats", async () => {
  const env: ShareEnv = { SHARES: memKV(), SAMPLES: memR2() };
  const song = demo();
  song.scenes.push({ id: 77, name: "Chorus", repeat: 1, tempo: null, fadeIn: false, fadeOut: false });
  song.chain = [{ sceneId: song.scenes[0].id, repeat: 2 }, { sceneId: 77, repeat: 4 }, { sceneId: song.scenes[0].id, repeat: 1 }];
  song.songLoop = true;
  const asSong = { ...song, playAs: "song" as const }, asScene = { ...song, playAs: "scene" as const };
  assertNotEquals(await songCode(asSong), await songCode(asScene)); // each choice has its own code
  const { code } = await (await postShare(post({ song: asSong }), env)).json();
  const back = (await (await getShare(code, env)).json()).song;
  assertEquals([back.playAs, back.songLoop, back.chain], ["song", true, song.chain]);
  assertEquals((await songFromFragment(await songToFragment(asScene))).playAs, "scene");
  assertEquals(validateSong({ ...asSong, playAs: "forever" }), "bad play setting");
});
