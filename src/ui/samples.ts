// User samples for the Grab sampler: stored in IndexedDB (outside the song,
// so undo snapshots stay small), keyed by a hash of their audio.

import { STORE_PREFIX } from "./storage";

export interface StoredSample { id: string; name: string; rate: number; data: Float32Array }

const DB = STORE_PREFIX + "samples";
const MAX_SECONDS = 20;
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("samples", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction("samples", mode).objectStore("samples"));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function getSample(id: string): Promise<StoredSample | null> {
  return (await tx<StoredSample | undefined>("readonly", (s) => s.get(id))) ?? null;
}

export async function listSamples(): Promise<{ id: string; name: string; seconds: number }[]> {
  const all = await tx<StoredSample[]>("readonly", (s) => s.getAll());
  return all.map((x) => ({ id: x.id, name: x.name, seconds: x.data.length / x.rate })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Store audio; the id is a hash of the samples, so the same sound is only stored once. */
export async function putSample(name: string, data: Float32Array, rate: number, keepId?: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", data.slice().buffer);
  // keepId: re-importing a song file keeps the id its pads refer to.
  const id = keepId ?? [...new Uint8Array(hash)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
  await tx("readwrite", (s) => s.put({ id, name: name.slice(0, 40), rate, data }));
  return id;
}

/** Decode an audio file (WAV, MP3, OGG, FLAC: whatever the browser reads) to mono, max 20 s. */
export async function decodeFile(ctx: BaseAudioContext, file: File): Promise<{ name: string; data: Float32Array; rate: number }> {
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const n = Math.min(buf.length, Math.round(buf.sampleRate * MAX_SECONDS));
  const data = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) data[i] += ch[i] / buf.numberOfChannels;
  }
  return { name: file.name.replace(/\.[^.]+$/, ""), data, rate: buf.sampleRate };
}

/** Base64 of 16-bit PCM, for embedding user samples in exported song files. */
export function toB64(data: Float32Array): string {
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
  const bytes = new Uint8Array(pcm.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer);
  return Float32Array.from(pcm, (v) => v / 32767);
}

/** A pad's display name from its reference. */
export function sampleLabel(ref: string | undefined, names?: string[], i?: number): string {
  if (!ref) return "empty";
  if (ref.startsWith("sfx:")) { const n = ref.slice(4).replace(/-/g, " "); return n.charAt(0).toUpperCase() + n.slice(1); }
  return (i !== undefined && names?.[i]) || "Sample";
}
