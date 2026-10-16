// DICE: roll a starting setup (key, scale, tempo, swing, instrument lineup,
// each instrument's preset), with locks, and a share code that reproduces it.

import { INSTRUMENTS } from "./instruments";
import { newSong, type InstrumentKind, type Song } from "./model";
import { SCALES } from "./music";
import { Rng, randomSeed } from "./rng";
import { CHALLENGES, dealChallenges } from "./challenges";
import { addTrack, ensureClip } from "./songops";
import { DICE_KINDS, generatePreset, pickSound, slotRole, soundKey, soundRoles, type PickOptions, type Role, type SoundRef } from "./sounds";

export { DICE_KINDS };

export interface Setup {
  key: number;
  scale: string;
  tempo: number;
  swing: number;
  /** Each track's instrument and sound: a built-in preset, or a generated one (`gen`). */
  lineup: SoundRef[];
  cards?: string[]; // challenge card ids
}

export type LockKey = "key" | "scale" | "tempo" | "swing" | "lineup" | "presets" | "cards";
export type Locks = Record<LockKey, boolean>;
export const NO_LOCKS: Locks = { key: false, scale: false, tempo: false, swing: false, lineup: false, presets: false, cards: false };

/** What a lineup slot can be set to by hand: every instrument, the sampler included. */
export const ALL_KINDS_FOR_SETUP: InstrumentKind[] = [...DICE_KINDS, "sampler"];

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

// ---------- the setup screen: hold what you like, NUDGE re-rolls the rest ----------

/** The plain fields you can hold (the lineup and its sounds are held slot by slot, see LineupSpec). */
export type HoldKey = "key" | "scale" | "tempo" | "swing";
export type Holds = Record<HoldKey, boolean>;
export const NO_HOLDS: Holds = { key: false, scale: false, tempo: false, swing: false };
export const MAX_SLOTS = 8;

/**
 * The lineup: how many instruments (a fixed count, or a random one between min and
 * max), and per slot a chosen instrument / preset or null ("?", filled on NUDGE).
 */
export interface LineupSpec {
  count: number | null;
  min: number;
  max: number;
  slots: (InstrumentKind | null)[];
  presets: (number | null)[];
  /** A chosen generated sound (its seed), alongside `presets` (the preset it grew from). */
  gens?: (number | null)[];
  /** A "?" slot can ask for a role: NUDGE then picks a sound in that role from any instrument. */
  roles?: (Role | null)[];
}

export const defaultSpec = (): LineupSpec => ({
  count: null, min: 3, max: 5, slots: Array(MAX_SLOTS).fill(null), presets: Array(MAX_SLOTS).fill(null),
  gens: Array(MAX_SLOTS).fill(null), roles: Array(MAX_SLOTS).fill(null),
});

/** Options for NUDGE: recent sounds to avoid, the generated share. */
export type NudgeOptions = PickOptions;

/** Every slot up to the count chosen: NUDGE won't change the lineup. */
export const lineupHeld = (spec: LineupSpec, n: number) => spec.count !== null && spec.slots.slice(0, n).every((k) => k !== null);
export const soundsHeld = (spec: LineupSpec, n: number) => spec.presets.slice(0, n).every((p) => p !== null);

/**
 * NUDGE: re-roll every field that isn't held. Chosen lineup slots and sounds stay put.
 * A "?" slot gets a role first (drums, bass, then lead / keys / pad / pluck / arp, fx rare;
 * or the role asked for), then a sound in that role from an instrument the band doesn't
 * have yet: built in, fresh ones first, or generated (`genShare` of the time).
 */
export function nudgeSetup(prev: Setup | null, holds: Holds, spec: LineupSpec, seed: number = randomSeed(), cardCount = 0, opts: NudgeOptions = {}): Setup {
  const r = new Rng(seed);
  const keep = (k: HoldKey) => prev !== null && holds[k];
  const [lo, hi, swingChance] = r.weighted(TEMPO_BANDS);
  const tempo = keep("tempo") ? prev!.tempo : r.int(lo, hi);
  const swing = keep("swing") ? prev!.swing : r.chance(swingChance) ? r.pick([15, 25, 35, 45, 55]) : 0;
  const key = keep("key") ? prev!.key : r.int(0, 11);
  const scale = keep("scale") ? prev!.scale : r.weighted(SCALE_WEIGHTS);
  const clampN = (x: number) => Math.max(1, Math.min(MAX_SLOTS, Math.round(x)));
  const n = spec.count !== null ? clampN(spec.count) : r.int(clampN(Math.min(spec.min, spec.max)), clampN(Math.max(spec.min, spec.max)));
  const lineup = fillLineup(n, spec, () => null, r, opts);
  const cards = cardCount ? dealChallenges(cardCount, seed) : undefined;
  return cards?.length ? { key, scale, tempo, swing, lineup, cards } : { key, scale, tempo, swing, lineup };
}

/**
 * The lineup: chosen slots first (so the band's roles count them), then each "?" slot by role.
 * `had(i, kind)` is a slot's current sound, kept while the instrument stays (conformSetup).
 */
function fillLineup(n: number, spec: LineupSpec, had: (i: number, kind: InstrumentKind) => SoundRef | null, r: Rng, opts: PickOptions): SoundRef[] {
  const out: (SoundRef | null)[] = Array(n).fill(null);
  const taken = new Set<string>(opts.taken ?? []);
  const have: Role[] = [];
  const put = (i: number, s: SoundRef) => { out[i] = s; taken.add(soundKey(s)); have.push(...soundRoles(s)); };
  // Chosen instruments: their chosen sound, else the one they had, else one in the slot's role (if asked).
  for (let i = 0; i < n; i++) {
    const kind = spec.slots[i];
    if (!kind) continue;
    const p = spec.presets[i], g = spec.gens?.[i];
    const chosen: SoundRef | null = p !== null && p !== undefined && p < INSTRUMENTS[kind].presets.length
      ? (g !== null && g !== undefined ? { kind, preset: p, gen: g } : { kind, preset: p }) : null;
    const old = had(i, kind);
    put(i, chosen ?? (old && !taken.has(soundKey(old)) ? old : pickSound(spec.roles?.[i] ?? null, r, { ...opts, taken }, [kind])!));
  }
  // "?" slots: a role, then a sound in it from an instrument the band lacks (any, if none is left).
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    const role = spec.roles?.[i] ?? slotRole(i, have, r);
    const band = out.filter((s): s is SoundRef => !!s).map((s) => s.kind);
    const unused = DICE_KINDS.filter((k) => !band.includes(k));
    put(i, pickSound(role, r, { ...opts, taken }, unused.length ? unused : DICE_KINDS) ?? pickSound(null, r, { ...opts, taken })!);
  }
  return out as SoundRef[];
}

/**
 * After an edit to the lineup (count, a slot's instrument or sound): apply it right away,
 * keeping every other slot as it is; new slots are filled, extra ones dropped.
 */
export function conformSetup(s: Setup, spec: LineupSpec, seed: number = randomSeed(), opts: PickOptions = {}, reroll?: number): Setup {
  const r = new Rng(seed);
  const n = spec.count !== null ? Math.max(1, Math.min(MAX_SLOTS, spec.count)) : Math.max(spec.min, Math.min(spec.max, s.lineup.length));
  // Every slot that exists keeps its instrument unless one is chosen (or it's the one to `reroll`);
  // a slot whose instrument changed gets a new sound.
  const keepKind = (i: number) => (i < n && i !== reroll ? s.lineup[i]?.kind ?? null : null);
  const now: LineupSpec = { ...spec, slots: Array.from({ length: MAX_SLOTS }, (_, i) => spec.slots[i] ?? keepKind(i)) };
  const lineup = fillLineup(n, now, (i, kind) => (i !== reroll && s.lineup[i]?.kind === kind ? s.lineup[i] : null), r, opts);
  return { ...s, lineup };
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
const KIND_CODE: InstrumentKind[] = ["drums", "acid", "poly", "lead", "analog", "wobble", "pad", "chip", "fm", "wave", "sampler", "epiano", "pluck", "organ", "anthem", "patch", "vox", "boom"];

/**
 * The setup as a short code. Format 1 (the original): one byte per slot, 4 bits instrument
 * and 4 bits preset. Format 2, used only when a setup doesn't fit format 1 (a generated
 * sound, a preset past the 16th, an instrument past the 16th): per slot an instrument byte
 * and a full preset byte, or for a generated sound the instrument byte with its top bit set
 * and the two-byte seed. Both decode.
 */
export function encodeSetup(s: Setup): string {
  const v1 = s.lineup.every((l) => l.gen === undefined && l.preset < 16 && KIND_CODE.indexOf(l.kind) < 16);
  const slots = v1
    ? s.lineup.map((l) => (KIND_CODE.indexOf(l.kind) << 4) | (l.preset & 15))
    : s.lineup.flatMap((l) => l.gen !== undefined
      ? [0x80 | KIND_CODE.indexOf(l.kind), (l.gen >> 8) & 255, l.gen & 255]
      : [KIND_CODE.indexOf(l.kind), Math.min(255, l.preset)]);
  const bytes = [
    v1 ? 1 : 2, // format version
    (s.key & 15) | (Math.max(0, SCALES.findIndex((x) => x.id === s.scale)) << 4),
    Math.max(0, Math.min(255, s.tempo - 40)),
    Math.max(0, Math.min(100, Math.round(s.swing))),
    s.lineup.length,
    ...slots,
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
  const ver = bytes[0];
  if ((ver !== 1 && ver !== 2) || bytes.length < 5) return null;
  const n = bytes[4];
  if (n < 1 || n > 8) return null;
  const scale = SCALES[bytes[1] >> 4];
  if (!scale) return null;
  const lineup: SoundRef[] = [];
  let at = 5;
  for (let i = 0; i < n; i++) {
    if (at >= bytes.length) return null;
    if (ver === 1) {
      const b = bytes[at++], kind = KIND_CODE[b >> 4];
      if (!kind) return null;
      lineup.push({ kind, preset: b & 15 });
      continue;
    }
    const k = bytes[at++], kind = KIND_CODE[k & 0x7f];
    if (!kind) return null;
    if (k & 0x80) {
      if (at + 1 >= bytes.length) return null;
      const gen = (bytes[at] << 8) | bytes[at + 1];
      at += 2;
      lineup.push({ kind, preset: generatePreset(kind, gen).base, gen });
    } else {
      if (at >= bytes.length || bytes[at] >= INSTRUMENTS[kind].presets.length) return null;
      lineup.push({ kind, preset: bytes[at++] });
    }
  }
  const setup: Setup = { key: bytes[1] & 15, scale: scale.id, tempo: bytes[2] + 40, swing: bytes[3], lineup };
  const nc = bytes[at] ?? 0;
  if (nc > 0 && nc <= 5 && bytes.length >= at + 1 + nc) {
    const cards = bytes.slice(at + 1, at + 1 + nc).map((i) => CHALLENGES[i]?.id).filter((x): x is string => !!x);
    if (cards.length) setup.cards = cards;
  }
  return setup;
}

/**
 * The setup a song is at now, so it can be shared as a code: its key, scale, tempo,
 * swing, first 8 instruments and their sounds (an edited or custom sound comes back
 * as the nearest one: the generated sound or preset it was loaded from, else the first).
 */
export function setupFromSong(song: Song): Setup | null {
  const lineup = song.tracks.filter((t) => KIND_CODE.includes(t.kind)).slice(0, 8).map((t): SoundRef => {
    if (t.gen !== undefined) return { kind: t.kind, preset: generatePreset(t.kind, t.gen).base, gen: t.gen };
    const i = INSTRUMENTS[t.kind].presets.findIndex((p) => p.name === t.preset);
    return { kind: t.kind, preset: i >= 0 ? i : 0 };
  });
  if (!lineup.length) return null;
  const setup: Setup = { key: song.key, scale: song.scale, tempo: Math.max(40, Math.min(295, Math.round(song.tempo))), swing: Math.round(song.swing), lineup };
  if (song.challenges?.length) setup.cards = [...song.challenges];
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
    if (!t) continue;
    if (l.gen !== undefined) {
      const g = generatePreset(l.kind, l.gen);
      t.params = g.params;
      t.preset = g.name;
      t.gen = l.gen;
    }
    ensureClip(song, t, song.scenes[0].id);
  }
  return song;
}
