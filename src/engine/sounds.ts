// Sounds by role: every preset's role tags, generated presets from per-instrument
// recipes, Mutate, and the pickers the dice and NUDGE use (role first, then a sound
// with that role from any instrument, avoiding the ones heard in recent rolls).

import { INSTRUMENTS, defaultParams, fromUnit, paramDef, toUnit } from "./instruments";
import type { InstrumentKind } from "./model";
import { Rng } from "./rng";

export type Role = "drums" | "bass" | "lead" | "pad" | "keys" | "pluck" | "arp" | "fx";
export const ROLES: Role[] = ["drums", "bass", "lead", "pad", "keys", "pluck", "arp", "fx"];
export const ROLE_LABEL: Record<Role, string> = {
  drums: "Drums", bass: "Bass", lead: "Lead", pad: "Pad", keys: "Keys", pluck: "Pluck", arp: "Arp", fx: "FX",
};

/** Instruments the dice may pick (the sampler is for sounds you bring). */
export const DICE_KINDS: InstrumentKind[] = ["drums", "analog", "acid", "wobble", "poly", "pad", "fm", "wave", "lead", "chip"];

// Role tags per preset, by name. A preset not listed gets its instrument's default.
const DEFAULT_ROLE: Record<InstrumentKind, Role[]> = {
  drums: ["drums"], analog: ["drums"], acid: ["bass"], wobble: ["bass"], poly: ["keys"], pad: ["pad"],
  fm: ["keys"], wave: ["lead"], lead: ["lead"], chip: ["lead"], sampler: ["fx"],
};
const TAGS: Partial<Record<InstrumentKind, Record<string, Role[]>>> = {
  acid: { "Square Pluck": ["bass", "pluck"], "Acid Arp": ["bass", "arp"], "Bounce Arp": ["bass", "arp"], "Chirp": ["arp", "lead"] },
  poly: {
    "Stab Club": ["keys", "pluck"], "Slow Strings": ["pad"], "Soft Pad": ["pad"], "Pluck Chords": ["pluck", "keys"],
    "Lead Saw": ["lead"],
  },
  lead: { "Laser Sweep": ["lead", "fx"], "Pluck Lead": ["pluck", "lead"], "Chip-ish": ["lead", "arp"] },
  wobble: { "Robot": ["bass", "fx"], "Laser Wob": ["bass", "fx"] },
  pad: { "Short Keys": ["keys"], "Bit Fog": ["pad", "fx"] },
  chip: {
    "Major Jump": ["arp"], "Minor Jump": ["arp"], "Octave Bounce": ["arp"], "Power Up": ["fx"], "Laser Blip": ["fx"],
    "Tri Bass": ["bass"], "Noise Snare": ["fx"],
  },
  fm: { "Marimba": ["pluck", "keys"], "Metal Clang": ["fx"], "FM Bass": ["bass"], "Soft Pad": ["pad"], "Wind Chime": ["pluck", "fx"] },
  wave: {
    "Sweep Pluck": ["pluck"], "Slow Scan": ["pad"], "Digital Bass": ["bass"], "Wide Pad": ["pad"], "Vowel Keys": ["keys"],
    "Glitch Stab": ["fx", "pluck"],
  },
};

export function presetRoles(kind: InstrumentKind, index: number): Role[] {
  const p = INSTRUMENTS[kind].presets[index];
  return (p && TAGS[kind]?.[p.name]) ?? DEFAULT_ROLE[kind];
}

/** A built-in sound (`preset`) or a generated one (`gen`: the recipe seed; `preset` is then the one it grew from). */
export interface SoundRef { kind: InstrumentKind; preset: number; gen?: number }

export const soundKey = (s: SoundRef) => s.gen !== undefined ? `${s.kind}~${s.gen}` : `${s.kind}:${s.preset}`;
export const soundRoles = (s: SoundRef): Role[] => presetRoles(s.kind, s.gen !== undefined ? genBase(s.kind, s.gen) : s.preset);

// ------------------------------------------------------------ recipes

/**
 * What a generated preset may change, per instrument: a parameter and how far it may
 * wander from the preset it grows from (in knob travel, 0..1), optionally clamped, or a
 * switch with the chance it flips and the values it may take. Everything a recipe
 * doesn't name (level, envelope shape on pads, hidden voicing) stays as the parent had it,
 * so a generated sound keeps its parent's role and loudness.
 */
type Move = { id: string; spread: number; lo?: number; hi?: number } | { id: string; flip: number; values: number[] };
const knob = (id: string, spread: number, lo?: number, hi?: number): Move => ({ id, spread, lo, hi });
const pick = (id: string, flip: number, values: number[]): Move => ({ id, flip, values });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const KIT_SOUNDS = [[0, 1, 2], [3, 4], [5, 6], [7, 9], [8], [10, 11], [6, 12, 13], [12, 13, 14, 15]];

export const RECIPES: Partial<Record<InstrumentKind, Move[]>> = {
  drums: KIT_SOUNDS.flatMap((sounds, i) => [
    pick(`p${i}smp`, 0.35, sounds), knob(`p${i}tune`, 0.08), knob(`p${i}decay`, 0.12), knob(`p${i}drive`, 0.15, 0, 0.6), knob(`p${i}tone`, 0.12, 0.2, 0.8),
  ]),
  analog: [
    knob("kTune", 0.12), knob("kDecay", 0.18), knob("kBend", 0.22), knob("kDrive", 0.2, 0, 0.7), knob("sTune", 0.18), knob("sDecay", 0.18),
    knob("sSnappy", 0.22), knob("sTone", 0.2), knob("tTune", 0.2), knob("tDecay", 0.2), knob("tBend", 0.2), knob("tNoise", 0.2, 0, 0.6),
    knob("pTune", 0.22), knob("pDecay", 0.18), knob("pDepth", 0.22), pick("pShape", 0.3, [0, 1, 2, 3]),
  ],
  acid: [
    pick("wave", 0.3, [0, 1]), knob("cutoff", 0.2, 0.15, 0.75), knob("reso", 0.22, 0.1, 0.92), knob("envmod", 0.25), knob("decay", 0.2, 0.05, 0.8),
    knob("accent", 0.25), knob("bite", 0.25), knob("glide", 0.12), knob("sub", 0.25), pick("arpMode", 0.3, [0, 1, 2, 3]),
  ],
  poly: [
    pick("wave2", 0.25, [0, 1, 2, 3]), pick("semi2", 0.2, [-12, 0, 0, 5, 7, 12]), knob("detune", 0.2, 0, 0.6),
    knob("mix", 0.25), knob("cutoff", 0.1, 0.4, 0.95), knob("reso", 0.15, 0, 0.6), knob("fenv", 0.15), knob("fdecay", 0.15),
    knob("attack", 0.06), knob("release", 0.08), knob("width", 0.2), pick("spread", 0.25, [0, 1]),
  ],
  lead: [
    knob("sync", 0.25), knob("syncEnv", 0.25), pick("unison", 0.2, [0, 1, 2, 3]), knob("detune", 0.2), knob("spread", 0.2),
    knob("cutoff", 0.18, 0.35, 1), knob("reso", 0.18, 0, 0.75), knob("fenv", 0.22), knob("envDecay", 0.2), knob("vibDepth", 0.12, 0, 0.5),
    knob("vibRate", 0.15), knob("glide", 0.12, 0, 0.6),
  ],
  wobble: [
    pick("wave", 0.25, [0, 1, 2]), knob("sub", 0.2), pick("xWave", 0.3, [0, 1, 2]), pick("xTune", 0.3, [-12, 0, 5, 7, 12, 19, 24]),
    knob("xmod", 0.25), knob("cutoff", 0.18, 0.2, 0.8), knob("reso", 0.18, 0, 0.8), knob("crush", 0.22, 0, 0.7), knob("wobble", 0.18, 0.3, 1),
    pick("wobRate", 0.4, [1, 2, 3, 4, 5]), pick("wobShape", 0.3, [0, 1, 2, 3]),
  ],
  pad: [
    pick("wave", 0.25, [0, 1, 2, 3]), knob("low", 0.22), knob("hi", 0.2), knob("higher", 0.22), knob("noise", 0.15, 0, 0.5),
    knob("detune", 0.22), knob("cutoff", 0.18, 0.2, 0.9), knob("reso", 0.12, 0, 0.6), knob("lofi", 0.25), knob("wow", 0.25),
    knob("revTime", 0.18), knob("revLevel", 0.18, 0.1, 0.8), knob("attack", 0.06), knob("release", 0.06),
  ],
  chip: [
    pick("wave", 0.2, [0, 1, 2, 3]), knob("jumpRate", 0.18), knob("vibDepth", 0.15, 0, 0.5), knob("vibRate", 0.18),
    knob("decay", 0.18), knob("sustain", 0.18), knob("crush", 0.22, 0, 0.8), knob("sweepTime", 0.15),
  ],
  fm: [
    pick("ratioC", 0.15, [1, 2]), pick("ratioM", 0.35, range(0, 14)), knob("index", 0.18, 0.05, 0.8), knob("indexDecay", 0.22),
    knob("indexSus", 0.18, 0, 0.6), knob("feedback", 0.18, 0, 0.5), knob("velIndex", 0.2), knob("detune", 0.2), knob("decay", 0.15), knob("release", 0.12),
  ],
  wave: [
    pick("table", 0.5, range(0, 6)), knob("pos", 0.3), knob("envAmt", 0.25), knob("envDecay", 0.22), knob("lfoAmt", 0.2, 0, 0.7),
    knob("lfoRate", 0.22), knob("detune", 0.2), knob("cutoff", 0.18, 0.3, 1), knob("reso", 0.15, 0, 0.7),
  ],
};

/** Roughly normal, -1..1 (three uniforms). */
const wobble = (r: Rng) => (r.next() + r.next() + r.next() - 1.5) / 1.5;

/** Move `params` by a recipe, `amount` scaling how far (1 = a generated preset, ~0.35 = Mutate). */
function vary(kind: InstrumentKind, params: Record<string, number>, r: Rng, amount: number, only?: Set<string>) {
  for (const m of RECIPES[kind] ?? []) {
    if (only && !only.has(m.id)) continue;
    const p = paramDef(kind, m.id);
    if (!p) continue;
    const v = params[m.id] ?? p.def;
    if ("flip" in m) {
      if (r.chance(m.flip * amount)) params[m.id] = r.pick(m.values);
    } else {
      const u = toUnit(p, v) + wobble(r) * m.spread * amount;
      params[m.id] = fromUnit(p, Math.max(m.lo ?? 0, Math.min(m.hi ?? 1, u)));
    }
  }
  return params;
}

// ------------------------------------------------------------ generated presets

const ADJ = [
  "Dusty", "Neon", "Velvet", "Rusty", "Hollow", "Bright", "Midnight", "Sugar", "Static", "Glass", "Paper", "Copper", "Lunar",
  "Fuzzy", "Liquid", "Wired", "Soft", "Broken", "Golden", "Tiny", "Heavy", "Lazy", "Sly", "Frozen", "Electric", "Rubber",
  "Smoky", "Silver", "Wild", "Quiet", "Crooked", "Sunday", "Cobalt", "Feral", "Plastic", "Woolly",
];
const NOUN: Record<Role, string[]> = {
  drums: ["Kit", "Box", "Room", "Beat", "Crew", "Rack", "Set", "Cans"],
  bass: ["Bass", "Low", "Thud", "Rumble", "Floor", "Engine", "Sub", "Growl"],
  lead: ["Lead", "Line", "Whistle", "Laser", "Hook", "Voice", "Siren", "Ray"],
  pad: ["Fog", "Haze", "Cloud", "Tide", "Drift", "Bloom", "Air", "Field"],
  keys: ["Keys", "Chords", "Bells", "Organ", "Stack", "Comp", "Tines", "Board"],
  pluck: ["Pluck", "Drop", "Pick", "Spark", "Pebble", "Snap", "Tick", "Ping"],
  arp: ["Arp", "Steps", "Run", "Bounce", "Ladder", "Loop", "Ripple", "Gears"],
  fx: ["Zap", "Riser", "Swoop", "Static", "Comet", "Glitch", "Noise", "Burst"],
};

/** Generated sounds show with this mark (★ is the user's own). */
export const GEN_MARK = "✦ ";
export const GEN_SEEDS = 65536; // a seed fits the share code's two bytes

/** The built-in preset a generated sound grows from. */
export function genBase(kind: InstrumentKind, seed: number): number {
  return new Rng(seed * 7919 + 17).int(0, INSTRUMENTS[kind].presets.length - 1);
}

/** A generated preset: always the same for the same instrument and seed. */
export function generatePreset(kind: InstrumentKind, seed: number): { name: string; params: Record<string, number>; base: number; roles: Role[] } {
  const base = genBase(kind, seed), roles = presetRoles(kind, base);
  const r = new Rng(seed * 104729 + kind.length * 31 + 5);
  const params = vary(kind, { ...defaultParams(kind), ...INSTRUMENTS[kind].presets[base].params }, r, 1);
  const name = `${GEN_MARK}${r.pick(ADJ)} ${r.pick(NOUN[roles[0]])}`;
  return { name, params, base, roles };
}

/** A seed whose generated sound has `role` (null if this instrument has nothing in that role). */
export function genSeedFor(kind: InstrumentKind, role: Role | null, r: Rng): number | null {
  if (!RECIPES[kind]) return null;
  for (let tries = 0; tries < 64; tries++) {
    const seed = r.int(0, GEN_SEEDS - 1);
    if (!role || presetRoles(kind, genBase(kind, seed)).includes(role)) return seed;
  }
  return null;
}

/** Mutate: a small push on a few of the knobs the recipe names. Returns the new params. */
export function mutateParams(kind: InstrumentKind, params: Record<string, number>, seed: number): Record<string, number> {
  const r = new Rng(seed);
  const ids = (RECIPES[kind] ?? []).map((m) => m.id);
  const n = Math.min(ids.length, r.int(3, 5));
  const only = new Set<string>();
  while (only.size < n) only.add(r.pick(ids));
  return vary(kind, { ...params }, r, 0.45, only);
}

// ------------------------------------------------------------ picking by role

export interface PickOptions {
  /** Sounds heard in recent rolls (soundKey), avoided while there are others. */
  recent?: Set<string>;
  /** Share of picks that are generated, 0..1 (default 0.4). */
  genShare?: number;
  /** Sounds already in the band (soundKey), never repeated. */
  taken?: Set<string>;
}

/** Every built-in sound with this role (from `kinds`). */
export function soundsWithRole(role: Role | null, kinds: InstrumentKind[] = DICE_KINDS): SoundRef[] {
  const out: SoundRef[] = [];
  for (const kind of kinds) {
    INSTRUMENTS[kind].presets.forEach((_, preset) => { if (!role || presetRoles(kind, preset).includes(role)) out.push({ kind, preset }); });
  }
  return out;
}

/**
 * A sound for a role: built in (fresh ones first) or, `genShare` of the time, generated
 * from the recipe of an instrument that has the role. `kinds` limits the instruments
 * (one, when the slot's instrument is chosen).
 */
export function pickSound(role: Role | null, r: Rng, opts: PickOptions = {}, kinds: InstrumentKind[] = DICE_KINDS): SoundRef | null {
  let all = soundsWithRole(role, kinds);
  if (!all.length && role) all = soundsWithRole(null, kinds); // this instrument has nothing in the role
  if (!all.length) return null;
  const taken = opts.taken ?? new Set<string>(), recent = opts.recent ?? new Set<string>();
  // An instrument first (weighted by how many fresh sounds it has in the role), then a sound in it,
  // so an instrument with many presets in a role doesn't crowd out the others, and one whose
  // only sounds in the role were just heard steps back.
  const byKind = new Map<InstrumentKind, SoundRef[]>();
  for (const s of all) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s]);
  const freshIn = (xs: SoundRef[]) => xs.filter((s) => !recent.has(soundKey(s)) && !taken.has(soundKey(s))).length;
  const kind = r.weighted([...byKind].map(([k, xs]) => [k, Math.sqrt(freshIn(xs)) || 0.2] as const));
  const inKind = byKind.get(kind)!;
  if (r.chance(opts.genShare ?? 0.4)) {
    const seed = genSeedFor(kind, role && presetRoles(kind, inKind[0].preset).includes(role) ? role : null, r);
    if (seed !== null) return { kind, preset: genBase(kind, seed), gen: seed };
  }
  const free = inKind.filter((s) => !taken.has(soundKey(s)));
  const fresh = free.filter((s) => !recent.has(soundKey(s)));
  return r.pick(fresh.length ? fresh : free.length ? free : inKind);
}

/**
 * The role for a dice slot: drums and bass first (80% for slots 1 and 2 while the band lacks
 * them), then lead / pad / keys / pluck / arp, fx rare. Instruments already chosen count.
 */
export function slotRole(i: number, have: Role[], r: Rng): Role {
  const has = (x: Role) => have.includes(x);
  const w: [Role, number][] = [["lead", 3], ["keys", 3], ["pad", 2], ["pluck", 2], ["arp", 2], ["fx", 0.6]];
  const melodic = w.reduce((a, [, x]) => a + x, 0);
  // Slot 1: drums 80% of the time; slot 2: bass 80%; later slots fill what's missing.
  const drums = has("drums") ? 0.03 * melodic : i === 0 ? 4 * melodic : i === 1 ? 0.4 * melodic : 0.6 * melodic;
  const bass = has("bass") ? 0.05 * melodic : i === 1 ? 4 * melodic : i === 0 ? 0.05 * melodic : 0.6 * melodic;
  return r.weighted([["drums", drums], ["bass", bass], ...w.map(([x, n]) => [x, has(x) ? n * 0.5 : n] as [Role, number])]);
}
