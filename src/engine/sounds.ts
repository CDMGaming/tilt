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
export const DICE_KINDS: InstrumentKind[] = ["drums", "analog", "acid", "wobble", "patch", "poly", "epiano", "organ", "pluck", "pad", "fm", "wave", "lead", "anthem", "chip"];

// Role tags per preset, by name. A preset not listed gets its instrument's default.
const DEFAULT_ROLE: Record<InstrumentKind, Role[]> = {
  drums: ["drums"], analog: ["drums"], acid: ["bass"], wobble: ["bass"], poly: ["keys"], pad: ["pad"],
  fm: ["keys"], wave: ["lead"], lead: ["lead"], chip: ["lead"], sampler: ["fx"], epiano: ["keys"], pluck: ["pluck"], organ: ["keys"], anthem: ["lead"], patch: ["bass"],
};
const TAGS: Partial<Record<InstrumentKind, Record<string, Role[]>>> = {
  patch: {
    "Patch Lead": ["lead"], "Screamer": ["lead"], "Sync-ish Sweep": ["lead"], "Flute Patch": ["lead"], "Bleep": ["arp", "pluck"], "S&H Burble": ["arp", "fx"],
    "Trill": ["arp", "lead"], "Siren": ["fx"], "Laser": ["fx"], "Wind": ["fx"], "UFO": ["fx"], "Tremolo Drone": ["pad", "fx"], "Noise Snap": ["fx", "drums"],
  },
  anthem: {
    "Saw Pad": ["pad"], "Pump Pad": ["pad"], "Wide Chords": ["pad", "keys"], "Dark Stack": ["pad"], "Sunrise": ["pad"], "Gated Pad": ["pad", "arp"],
    "Pluck Saw": ["pluck", "arp"], "Big Pluck": ["pluck"], "Stab": ["keys", "pluck"], "Pump Stab": ["keys", "pluck"],
    "Saw Bass": ["bass"], "Reese-ish": ["bass"], "Riser Saw": ["fx"], "Crowd Roar": ["fx", "pad"], "Laser Saw": ["lead", "fx"],
  },
  organ: { "Soft Flute": ["keys", "pad"], "Dark Pad": ["pad"], "Cathedral": ["pad", "keys"], "Ballad": ["keys", "pad"], "Bass Pedal": ["bass"], "Whistle": ["lead"], "Screamer": ["keys", "lead"] },
  pluck: {
    "Finger Bass": ["bass"], "Pick Bass": ["bass"], "Muted Bass": ["bass"], "Upright-ish": ["bass"],
    "Marimba": ["pluck", "keys"], "Soft Mallets": ["keys", "pluck"], "Vibes-ish": ["keys"], "Harp": ["pluck", "arp"], "Glass Harp": ["pluck", "arp"],
    "Music Box": ["pluck", "arp"], "Church Bell": ["keys", "fx"], "Gong-ish": ["fx"], "Chime": ["keys", "pluck"], "Muted Funk": ["pluck", "arp"],
  },
  acid: {
    "Square Pluck": ["bass", "pluck"], "Acid Arp": ["bass", "arp"], "Bounce Arp": ["bass", "arp"], "Chirp": ["arp", "lead"],
    "Spit": ["bass", "pluck"], "Fizz": ["bass", "pluck"], "Slow Melt": ["bass", "lead"], "Crushed": ["bass", "fx"],
    "Acid Lead": ["lead"], "Laser Tooth": ["lead", "fx"], "Squeak Arp": ["arp"], "Down Arp": ["arp", "bass"], "Dice Arp": ["arp"],
  },
  poly: {
    "House Stab": ["keys", "pluck"], "Clavish": ["keys", "pluck"], "Stab Club": ["keys", "pluck"], "Pluck Chords": ["pluck", "keys"],
    "Soft Pad": ["pad"], "Warm Pad": ["pad"], "Sweep Pad": ["pad"], "Dark Pad": ["pad"], "Air Pad": ["pad"], "Choir Haze": ["pad"],
    "Slow Strings": ["pad"], "Tape Strings": ["pad"], "Chamber": ["pad", "keys"], "Fast Strings": ["keys", "pad"], "Pizzicato": ["pluck"],
    "Lead Saw": ["lead"], "Rave Hoover": ["lead", "fx"], "Acid Chords": ["keys", "pluck"],
    "Music Box": ["pluck", "keys"], "Glass Bells": ["keys", "pluck"], "Chime Pad": ["pad", "keys"],
  },
  lead: {
    "Laser Sweep": ["lead", "fx"], "Pluck Lead": ["pluck", "lead"], "Chip-ish": ["lead", "arp"],
    "Sync Bass": ["bass"], "Growl Sync": ["bass"], "Rubber Sync": ["bass", "pluck"],
    "Sync Arp": ["arp", "pluck"], "Zap Arp": ["arp", "fx"], "Gated Sync": ["arp", "lead"],
  },
  wobble: { "Robot": ["bass", "fx"], "Laser Wob": ["bass", "fx"], "Riser Wub": ["fx", "bass"], "Siren": ["fx"], "Bit Storm": ["fx", "bass"], "Zapper": ["fx", "bass"] },
  pad: {
    "Short Keys": ["keys"], "Lo-fi Piano": ["keys"], "Tape Rhodes": ["keys"], "Cassette Organ": ["keys"], "Bedroom Keys": ["keys"],
    "Music Box Dust": ["keys", "pluck"], "Bit Fog": ["pad", "fx"], "Wind": ["fx", "pad"], "Vinyl Room": ["fx", "pad"], "Rain Glass": ["fx", "pad"],
  },
  chip: {
    "Major Jump": ["arp"], "Minor Jump": ["arp"], "Octave Bounce": ["arp"], "Big Run Up": ["arp"], "Sus Sparkle": ["arp", "pluck"],
    "Power Chord": ["arp", "lead"], "Glitch Arp": ["arp", "fx"],
    "Tri Bass": ["bass"], "Pulse Bass": ["bass"], "Octave Bass": ["bass", "arp"], "Drop Bass": ["bass"],
    "Level Clear": ["fx", "arp"], "Game Over": ["fx"], "Fanfare Bit": ["fx", "arp"],
    "Coin": ["fx"], "Jump": ["fx"], "Power Up": ["fx"], "Laser Blip": ["fx"], "Noise Snare": ["fx"], "Explosion": ["fx"], "Hit": ["fx"], "Teleport": ["fx"],
  },
  fm: {
    "Marimba": ["pluck", "keys"], "Vibes": ["keys", "pluck"], "Xylo": ["pluck"], "Kalimba": ["pluck"], "Steel Drum": ["pluck", "keys"],
    "Glass Pluck": ["pluck"], "Harp-ish": ["pluck", "arp"], "Wind Chime": ["pluck", "fx"], "Metal Clang": ["fx"], "Cluster Bell": ["keys", "fx"],
    "FM Bass": ["bass"], "Digital Pluck Bass": ["bass", "pluck"],
    "Soft Pad": ["pad"], "Glass Pad": ["pad"], "Frost": ["pad"], "Breath Pad": ["pad"],
  },
  wave: {
    "Slow Scan": ["pad"], "Wide Pad": ["pad"], "Warp Pad": ["pad"], "Choir Morph": ["pad"], "Digital Haze": ["pad"], "Evolving": ["pad"],
    "Digital Bass": ["bass"], "Warp Bass": ["bass"], "Growl Table": ["bass"], "Sub Morph": ["bass"],
    "Sweep Pluck": ["pluck", "arp"], "Vowel Keys": ["keys"], "Glitch Stab": ["fx", "pluck"], "Warp Arp": ["arp", "pluck"], "Bell Table": ["keys", "pluck"],
    "Digital Pluck": ["pluck", "arp"], "Scanner": ["fx"], "Warp Riser": ["fx"],
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

/** Kitbox: a part may swap to the same part of another kit (12 kits, 8 parts each). */
const KIT_SOUNDS = Array.from({ length: 8 }, (_, p) => Array.from({ length: 12 }, (_, k) => k * 8 + p));

export const RECIPES: Partial<Record<InstrumentKind, Move[]>> = {
  drums: [
    knob("punch", 0.25), knob("smack", 0.25), knob("time", 0.15), knob("room", 0.2, 0, 0.7),
    ...KIT_SOUNDS.flatMap((sounds, i) => [pick(`p${i}smp`, 0.3, sounds), knob(`p${i}tune`, 0.08), knob(`p${i}decay`, 0.1), knob(`p${i}drive`, 0.15, 0, 0.6), knob(`p${i}tone`, 0.1, 0.3, 0.7)]),
  ],
  analog: [
    pick("model", 0.2, [0, 1, 2, 3, 4]),
    knob("kTune", 0.12), knob("kDecay", 0.18), knob("kBend", 0.22), knob("kBoost", 0.2, 0, 0.8), knob("kClick", 0.2),
    knob("sTune", 0.18), knob("sDecay", 0.18), knob("sSnappy", 0.22), knob("sPunch", 0.2), knob("sTone", 0.2),
    knob("cDecay", 0.18), knob("cSpread", 0.25), knob("cTone", 0.2), knob("cRoom", 0.2),
    knob("hDecay", 0.15), knob("hTone", 0.2), knob("hMetal", 0.25), knob("oDecay", 0.18), knob("oTone", 0.2), knob("oMetal", 0.25),
    knob("ltTune", 0.18), knob("ltDecay", 0.18), knob("ltBend", 0.22), knob("htTune", 0.18), knob("htDecay", 0.18), knob("htBend", 0.22),
    pick("pType", 0.3, [0, 1, 2]), knob("pTune", 0.2), knob("pDecay", 0.18),
  ],
  acid: [
    pick("wave", 0.3, [0, 1]), knob("cutoff", 0.2, 0.15, 0.75), knob("reso", 0.22, 0.1, 0.92), knob("envmod", 0.25), knob("decay", 0.2, 0.05, 0.8),
    knob("accent", 0.25), knob("bite", 0.25), knob("gnaw", 0.2, 0, 0.7), knob("glide", 0.12), knob("sub", 0.25), pick("arpMode", 0.3, [0, 1, 2, 3]),
  ],
  poly: [
    knob("warmth", 0.25), knob("voicing", 0.25), knob("strum", 0.15, 0, 0.6), pick("strumDir", 0.3, [0, 1, 2]),
    pick("wave2", 0.25, [0, 1, 2, 3]), pick("semi2", 0.2, [-12, 0, 0, 5, 7, 12]), knob("detune", 0.2, 0, 0.6),
    knob("mix", 0.25), knob("cutoff", 0.1, 0.4, 0.95), knob("reso", 0.15, 0, 0.6), knob("fenv", 0.15), knob("fdecay", 0.15),
    knob("attack", 0.06), knob("release", 0.08), knob("width", 0.2),
  ],
  lead: [
    knob("scream", 0.22), knob("sweep", 0.22), knob("glide", 0.15, 0, 0.7), knob("spread", 0.2), pick("unison", 0.2, [0, 1, 2, 3]),
    knob("cutoff", 0.15, 0.35, 1), knob("reso", 0.15, 0, 0.7), knob("sync", 0.15), knob("syncEnv", 0.15), knob("envDecay", 0.15),
    knob("vibDepth", 0.12, 0, 0.5), knob("vibRate", 0.15),
  ],
  wobble: [
    knob("wobble", 0.18, 0.2, 1), pick("wobRate", 0.4, [1, 2, 3, 4, 5]), knob("growl", 0.22), knob("crush", 0.2, 0, 0.8),
    knob("cutoff", 0.18, 0.2, 0.8), knob("sub", 0.2), pick("wave", 0.25, [0, 1, 2]), pick("xWave", 0.3, [0, 1, 2]),
    pick("xTune", 0.3, [-12, 0, 5, 7, 12]), knob("reso", 0.15, 0, 0.7), pick("wobShape", 0.3, [0, 1, 2, 3]),
  ],
  pad: [
    knob("drift", 0.22), knob("dust", 0.22), knob("space", 0.2), knob("low", 0.22), knob("hi", 0.2), knob("higher", 0.22),
    pick("wave", 0.25, [0, 1, 2, 3]), knob("detune", 0.22), knob("noise", 0.12, 0, 0.5), knob("cutoff", 0.18, 0.2, 0.9),
    knob("reso", 0.12, 0, 0.6), knob("attack", 0.06), knob("release", 0.06),
  ],
  chip: [
    pick("wave", 0.2, [0, 1, 2, 3]), knob("jump", 0.2), pick("jumpType", 0.3, [0, 1, 2, 3, 4, 5]), knob("jumpRate", 0.18),
    knob("run", 0.18, 0, 0.8), knob("glitch", 0.2, 0, 0.8), knob("vibDepth", 0.15, 0, 0.5), knob("vibRate", 0.18),
    knob("decay", 0.18), knob("sustain", 0.18), knob("sweepTime", 0.15),
  ],
  fm: [
    knob("harmonics", 0.2, 0, 0.9), knob("strike", 0.22), knob("shimmer", 0.22), pick("ratioM", 0.3, range(0, 14)), pick("ratioC", 0.12, [1, 2]),
    knob("indexDecay", 0.22), knob("indexSus", 0.18, 0, 0.6), knob("decay", 0.15), knob("release", 0.12),
  ],
  wave: [
    pick("table", 0.4, range(0, 6)), knob("pos", 0.3), knob("warp", 0.25), knob("envAmt", 0.25), knob("envDecay", 0.22),
    knob("lfoAmt", 0.2, 0, 0.7), knob("lfoRate", 0.22), knob("detune", 0.2), knob("cutoff", 0.18, 0.3, 1), knob("reso", 0.15, 0, 0.6),
  ],  patch: [
    knob("vco1", 0.2), knob("vco2", 0.2), knob("cutoff", 0.15, 0.2, 0.85), knob("peak", 0.18, 0, 0.85), knob("drive", 0.2), pick("vco2Semi", 0.3, [-12, 0, 5, 7, 12]),
    knob("mg1Rate", 0.2), knob("mg2Rate", 0.2), knob("mg1Amt", 0.15), knob("egAmt", 0.15), pick("mg1To", 0.2, [0, 2, 7, 8]),
  ],
  anthem: [
    knob("twist", 0.2, 0.2, 1), knob("diffuse", 0.22), knob("bottom", 0.2, 0, 0.7), knob("shine", 0.2, 0, 0.8),
    knob("cutoff", 0.15, 0.4, 1), knob("fenv", 0.2), knob("fdecay", 0.18), knob("glide", 0.1, 0, 0.4),
  ],
  organ: [
    ...Array.from({ length: 9 }, (_, k) => pick(`db${k}`, 0.3, [0, 2, 4, 6, 8])), knob("drive", 0.2, 0, 0.9), pick("rotary", 0.3, [0, 1, 2]),
    pick("vibChorus", 0.3, [0, 1, 2, 3, 4, 5, 6]), pick("perc", 0.25, [0, 1, 2]), knob("click", 0.2),
  ],
  pluck: [
    knob("pick", 0.25), knob("metal", 0.22), knob("damp", 0.2, 0, 0.8), knob("decay", 0.15), knob("room", 0.2, 0, 0.7), knob("bright", 0.15),
  ],
  epiano: [
    knob("bark", 0.22), knob("tone", 0.18, 0.15, 0.95), knob("index", 0.18, 0.1, 0.8), knob("bell", 0.2), knob("keyOff", 0.2),
    pick("trem", 0.25, [0, 1, 2]), knob("tremRate", 0.2), knob("tremDepth", 0.2), knob("decay", 0.15),
  ],
  sampler: [
    knob("crunch", 0.2, 0, 0.8), knob("vinyl", 0.2, 0, 0.8), knob("pitch", 0.1),
    ...Array.from({ length: 8 }, (_, i) => [knob(`p${i}tune`, 0.06), knob(`p${i}start`, 0.08, 0, 0.4), knob(`p${i}decay`, 0.1)]).flat(),
  ],


};

/** Roughly normal, -1..1 (three uniforms). */
const wobble = (r: Rng) => (r.next() + r.next() + r.next() - 1.5) / 1.5;

/**
 * Move `params` by a recipe, `amount` scaling how far (1 = a generated preset; Mutate goes
 * further on fewer knobs). `minMove` (knob travel) makes every moved knob audibly move;
 * `flipChance` overrides the recipe's switch odds; a switch that flips lands on a different value.
 */
function vary(kind: InstrumentKind, params: Record<string, number>, r: Rng, amount: number, only?: Set<string>, minMove = 0, flipChance?: number) {
  for (const m of RECIPES[kind] ?? []) {
    if (only && !only.has(m.id)) continue;
    const p = paramDef(kind, m.id);
    if (!p) continue;
    const v = params[m.id] ?? p.def;
    if ("flip" in m) {
      const others = m.values.filter((x) => x !== v);
      if (others.length && r.chance(flipChance ?? Math.min(1, m.flip * amount))) params[m.id] = r.pick(others);
    } else {
      const lo = m.lo ?? 0, hi = m.hi ?? 1, u0 = toUnit(p, v);
      let d = wobble(r) * m.spread * amount;
      if (Math.abs(d) < minMove) d = (d < 0 ? -1 : 1) * minMove;
      // Against an end of the range: go the other way rather than stand still.
      if (u0 + d > hi || u0 + d < lo) d = -d;
      params[m.id] = fromUnit(p, Math.max(lo, Math.min(hi, u0 + d)));
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

/** Mutate: a clear push on about half the knobs the recipe names. Returns the new params. */
export function mutateParams(kind: InstrumentKind, params: Record<string, number>, seed: number): Record<string, number> {
  const r = new Rng(seed);
  const ids = (RECIPES[kind] ?? []).map((m) => m.id);
  // About half the recipe's knobs (4-8), each moved clearly: you should hear every press.
  const n = Math.min(ids.length, Math.max(4, Math.min(8, Math.round(ids.length * (0.4 + r.next() * 0.25)))));
  const only = new Set<string>();
  while (only.size < n) only.add(r.pick(ids));
  return vary(kind, { ...params }, r, 1.4, only, 0.12, 0.75);
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
