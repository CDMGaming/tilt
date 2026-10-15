// Instrument definitions: parameters, the 8 macros a hardware controller's
// knobs map to, and factory presets. Shared by the UI and the audio worklet.

import type { InstrumentKind } from "./model";
import { ANALOG, LEAD, PAD, WOBBLE } from "./instruments2";
import { CHIP, FM, SAMPLER, WAVE } from "./instruments3";
import { isToolkitKey, toolkitParams } from "./toolkit";

export interface ParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  def: number;
  curve?: "lin" | "exp"; // exp for frequencies and times
  options?: string[]; // discrete choice; value is the index
  unit?: string;
}

export interface InstrumentDef {
  kind: InstrumentKind;
  name: string; // our original instrument names
  role: string;
  /** Musical job, used by the auto-arranger and the phrase grid. */
  group: "drums" | "bass" | "harmony" | "lead" | "fx";
  /** Drum machines: number of pads (notes from DRUM_BASE_NOTE up). */
  drumParts?: number;
  partNames?: string[];
  params: ParamDef[];
  macros: string[]; // exactly 8 param ids
  presets: { name: string; params: Record<string, number> }[];
}

// ---------- drum machine: "Kitbox" ----------

/** Samples that ship with the app (rendered by tools/make-kit.ts, ours, CC0). */
export const KIT_SAMPLES = [
  "kick-deep", "kick-punch", "kick-boom", "snare-crack", "snare-body", "clap", "rim", "hat-closed",
  "hat-open", "hat-pedal", "tom-low", "tom-high", "cowbell", "shaker", "crash", "zap",
];

export const DRUM_PARTS = 8;
export const DRUM_BASE_NOTE = 36;
const PART_DEFAULT_SAMPLE = [0, 3, 5, 7, 8, 10, 6, 12];
export const DRUM_PART_LABELS = ["Kick", "Snare", "Clap", "C-Hat", "O-Hat", "Tom", "Rim", "Perc"];

const drumParams: ParamDef[] = [];
for (let i = 0; i < DRUM_PARTS; i++) {
  drumParams.push(
    { id: `p${i}smp`, label: "Sound", min: 0, max: KIT_SAMPLES.length - 1, def: PART_DEFAULT_SAMPLE[i], options: KIT_SAMPLES },
    { id: `p${i}tune`, label: "Tune", min: -12, max: 12, def: 0, unit: "st" },
    { id: `p${i}decay`, label: "Decay", min: 0.03, max: 2.5, def: 1.2, curve: "exp", unit: "s" },
    { id: `p${i}level`, label: "Level", min: 0, max: 1, def: 0.8 },
    { id: `p${i}pan`, label: "Pan", min: -1, max: 1, def: 0 },
    { id: `p${i}drive`, label: "Drive", min: 0, max: 1, def: 0 },
    { id: `p${i}tone`, label: "Tone", min: -1, max: 1, def: 0 }, // <0 darker (LP), >0 thinner (HP)
  );
}
drumParams.push(
  { id: "choke", label: "Hat choke", min: 0, max: 1, def: 1, options: ["Off", "On"] },
  { id: "level", label: "Level", min: 0, max: 1, def: 0.85 },
);

const drumPreset = (name: string, smp: number[], extra: Record<string, number> = {}) => {
  const p: Record<string, number> = {};
  smp.forEach((s, i) => (p[`p${i}smp`] = s));
  return { name, params: { ...p, ...extra } };
};

export const DRUMS: InstrumentDef = {
  kind: "drums",
  name: "Kitbox",
  role: "Sample drum machine, 8 parts",
  group: "drums",
  drumParts: 8,
  params: drumParams,
  macros: ["p0tune", "p0decay", "p1tune", "p1decay", "p3decay", "p4decay", "p0drive", "level"],
  presets: [
    drumPreset("Standard", [0, 3, 5, 7, 8, 10, 6, 12]),
    drumPreset("Punchy", [1, 3, 5, 7, 8, 11, 6, 13], { p0drive: 0.35, p1drive: 0.2 }),
    drumPreset("Boom Room", [2, 4, 5, 7, 8, 10, 6, 14], { p0decay: 2.2, p0tune: -3 }),
    drumPreset("Tight", [1, 3, 6, 7, 9, 11, 5, 13], { p0decay: 0.35, p1decay: 0.25, p3decay: 0.06, p4decay: 0.35 }),
    drumPreset("Lo-fi", [0, 4, 5, 7, 8, 10, 6, 12], { p0tone: -0.5, p1tone: -0.5, p3tone: -0.4, p0drive: 0.5, p1drive: 0.5 }),
    drumPreset("Tribal", [2, 4, 6, 9, 13, 10, 11, 12], { p5tune: -5, p6tune: 4 }),
    drumPreset("Electro", [1, 3, 5, 7, 8, 15, 6, 12], { p5tune: 5, p1tune: 2, p0tune: -2 }),
    drumPreset("Trap-ish", [2, 3, 5, 7, 9, 11, 6, 15], { p0decay: 2.5, p0tune: -5, p3tune: 3 }),
    drumPreset("Garage", [0, 4, 5, 9, 8, 10, 6, 13], { p1tune: 3 }),
    drumPreset("Crunch", [1, 3, 5, 7, 8, 10, 6, 15], { p0drive: 0.8, p1drive: 0.8, p2drive: 0.6, p3drive: 0.4 }),
  ],
};

// ---------- acid bass: "Squelch" ----------

export const ARP_MODES = ["Up", "Down", "Up-Down", "Random"];
export const ARP_RATES = ["1/8", "1/16", "1/32", "1/16T"];

export const ACID: InstrumentDef = {
  kind: "acid",
  name: "Squelch",
  role: "Squelchy, resonant mono bass that slides and screams",
  group: "bass",
  params: [
    { id: "wave", label: "Wave", min: 0, max: 1, def: 0, options: ["Saw", "Square"] },
    { id: "cutoff", label: "Cutoff", min: 60, max: 6000, def: 500, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.6 },
    { id: "envmod", label: "Env", min: 0, max: 1, def: 0.55 },
    { id: "decay", label: "Decay", min: 0.05, max: 2, def: 0.35, curve: "exp", unit: "s" },
    { id: "accent", label: "Accent", min: 0, max: 1, def: 0.5 },
    { id: "bite", label: "Bite", min: 0, max: 1, def: 0.3 },
    { id: "gnaw", label: "Gnaw", min: 0, max: 1, def: 0 },
    { id: "glide", label: "Slide", min: 0.005, max: 0.5, def: 0.06, curve: "exp", unit: "s" },
    { id: "sub", label: "Sub", min: 0, max: 1, def: 0 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.7 },
    { id: "arpOn", label: "Arp", min: 0, max: 1, def: 0, options: ["Off", "On"] },
    { id: "arpMode", label: "Arp mode", min: 0, max: 3, def: 0, options: ARP_MODES },
    { id: "arpRate", label: "Arp rate", min: 0, max: 3, def: 1, options: ARP_RATES },
    { id: "arpRange", label: "Arp oct", min: 1, max: 3, def: 1, options: ["1", "2", "3"] },
  ],
  macros: ["cutoff", "reso", "envmod", "decay", "bite", "gnaw", "accent", "glide"],
  // The first ten keep their places: setup codes point at presets by position.
  presets: [
    { name: "Classic Squelch", params: {} },
    { name: "Rubber", params: { level: 1.00, cutoff: 300, reso: 0.35, envmod: 0.4, decay: 0.5, bite: 0.1 } },
    { name: "Screamer", params: { level: 0.51, cutoff: 900, reso: 0.85, envmod: 0.8, decay: 0.25, bite: 0.8, accent: 0.8 } },
    { name: "Square Pluck", params: { level: 0.54, wave: 1, cutoff: 700, reso: 0.4, envmod: 0.6, decay: 0.15 } },
    { name: "Deep Sub", params: { level: 1.00, cutoff: 180, reso: 0.15, envmod: 0.2, decay: 0.8, sub: 0.7, bite: 0.05 } },
    { name: "Acid Arp", params: { arpOn: 1, arpMode: 2, arpRate: 1, arpRange: 2, reso: 0.7, envmod: 0.7, decay: 0.2 } },
    { name: "Gnarl", params: { level: 0.50, wave: 1, cutoff: 400, reso: 0.75, bite: 1, envmod: 0.5, decay: 0.4 } },
    { name: "Liquid", params: { cutoff: 650, reso: 0.55, envmod: 0.35, decay: 0.9, glide: 0.18 } },
    { name: "Bounce Arp", params: { level: 0.56, arpOn: 1, arpMode: 0, arpRate: 3, arpRange: 1, wave: 1, decay: 0.12 } },
    { name: "Chirp", params: { level: 0.66, cutoff: 1500, reso: 0.9, envmod: 0.9, decay: 0.08, accent: 1 } },
    // Lines
    { name: "Rave Line", params: { level: 0.57, cutoff: 420, reso: 0.82, envmod: 0.75, decay: 0.3, bite: 0.55, accent: 0.7, glide: 0.05 } },
    { name: "Slow Melt", params: { level: 0.85, cutoff: 250, reso: 0.8, envmod: 0.9, decay: 1.6, glide: 0.3, bite: 0.2 } },
    { name: "Spit", params: { level: 0.50, wave: 1, cutoff: 900, reso: 0.5, envmod: 0.4, decay: 0.06, accent: 0.9, bite: 0.3 } },
    { name: "Gnawer", params: { level: 0.55, wave: 1, cutoff: 500, reso: 0.7, envmod: 0.55, decay: 0.3, gnaw: 0.7, bite: 0.4 } },
    { name: "Fizz", params: { level: 0.69, cutoff: 2500, reso: 0.3, envmod: 0.3, decay: 0.15, gnaw: 0.5, bite: 0.2 } },
    // Low and round
    { name: "Night Bus", params: { level: 0.81, cutoff: 160, reso: 0.5, envmod: 0.35, decay: 0.6, sub: 0.4, bite: 0.2 } },
    { name: "Velvet Sub", params: { level: 1.00, cutoff: 120, reso: 0.1, envmod: 0.1, decay: 1.2, sub: 0.9, glide: 0.1, bite: 0 } },
    { name: "Hollow Square", params: { level: 0.82, wave: 1, cutoff: 260, reso: 0.3, envmod: 0.3, decay: 0.7, sub: 0.3, "tk:fType": 3, "tk:fCut": 120, "tk:fRes": 0.1 } },
    // With their own effect
    { name: "Wet Rubber", params: { level: 0.84, cutoff: 350, reso: 0.6, envmod: 0.5, decay: 0.45, gnaw: 0.25, bite: 0.15, "ifx:type": 8, "ifx:a": 0.3, "ifx:b": 0.45 } },
    { name: "Phase Line", params: { level: 0.78, cutoff: 380, reso: 0.7, envmod: 0.65, decay: 0.28, "ifx:type": 9, "ifx:a": 0.25, "ifx:b": 0.6 } },
    { name: "Duck Bass", params: { level: 0.85, cutoff: 450, reso: 0.55, envmod: 0.5, decay: 0.3, "ifx:type": 11, "ifx:a": 0.4, "ifx:b": 0.7 } },
    { name: "Crushed", params: { level: 0.53, cutoff: 600, reso: 0.7, envmod: 0.5, decay: 0.3, bite: 0.7, "ifx:type": 7, "ifx:a": 0.4, "ifx:b": 0.5 } },
    { name: "Wah Wah", params: { level: 0.75, cutoff: 300, reso: 0.7, envmod: 0.3, decay: 0.5, "tk:l1Dest": 2, "tk:l1Sync": 4, "tk:l1Shape": 1, "tk:l1Amt": 0.5 } },
    // Leads and arps
    { name: "Acid Lead", params: { level: 0.73, cutoff: 1200, reso: 0.75, envmod: 0.6, decay: 0.4, glide: 0.12, bite: 0.5, "ifx:type": 13, "ifx:a": 0.45, "ifx:b": 0.35 } },
    { name: "Laser Tooth", params: { level: 0.71, cutoff: 2000, reso: 0.95, envmod: 1, decay: 0.05, gnaw: 0.4, bite: 0.2 } },
    { name: "Squeak Arp", params: { level: 0.76, arpOn: 1, arpMode: 0, arpRate: 2, arpRange: 2, cutoff: 800, reso: 0.85, envmod: 0.6, decay: 0.1 } },
    { name: "Down Arp", params: { arpOn: 1, arpMode: 1, arpRate: 1, arpRange: 3, cutoff: 600, reso: 0.65, envmod: 0.6, decay: 0.18 } },
    { name: "Dice Arp", params: { level: 0.64, arpOn: 1, arpMode: 3, arpRate: 1, arpRange: 2, reso: 0.8, envmod: 0.8, decay: 0.14, accent: 0.8 } },
  ],
};

// ---------- poly synth with chord mode: "Chordette" ----------

export const POLY_WAVES = ["Saw", "Square", "Triangle", "Sine"];

export const POLY: InstrumentDef = {
  kind: "poly",
  name: "Chordette",
  role: "Poly synth; one key plays a chord in the song's scale",
  group: "harmony",
  params: [
    { id: "chord", label: "Chord", min: 0, max: 2, def: 0, options: ["Off", "Triad", "7th"] },
    { id: "spread", label: "Spread", min: 0, max: 1, def: 0, options: ["Close", "Open"] },
    { id: "wave1", label: "Osc 1", min: 0, max: 3, def: 0, options: POLY_WAVES },
    { id: "wave2", label: "Osc 2", min: 0, max: 3, def: 1, options: POLY_WAVES },
    { id: "semi2", label: "Osc 2 semi", min: -12, max: 12, def: 0, unit: "st" },
    { id: "detune", label: "Detune", min: 0, max: 50, def: 8, unit: "ct" },
    { id: "mix", label: "Osc mix", min: 0, max: 1, def: 0.4 },
    { id: "cutoff", label: "Cutoff", min: 80, max: 16000, def: 2500, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.2 },
    { id: "fenv", label: "Filter env", min: 0, max: 1, def: 0.3 },
    { id: "fdecay", label: "F decay", min: 0.02, max: 3, def: 0.5, curve: "exp", unit: "s" },
    { id: "attack", label: "Attack", min: 0.001, max: 3, def: 0.01, curve: "exp", unit: "s" },
    { id: "decay", label: "Decay", min: 0.02, max: 3, def: 0.4, curve: "exp", unit: "s" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0.7 },
    { id: "release", label: "Release", min: 0.01, max: 4, def: 0.4, curve: "exp", unit: "s" },
    { id: "width", label: "Width", min: 0, max: 1, def: 0.5 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.55 },
  ],
  macros: ["cutoff", "reso", "fenv", "attack", "release", "detune", "mix", "level"],
  presets: [
    { name: "Warm Stack", params: { chord: 1 } },
    { name: "Glass Keys", params: { wave1: 2, wave2: 3, semi2: 12, cutoff: 6000, fenv: 0.2, decay: 0.8, sustain: 0.3, release: 0.8, chord: 1 } },
    { name: "Stab Club", params: { chord: 2, cutoff: 900, reso: 0.35, fenv: 0.7, fdecay: 0.18, decay: 0.2, sustain: 0, release: 0.15 } },
    { name: "Slow Strings", params: { attack: 0.6, release: 1.5, cutoff: 3500, detune: 18, mix: 0.5, chord: 1, spread: 1 } },
    { name: "Square Organ", params: { wave1: 1, wave2: 1, semi2: 12, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05, cutoff: 5000, fenv: 0 } },
    { name: "Soft Pad", params: { wave1: 2, wave2: 0, attack: 1.2, release: 2.5, cutoff: 1400, detune: 22, chord: 1, spread: 1 } },
    { name: "Pluck Chords", params: { chord: 1, decay: 0.25, sustain: 0, release: 0.3, fenv: 0.6, fdecay: 0.15, cutoff: 1200 } },
    { name: "Brassy", params: { wave1: 0, wave2: 0, detune: 12, attack: 0.05, cutoff: 900, fenv: 0.7, fdecay: 0.4, reso: 0.15 } },
    { name: "Lead Saw", params: { chord: 0, detune: 14, cutoff: 4500, reso: 0.25, fenv: 0.2, sustain: 0.8 } },
    { name: "Bell Sevenths", params: { chord: 2, wave1: 3, wave2: 2, semi2: 19, mix: 0.35, decay: 1.4, sustain: 0, release: 1.2, cutoff: 8000 } },
  ],
};

export const INSTRUMENTS: Record<InstrumentKind, InstrumentDef> = {
  drums: DRUMS, acid: ACID, poly: POLY, lead: LEAD, analog: ANALOG, wobble: WOBBLE, pad: PAD,
  chip: CHIP, fm: FM, wave: WAVE, sampler: SAMPLER,
};

/** Every instrument, in picker order. */
export const ALL_KINDS: InstrumentKind[] = ["drums", "analog", "acid", "wobble", "poly", "pad", "fm", "wave", "lead", "chip", "sampler"];

export const isDrumKind = (k: InstrumentKind) => !!INSTRUMENTS[k].drumParts;
export const drumCount = (k: InstrumentKind) => INSTRUMENTS[k].drumParts ?? 0;

export function defaultParams(kind: InstrumentKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of INSTRUMENTS[kind].params) out[p.id] = p.def;
  return out;
}

export function presetParams(kind: InstrumentKind, index: number): Record<string, number> {
  const def = INSTRUMENTS[kind];
  const pr = def.presets[((index % def.presets.length) + def.presets.length) % def.presets.length];
  return { ...defaultParams(kind), ...pr.params };
}

export function paramDef(kind: InstrumentKind, id: string): ParamDef | undefined {
  if (isToolkitKey(id)) return toolkitParams(kind).find((p) => p.id === id);
  return INSTRUMENTS[kind].params.find((p) => p.id === id);
}

/** Map a 0..1 knob position to a parameter value, respecting curve and steps. */
export function fromUnit(p: ParamDef, u: number): number {
  u = Math.min(1, Math.max(0, u));
  if (p.options) return Math.round(p.min + u * (p.max - p.min));
  if (p.curve === "exp" && p.min > 0) return p.min * Math.pow(p.max / p.min, u);
  const v = p.min + u * (p.max - p.min);
  return p.unit === "st" ? Math.round(v) : v;
}

export function toUnit(p: ParamDef, v: number): number {
  if (p.curve === "exp" && p.min > 0 && !p.options) return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}

export function formatParam(p: ParamDef, v: number): string {
  if (p.options) return p.options[Math.round(v - p.min)] ?? String(v);
  if (p.unit === "Hz") return v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "";
  if (p.unit === "s") return v < 1 ? Math.round(v * 1000) + "ms" : v.toFixed(2) + "s";
  if (p.unit === "st") return (v > 0 ? "+" : "") + Math.round(v);
  if (p.unit === "ct") return Math.round(v) + "c";
  if (p.min < 0) return (v > 0 ? "+" : "") + Math.round(v * 100);
  return Math.round(v * 100) + "";
}

/** Display name of the sound loaded in a drum part, e.g. "Kick punch". */
export function drumPartName(params: Record<string, number>, part: number, kind: InstrumentKind = "drums", names?: string[]): string {
  if (names) return names[part] ?? `Pad ${part + 1}`;
  if (INSTRUMENTS[kind].partNames) return INSTRUMENTS[kind].partNames![part] ?? "";
  const s = KIT_SAMPLES[Math.round(params[`p${part}smp`] ?? 0)] ?? "";
  const t = s.replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
