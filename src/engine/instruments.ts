// Instrument definitions: parameters, the 8 macros a hardware controller's
// knobs map to, and factory presets. Shared by the UI and the audio worklet.

import type { InstrumentKind } from "./model";
import { ANALOG, LEAD, PAD, WOBBLE } from "./instruments2";
import { CHIP, FM, SAMPLER, WAVE } from "./instruments3";
import { TINE } from "./instruments4";
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
  /** `cat`: a category, for instruments that browse their sounds by kind (Chordette). */
  presets: { name: string; params: Record<string, number>; cat?: string; samples?: string[] }[];
}

// ---------- drum machine: "Kitbox" ----------

/** The kits (rendered by tools/make-kit.ts, ours, CC0) and their eight parts, in this order. */
export const KITS = ["Classic", "House", "Techno", "Trap", "Electro", "Lo-fi", "Minimal", "Industrial", "Garage", "Boom Bap", "Disco", "Chip"];
const KIT_FILES = ["classic", "house", "techno", "trap", "electro", "lofi", "minimal", "industrial", "garage", "boombap", "disco", "chip"];
export const KIT_PARTS = ["kick", "snare", "clap", "chat", "ohat", "tom", "rim", "perc"];
const KIT_PART_NAMES = ["kick", "snare", "clap", "closed hat", "open hat", "tom", "rim", "perc"];
/** Every kit sound, kit by kit: sound k * 8 + p is kit k's part p (file names under public/kit/). */
export const KIT_SAMPLES = KIT_FILES.flatMap((k) => KIT_PARTS.map((p) => `${k}-${p}`));
/** A sound's display name: "House clap". */
export const kitSoundName = (i: number) => `${KITS[Math.floor(i / 8)] ?? "?"} ${KIT_PART_NAMES[i % 8] ?? ""}`;

export const DRUM_PARTS = 8;
export const DRUM_BASE_NOTE = 36;
export const DRUM_PART_LABELS = ["Kick", "Snare", "Clap", "C-Hat", "O-Hat", "Tom", "Rim", "Perc"];
export const CHOKE_GROUPS = ["None", "A", "B", "C"];

const drumParams: ParamDef[] = [
  { id: "kit", label: "Kit", min: 0, max: KITS.length - 1, def: 0, options: KITS },
  { id: "punch", label: "Punch", min: 0, max: 1, def: 0.3 },
  { id: "smack", label: "Smack", min: 0, max: 1, def: 0.3 },
  { id: "time", label: "Time", min: 0.25, max: 2, def: 1, curve: "exp" },
  { id: "room", label: "Room", min: 0, max: 1, def: 0.25 },
  { id: "level", label: "Level", min: 0, max: 1, def: 0.85 },
];
for (let i = 0; i < DRUM_PARTS; i++) {
  drumParams.push(
    { id: `p${i}smp`, label: "Sound", min: 0, max: KIT_SAMPLES.length - 1, def: i, options: KIT_SAMPLES },
    { id: `p${i}tune`, label: "Tune", min: -12, max: 12, def: 0, unit: "st" },
    { id: `p${i}decay`, label: "Time", min: 0.03, max: 2.5, def: 1.2, curve: "exp", unit: "s" },
    { id: `p${i}level`, label: "Level", min: 0, max: 1, def: [0.9, 0.75, 0.65, 0.42, 0.38, 0.65, 0.5, 0.5][i] },
    { id: `p${i}pan`, label: "Pan", min: -1, max: 1, def: [0, 0, 0.1, -0.25, -0.25, -0.3, 0.2, 0.3][i] },
    { id: `p${i}send`, label: "Room", min: 0, max: 1, def: [0.05, 0.25, 0.3, 0.1, 0.15, 0.2, 0.15, 0.2][i] },
    // The strip's More drawer:
    { id: `p${i}gate`, label: "Play", min: 0, max: 1, def: 0, options: ["One-shot", "Gate"] },
    { id: `p${i}rev`, label: "Reverse", min: 0, max: 1, def: 0, options: ["Off", "On"] },
    { id: `p${i}choke`, label: "Choke", min: 0, max: 3, def: i === 3 || i === 4 ? 1 : 0, options: CHOKE_GROUPS },
    { id: `p${i}vel`, label: "Velocity", min: 0, max: 1, def: 1 },
    { id: `p${i}tone`, label: "Filter", min: -1, max: 1, def: 0 }, // <0 darker (LP), >0 thinner (HP)
    { id: `p${i}start`, label: "Start", min: 0, max: 0.9, def: 0 },
    // Hidden voicing (presets):
    { id: `p${i}drive`, label: "Drive", min: 0, max: 1, def: 0 },
  );
}

/** A kit preset: the kit's eight sounds plus its own settings. */
const drumPreset = (name: string, kit: number, extra: Record<string, number> = {}) => {
  const p: Record<string, number> = { kit };
  for (let i = 0; i < DRUM_PARTS; i++) p[`p${i}smp`] = kit * 8 + i;
  return { name, params: { ...p, ...extra } };
};

export const DRUMS: InstrumentDef = {
  kind: "drums",
  name: "Kitbox",
  role: "Dance drum machine: twelve kits, eight channel strips",
  group: "drums",
  drumParts: 8,
  partNames: DRUM_PART_LABELS,
  params: drumParams,
  macros: ["punch", "smack", "time", "p0tune", "p1tune", "p3decay", "room", "level"],
  presets: [
    drumPreset("Classic", 0, { level: 1.00 }),
    drumPreset("Classic Tight", 0, { level: 0.75, time: 0.5, punch: 0.6, room: 0.1 }),
    drumPreset("House", 1, { level: 0.98 }),
    drumPreset("House Big Room", 1, { level: 0.8, room: 0.6, smack: 0.6, p1send: 0.5, p2send: 0.6 }),
    drumPreset("Techno", 2, { level: 0.81, punch: 0.5 }),
    drumPreset("Techno Hard", 2, { level: 0.64, punch: 0.9, p0drive: 0.5, p1drive: 0.4, time: 0.8 }),
    drumPreset("Trap", 3, { level: 0.86, room: 0.15 }),
    drumPreset("Trap Long 808", 3, { level: 0.75, p0decay: 2.5, p0tune: -2, room: 0.1, p0send: 0 }),
    drumPreset("Electro", 4, { level: 1.00 }),
    drumPreset("Electro Zap", 4, { level: 1.00, p5tune: 5, p7tune: -3, smack: 0.5 }),
    drumPreset("Lo-fi", 5, { level: 1.00, room: 0.35, punch: 0.15 }),
    drumPreset("Lo-fi Dusty", 5, { level: 1.00, p0tone: -0.3, p1tone: -0.4, p3tone: -0.3, room: 0.45, time: 0.8 }),
    drumPreset("Minimal", 6, { level: 1.00, room: 0.2 }),
    drumPreset("Minimal Clicks", 6, { level: 1.00, time: 0.6, p3tune: 4, p7tune: 5, room: 0.35 }),
    drumPreset("Industrial", 7, { level: 0.68, punch: 0.6 }),
    drumPreset("Industrial Crush", 7, { level: 0.57, p0drive: 0.6, p1drive: 0.7, p2drive: 0.7, smack: 0.8, room: 0.4 }),
    drumPreset("Garage", 8, { level: 1.00, smack: 0.45 }),
    drumPreset("Garage Shuffle", 8, { level: 1.00, p1tune: 2, p7level: 0.9, p3decay: 0.5, room: 0.3 }),
    drumPreset("Boom Bap", 9, { level: 1.00, smack: 0.6, room: 0.3 }),
    drumPreset("Boom Bap Dirty", 9, { level: 0.73, p0drive: 0.4, p1drive: 0.5, p1tone: -0.3, smack: 0.8 }),
    drumPreset("Disco", 10, { level: 1.00, room: 0.35 }),
    drumPreset("Disco Syndrum", 10, { level: 1.00, p5decay: 2, p5tune: 3, room: 0.45, smack: 0.5 }),
    drumPreset("Chip", 11, { level: 1.00, room: 0.1 }),
    drumPreset("Chip Crunch", 11, { level: 0.73, p0drive: 0.6, p1drive: 0.5, time: 0.7, p0tune: -3 }),
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

export const CHORD_CATS = ["Keys", "Pads", "Strings", "Brass", "Synth", "Bells"];
const ch = (name: string, cat: string, params: Record<string, number>) => ({ name, cat, params });

export const POLY: InstrumentDef = {
  kind: "poly",
  name: "Chordette",
  role: "One key, a chord in the song's scale, from a workstation's sounds",
  group: "harmony",
  params: [
    { id: "chord", label: "Chord", min: 0, max: 2, def: 1, options: ["Off", "Triad", "7th"] },
    { id: "strum", label: "Strum", min: 0, max: 1, def: 0 },
    { id: "warmth", label: "Warmth", min: 0, max: 1, def: 0.3 },
    { id: "voicing", label: "Voicing", min: 0, max: 1, def: 0.2 },
    { id: "attack", label: "Attack", min: 0.001, max: 3, def: 0.01, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.01, max: 4, def: 0.4, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.3 },
    // Hidden voicing (each preset is its own sound):
    { id: "wave1", label: "Osc 1", min: 0, max: 3, def: 0, options: POLY_WAVES },
    { id: "wave2", label: "Osc 2", min: 0, max: 3, def: 1, options: POLY_WAVES },
    { id: "semi2", label: "Osc 2 semi", min: -12, max: 12, def: 0, unit: "st" },
    { id: "detune", label: "Detune", min: 0, max: 50, def: 8, unit: "ct" },
    { id: "mix", label: "Osc mix", min: 0, max: 1, def: 0.4 },
    { id: "cutoff", label: "Cutoff", min: 80, max: 16000, def: 2500, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.2 },
    { id: "fenv", label: "Filter env", min: 0, max: 1, def: 0.3 },
    { id: "fdecay", label: "F decay", min: 0.02, max: 3, def: 0.5, curve: "exp", unit: "s" },
    { id: "decay", label: "Decay", min: 0.02, max: 3, def: 0.4, curve: "exp", unit: "s" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0.7 },
    { id: "width", label: "Width", min: 0, max: 1, def: 0.5 },
    { id: "strumDir", label: "Strum dir", min: 0, max: 2, def: 0, options: ["Up", "Down", "Alternate"] },
  ],
  macros: ["warmth", "strum", "voicing", "chord", "attack", "release", "cutoff", "level"],
  presets: [
    // Keys
    ch("Soft Keys", "Keys", { level: 0.33, wave1: 2, wave2: 3, semi2: 12, mix: 0.35, cutoff: 4000, fenv: 0.2, fdecay: 0.4, attack: 0.003, decay: 0.9, sustain: 0.35, release: 0.5 }),
    ch("Glass Keys", "Keys", { level: 0.41, wave1: 2, wave2: 3, semi2: 12, cutoff: 6000, fenv: 0.2, decay: 0.8, sustain: 0.3, release: 0.8, warmth: 0.1 }),
    ch("Square Organ", "Keys", { level: 0.26, wave1: 1, wave2: 1, semi2: 12, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05, cutoff: 5000, fenv: 0, warmth: 0.15 }),
    ch("Drawbar Lite", "Keys", { level: 0.25, wave1: 3, wave2: 3, semi2: 12, mix: 0.5, attack: 0.004, sustain: 1, release: 0.08, cutoff: 8000, fenv: 0, "tk:l1Dest": 1, "tk:l1Rate": 6, "tk:l1Amt": 0.015, "ifx:type": 8, "ifx:a": 0.6, "ifx:b": 0.5 }),
    ch("House Stab", "Keys", { level: 0.51, chord: 2, wave1: 0, wave2: 1, cutoff: 2200, fenv: 0.5, fdecay: 0.25, decay: 0.45, sustain: 0.1, release: 0.3, warmth: 0.2 }),
    ch("Clavish", "Keys", { level: 0.73, chord: 0, wave1: 1, wave2: 0, "tk:pw": 0.25, mix: 0.4, cutoff: 4500, reso: 0.3, fenv: 0.5, fdecay: 0.12, decay: 0.35, sustain: 0.5, release: 0.1, warmth: 0.2 }),
    // Pads
    ch("Soft Pad", "Pads", { level: 0.27, wave1: 2, wave2: 0, attack: 1.2, release: 2.5, cutoff: 1400, detune: 22, voicing: 0.5 }),
    ch("Warm Pad", "Pads", { level: 0.24, wave1: 0, wave2: 0, detune: 18, cutoff: 1400, attack: 0.8, release: 2, warmth: 0.6, voicing: 0.5, "tk:uni": 3, "tk:uniDet": 0.4 }),
    ch("Sweep Pad", "Pads", { level: 0.38, wave1: 0, wave2: 0, detune: 14, cutoff: 600, fenv: 0.6, fdecay: 2.5, attack: 1, release: 2, "ifx:type": 9, "ifx:a": 0.2, "ifx:b": 0.6 }),
    ch("Dark Pad", "Pads", { level: 0.26, wave1: 2, wave2: 0, mix: 0.5, cutoff: 900, attack: 1.5, release: 3, warmth: 0.7, voicing: 0.7 }),
    ch("Air Pad", "Pads", { level: 0.24, wave1: 3, wave2: 0, semi2: 12, mix: 0.3, cutoff: 5000, attack: 1.2, release: 2.5, voicing: 0.8, "ifx:type": 15, "ifx:a": 0.6, "ifx:b": 0.4 }),
    ch("Choir Haze", "Pads", { level: 0.29, wave1: 2, wave2: 2, detune: 25, cutoff: 1800, reso: 0.4, attack: 0.7, release: 2, "tk:l1Dest": 2, "tk:l1Rate": 0.3, "tk:l1Amt": 0.2 }),
    // Strings
    ch("Slow Strings", "Strings", { level: 0.30, attack: 0.6, release: 1.5, cutoff: 3500, detune: 18, mix: 0.5, voicing: 0.5 }),
    ch("Fast Strings", "Strings", { level: 0.30, wave1: 0, wave2: 0, detune: 20, attack: 0.08, release: 0.6, cutoff: 4500, voicing: 0.5, warmth: 0.4 }),
    ch("Pizzicato", "Strings", { level: 0.75, wave1: 0, wave2: 2, cutoff: 2000, fenv: 0.5, fdecay: 0.12, decay: 0.18, sustain: 0, release: 0.15, strum: 0.25 }),
    ch("Chamber", "Strings", { level: 0.31, wave1: 0, wave2: 2, cutoff: 3000, attack: 0.3, release: 1, "tk:l1Dest": 1, "tk:l1Rate": 5, "tk:l1Amt": 0.02, "tk:l1Delay": 0.4, voicing: 0.6 }),
    ch("Tape Strings", "Strings", { level: 0.24, wave1: 0, wave2: 0, detune: 30, cutoff: 2500, attack: 0.4, release: 1.2, warmth: 0.7, "tk:l1Dest": 1, "tk:l1Rate": 0.8, "tk:l1Amt": 0.03 }),
    // Brass
    ch("Brassy", "Brass", { level: 0.31, wave1: 0, wave2: 0, detune: 12, attack: 0.05, cutoff: 900, fenv: 0.7, fdecay: 0.4, reso: 0.15 }),
    ch("Brass Stab", "Brass", { level: 0.50, wave1: 0, wave2: 0, cutoff: 700, fenv: 0.8, fdecay: 0.2, decay: 0.3, sustain: 0.3, release: 0.15 }),
    ch("Soft Horns", "Brass", { level: 0.24, wave1: 0, wave2: 1, mix: 0.3, attack: 0.12, cutoff: 1100, fenv: 0.4, fdecay: 0.5, sustain: 0.8, warmth: 0.5 }),
    ch("Swell Brass", "Brass", { level: 0.26, chord: 2, attack: 0.4, cutoff: 500, fenv: 0.9, fdecay: 1.2, reso: 0.2, release: 0.6 }),
    ch("Fanfare", "Brass", { level: 0.33, wave1: 0, wave2: 0, semi2: 12, mix: 0.3, cutoff: 2000, fenv: 0.5, fdecay: 0.3, voicing: 0.8, strum: 0.15 }),
    // Synth
    ch("Stab Club", "Synth", { level: 0.50, chord: 2, cutoff: 900, reso: 0.35, fenv: 0.7, fdecay: 0.18, decay: 0.2, sustain: 0, release: 0.15 }),
    ch("Pluck Chords", "Synth", { level: 0.50, decay: 0.25, sustain: 0, release: 0.3, fenv: 0.6, fdecay: 0.15, cutoff: 1200 }),
    ch("Lead Saw", "Synth", { level: 0.48, chord: 0, detune: 14, cutoff: 4500, reso: 0.25, fenv: 0.2, sustain: 0.8, warmth: 0.1 }),
    ch("Rave Hoover", "Synth", { level: 0.29, wave1: 0, wave2: 0, detune: 40, cutoff: 3000, "tk:uni": 4, "tk:uniDet": 0.8, "tk:pAmt": -12, "tk:pDec": 0.15, warmth: 0.2 }),
    ch("Detuned Chords", "Synth", { level: 0.25, chord: 2, wave1: 0, wave2: 0, detune: 30, cutoff: 3500, "tk:uni": 3, "tk:uniDet": 0.5 }),
    ch("Acid Chords", "Synth", { level: 0.64, wave1: 0, wave2: 0, cutoff: 500, reso: 0.6, fenv: 0.7, fdecay: 0.15, decay: 0.2, sustain: 0.2, warmth: 0.1 }),
    // Bells
    ch("Bell Sevenths", "Bells", { level: 0.51, chord: 2, wave1: 3, wave2: 2, semi2: 12, mix: 0.35, decay: 1.4, sustain: 0, release: 1.2, cutoff: 8000, warmth: 0 }),
    ch("Music Box", "Bells", { level: 0.81, chord: 1, strum: 0.3, wave1: 3, wave2: 3, semi2: 12, mix: 0.5, decay: 1, sustain: 0, release: 1, cutoff: 9000, warmth: 0, "ifx:type": 14, "ifx:a": 0.4, "ifx:b": 0.3 }),
    ch("Glass Bells", "Bells", { level: 0.36, wave1: 2, wave2: 3, semi2: 12, decay: 1.6, sustain: 0, release: 1.5, cutoff: 7000, warmth: 0.05, "ifx:type": 15, "ifx:a": 0.5, "ifx:b": 0.35 }),
    ch("Chime Pad", "Bells", { level: 0.28, chord: 2, wave1: 3, wave2: 2, attack: 0.01, decay: 2.5, sustain: 0.2, release: 2.5, voicing: 1, strum: 0.4 }),
  ],
};

export const INSTRUMENTS: Record<InstrumentKind, InstrumentDef> = {
  drums: DRUMS, acid: ACID, poly: POLY, lead: LEAD, analog: ANALOG, wobble: WOBBLE, pad: PAD,
  chip: CHIP, fm: FM, wave: WAVE, sampler: SAMPLER, epiano: TINE,
};

/** Every instrument, in picker order. */
export const ALL_KINDS: InstrumentKind[] = ["drums", "analog", "acid", "wobble", "poly", "epiano", "pad", "fm", "wave", "lead", "chip", "sampler"];

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
  if (p.unit === "Hz") return v >= 1000 ? (v / 1000).toFixed(1) + "k" : v < 10 ? v.toFixed(v < 1 ? 2 : 1) : Math.round(v) + "";
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
