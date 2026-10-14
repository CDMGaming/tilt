// DICE: roll a starting setup (key, scale, tempo, swing, instrument lineup,
// each instrument's preset), with locks, and a share code that reproduces it.

import { INSTRUMENTS } from "./instruments";
import { newSong, type InstrumentKind, type Song } from "./model";
import { SCALES } from "./music";
import { Rng, randomSeed } from "./rng";
import { CHALLENGES, dealChallenges } from "./challenges";
import { addTrack, ensureClip } from "./songops";

export interface Setup {
  key: number;
  scale: string;
  tempo: number;
  swing: number;
  lineup: { kind: InstrumentKind; preset: number }[];
  cards?: string[]; // challenge card ids
}

export type LockKey = "key" | "scale" | "tempo" | "swing" | "lineup" | "presets" | "cards";
export type Locks = Record<LockKey, boolean>;
export const NO_LOCKS: Locks = { key: false, scale: false, tempo: false, swing: false, lineup: false, presets: false, cards: false };

// Instruments the dice may pick. Grows as later phases add instruments.
// The sampler stays out of the dice (it is for sounds you bring); everything else can be rolled.
export const DICE_KINDS: InstrumentKind[] = ["drums", "analog", "acid", "wobble", "poly", "pad", "fm", "wave", "lead", "chip"];

const SCALE_WEIGHTS: [string, number][] = [
  ["minor", 6], ["major", 4], ["dorian", 3], ["minpenta", 3], ["majpenta", 2], ["phrygian", 2],
  ["mixolydian", 2], ["harmminor", 2], ["lydian", 1], ["blues", 2],
];

// Tempo bands with a typical swing tendency, so rolls feel like a "style".
const TEMPO_BANDS: [[number, number, number], number][] = [
  [[70, 95, 0.6], 2], // lo-fi / hip-hop: often swung
  [[96, 118, 0.3], 3],
  [[119, 132, 0.2], 4], // house / techno
  [[133, 150, 0.15], 2],
  [[151, 175, 0.1], 1], // dnb-ish
];

export const DICE: LockKey[] = ["key", "scale", "tempo", "swing", "lineup", "presets", "cards"];

/**
 * NUDGE: re-roll just one die, keeping everything else as it is. Tries a few
 * seeds so the die actually changes (a die can land on the same face).
 */
export function nudge(prev: Setup, die: LockKey, seed: number = randomSeed(), cardCount = 0): Setup {
  const only = Object.fromEntries(DICE.map((k) => [k, k !== die])) as Locks;
  let next = roll(prev, only, seed, cardCount);
  for (let i = 1; i < 8 && encodeSetup(next) === encodeSetup(prev); i++) next = roll(prev, only, seed + i * 7919, cardCount);
  return next;
}

export function roll(prev: Setup | null, locks: Locks, seed: number = randomSeed(), cardCount = 0): Setup {
  const r = new Rng(seed);
  const keep = (k: LockKey) => prev !== null && locks[k];
  const [lo, hi, swingChance] = r.weighted(TEMPO_BANDS);
  const tempo = keep("tempo") ? prev!.tempo : r.int(lo, hi);
  const swing = keep("swing") ? prev!.swing : r.chance(swingChance) ? r.pick([15, 25, 35, 45, 55]) : 0;
  const key = keep("key") ? prev!.key : r.int(0, 11);
  const scale = keep("scale") ? prev!.scale : r.weighted(SCALE_WEIGHTS);
  let kinds: InstrumentKind[];
  if (keep("lineup")) kinds = prev!.lineup.map((l) => l.kind);
  else {
    // A band, not the whole catalogue: one drums, one bass, one harmony
    // instrument; sometimes a 4th (lead or another synth), occasionally only 2.
    const of = (g: string) => DICE_KINDS.filter((k) => INSTRUMENTS[k].group === g);
    kinds = [r.pick(of("drums")), r.pick(of("bass")), r.pick(of("harmony"))];
    if (r.chance(0.35)) kinds.push(r.pick([...of("lead"), ...of("harmony"), ...of("lead")]));
    else if (r.chance(0.12)) kinds.splice(r.int(1, 2), 1);
    if (r.chance(0.2)) kinds.sort(() => r.next() - 0.5);
  }
  // Each track gets its own sound: the same instrument twice never repeats a preset.
  const used: { kind: InstrumentKind; preset: number }[] = [];
  const lineup = kinds.map((kind, i) => {
    const old = prev?.lineup[i];
    const taken = used.filter((u) => u.kind === kind).map((u) => u.preset);
    const kept = keep("presets") && old && old.kind === kind && !taken.includes(old.preset) ? old.preset : null;
    const preset = kept ?? pickPreset(kind, taken, () => r.next());
    used.push({ kind, preset });
    return { kind, preset };
  });
  const cards = keep("cards") && prev?.cards ? prev.cards : cardCount ? dealChallenges(cardCount, seed) : undefined;
  return cards?.length ? { key, scale, tempo, swing, lineup, cards } : { key, scale, tempo, swing, lineup };
}

/** A random preset index for `kind`, avoiding `avoid` while there are others left. */
export function pickPreset(kind: InstrumentKind, avoid: number[], rand: () => number = Math.random): number {
  const n = INSTRUMENTS[kind].presets.length;
  const free = Array.from({ length: n }, (_, i) => i).filter((i) => !avoid.includes(i));
  const pool = free.length ? free : Array.from({ length: n }, (_, i) => i);
  return pool[Math.floor(rand() * pool.length)];
}

/** Presets already used by tracks of this instrument (optionally ignoring one track). */
export function usedPresets(song: Song, kind: InstrumentKind, exceptTrackId?: number): number[] {
  return song.tracks
    .filter((t) => t.kind === kind && t.id !== exceptTrackId)
    .map((t) => INSTRUMENTS[kind].presets.findIndex((p) => p.name === t.preset))
    .filter((i) => i >= 0);
}

// ---------- share codes: the full setup in ~10-14 characters ----------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
// Order is part of the share-code format: only ever append.
const KIND_CODE: InstrumentKind[] = ["drums", "acid", "poly", "lead", "analog", "wobble", "pad", "chip", "fm", "wave", "sampler"];

export function encodeSetup(s: Setup): string {
  const bytes = [
    1, // format version
    (s.key & 15) | (Math.max(0, SCALES.findIndex((x) => x.id === s.scale)) << 4),
    Math.max(0, Math.min(255, s.tempo - 40)),
    Math.max(0, Math.min(100, Math.round(s.swing))),
    s.lineup.length,
    ...s.lineup.map((l) => (KIND_CODE.indexOf(l.kind) << 4) | (l.preset & 15)),
    // Optional tail: challenge cards (count, then indexes into CHALLENGES, which is append-only).
    ...(s.cards?.length ? [s.cards.length, ...s.cards.map((c) => Math.max(0, CHALLENGES.findIndex((x) => x.id === c)))] : []),
  ];
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 5) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out.replace(/(.{4})(?=.)/g, "$1-");
}

export function decodeSetup(code: string): Setup | null {
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  let bits = "";
  for (const c of clean) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  if (bytes[0] !== 1 || bytes.length < 5) return null;
  const n = bytes[4];
  if (n < 1 || n > 8 || bytes.length < 5 + n) return null;
  const scale = SCALES[bytes[1] >> 4];
  if (!scale) return null;
  const lineup = bytes.slice(5, 5 + n).map((b) => ({ kind: KIND_CODE[b >> 4], preset: b & 15 }));
  if (lineup.some((l) => !l.kind)) return null;
  const setup: Setup = { key: bytes[1] & 15, scale: scale.id, tempo: bytes[2] + 40, swing: bytes[3], lineup };
  const nc = bytes[5 + n] ?? 0;
  if (nc > 0 && nc <= 5 && bytes.length >= 6 + n + nc) {
    const cards = bytes.slice(6 + n, 6 + n + nc).map((i) => CHALLENGES[i]?.id).filter((x): x is string => !!x);
    if (cards.length) setup.cards = cards;
  }
  return setup;
}

/** A new song from a setup: one scene, one empty one-bar clip per track. */
export function songFromSetup(s: Setup): Song {
  const song = newSong();
  song.key = s.key;
  song.scale = s.scale;
  song.tempo = s.tempo;
  song.swing = s.swing;
  song.setupCode = encodeSetup(s);
  if (s.cards?.length) song.challenges = [...s.cards];
  for (const l of s.lineup) {
    const t = addTrack(song, l.kind, l.preset);
    if (t) ensureClip(song, t, song.scenes[0].id);
  }
  return song;
}
