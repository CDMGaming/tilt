// Phase 4 instruments (new): definitions (params, macros, presets). DSP lives in dsp/instruments4-dsp.ts.

import type { InstrumentDef } from "./instruments";
import type { Track } from "./model";

// ---------- electric piano: "Tine" (FM, no samples) ----------

const tn = (name: string, params: Record<string, number>) => ({ name, params });

export const TINE: InstrumentDef = {
  kind: "epiano",
  name: "Tine",
  role: "The bell-and-bark electric piano",
  group: "harmony",
  params: [
    { id: "trem", label: "Tremolo", min: 0, max: 2, def: 0, options: ["Off", "Mono", "Stereo"] },
    { id: "tremRate", label: "Trem rate", min: 0.5, max: 10, def: 4.5, curve: "exp", unit: "Hz" },
    { id: "tremDepth", label: "Trem depth", min: 0, max: 1, def: 0.4 },
    { id: "bark", label: "Bark", min: 0, max: 1, def: 0.35 },
    { id: "keyOff", label: "Key-off", min: 0, max: 1, def: 0.3 },
    { id: "tone", label: "Tone", min: 0, max: 1, def: 0.55 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing:
    { id: "index", label: "FM", min: 0, max: 4, def: 1.4 },
    { id: "bell", label: "Bell", min: 0, max: 1, def: 0.35 },
    { id: "decay", label: "Decay", min: 0.5, max: 8, def: 3, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.03, max: 2, def: 0.18, curve: "exp", unit: "s" },
  ],
  macros: ["bark", "tone", "tremDepth", "tremRate", "keyOff", "decay", "release", "level"],
  presets: [
    tn("Classic Tine", { level: 0.49 }),
    tn("Soft Tine", { level: 0.57, bark: 0.1, tone: 0.4, index: 1, bell: 0.2 }),
    tn("Stage Bark", { level: 0.42, bark: 0.75, tone: 0.65, index: 1.8 }),
    tn("Suitcase Trem", { level: 0.53, trem: 2, tremRate: 4.2, tremDepth: 0.6, bark: 0.3 }),
    tn("Mono Trem", { level: 0.67, trem: 1, tremRate: 5.5, tremDepth: 0.5, bark: 0.25, tone: 0.5 }),
    tn("Bell Tine", { level: 0.55, bell: 0.8, index: 1.8, bark: 0.2, tone: 0.75 }),
    tn("Glassy", { level: 0.54, bell: 0.6, index: 0.9, bark: 0.05, tone: 0.85, "ifx:type": 8, "ifx:a": 0.3, "ifx:b": 0.4 }),
    tn("Dark Room", { level: 0.55, tone: 0.2, bark: 0.2, bell: 0.15, keyOff: 0.5 }),
    tn("Ballad", { level: 0.54, bark: 0.15, tone: 0.45, trem: 2, tremRate: 3, tremDepth: 0.35, decay: 5, "ifx:type": 15, "ifx:a": 0.5, "ifx:b": 0.25 }),
    tn("Funk Bark", { level: 0.42, bark: 0.9, tone: 0.7, index: 2.2, decay: 1.5, keyOff: 0.6 }),
    tn("Mellow", { level: 0.61, bark: 0, tone: 0.3, index: 0.7, bell: 0.1 }),
    tn("Bright 80s", { level: 0.71, bell: 0.9, index: 2.6, tone: 0.9, bark: 0.1, "ifx:type": 8, "ifx:a": 0.4, "ifx:b": 0.5 }),
    tn("Chorus Tine", { level: 0.59, bark: 0.3, "ifx:type": 8, "ifx:a": 0.35, "ifx:b": 0.6 }),
    tn("Phase Tine", { level: 0.56, bark: 0.4, "ifx:type": 9, "ifx:a": 0.25, "ifx:b": 0.55 }),
    tn("Driven", { level: 0.62, bark: 1, tone: 0.6, index: 2, "ifx:type": 6, "ifx:a": 0.3, "ifx:b": 0.12 }),
    tn("Reedy", { level: 0.52, index: 2.4, bell: 0.05, bark: 0.6, tone: 0.5, decay: 1.8, trem: 1, tremRate: 6, tremDepth: 0.3 }),
    tn("Toy Piano", { level: 0.84, index: 3, bell: 1, tone: 1, bark: 0, decay: 1, release: 0.1 }),
    tn("Space Tine", { level: 0.47, bark: 0.2, trem: 2, tremRate: 2, tremDepth: 0.5, "ifx:type": 15, "ifx:a": 0.8, "ifx:b": 0.45 }),
    tn("Neo Soul", { level: 0.51, bark: 0.45, tone: 0.5, trem: 2, tremRate: 3.5, tremDepth: 0.3, keyOff: 0.4, "ifx:type": 8, "ifx:a": 0.25, "ifx:b": 0.3 }),
    tn("Gospel Keys", { level: 0.48, bark: 0.55, tone: 0.6, index: 1.6, decay: 4, "ifx:type": 14, "ifx:a": 0.4, "ifx:b": 0.25 }),
    tn("Dusty", { level: 0.55, tone: 0.25, bark: 0.35, keyOff: 0.6, trem: 1, tremRate: 4, tremDepth: 0.25, "ifx:type": 7, "ifx:a": 0.7, "ifx:b": 0.6 }),
    tn("Late Night", { level: 0.52, bark: 0.2, tone: 0.35, trem: 2, tremRate: 2.5, tremDepth: 0.45, decay: 5, release: 0.4 }),
    tn("Plucky Tine", { level: 0.58, decay: 0.8, release: 0.08, bark: 0.5, bell: 0.5, tone: 0.7 }),
    tn("Wide Pan", { level: 0.55, trem: 2, tremRate: 7, tremDepth: 0.9, bark: 0.35 }),
  ],
};

// ---------- physical modelling: "Pluck" (strings and struck things, no samples) ----------

export const PLUCK_BODIES = ["Guitar", "Nylon", "Harp", "Bass", "Kalimba", "Marimba", "Steel drum", "Bell"];
const pl = (name: string, params: Record<string, number>) => ({ name, params });

export const PLUCK: InstrumentDef = {
  kind: "pluck",
  name: "Pluck",
  role: "Plucked and struck things: strings, bars, drums",
  group: "harmony",
  params: [
    { id: "body", label: "Body", min: 0, max: 7, def: 0, options: PLUCK_BODIES },
    { id: "pick", label: "Pick", min: 0, max: 1, def: 0.5 },
    { id: "metal", label: "Wood ↔ Metal", min: 0, max: 1, def: 0.2 },
    { id: "damp", label: "Damp", min: 0, max: 1, def: 0.25 },
    { id: "decay", label: "Decay", min: 0.2, max: 12, def: 3.5, curve: "exp", unit: "s" },
    { id: "room", label: "Room", min: 0, max: 1, def: 0.2 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing:
    { id: "bright", label: "Brightness", min: -1, max: 1, def: 0 },
  ],
  macros: ["pick", "metal", "damp", "decay", "body", "room", "bright", "level"],
  presets: [
    // Strings
    pl("Steel Guitar", { level: 0.28, body: 0 }),
    pl("Muted Funk", { level: 0.29, body: 0, damp: 0.75, pick: 0.7, decay: 0.6 }),
    pl("Bright Strum", { level: 0.23, body: 0, pick: 0.85, bright: 0.5, room: 0.3 }),
    pl("Twelve-ish", { level: 0.36, body: 0, metal: 0.4, pick: 0.6, "ifx:type": 8, "ifx:a": 0.3, "ifx:b": 0.6 }),
    pl("Nylon", { level: 0.26, body: 1, pick: 0.35, decay: 2.5 }),
    pl("Soft Nylon", { level: 0.16, body: 1, pick: 0.15, damp: 0.35, room: 0.35 }),
    pl("Harp", { level: 0.20, body: 2, pick: 0.4, decay: 4, room: 0.45 }),
    pl("Glass Harp", { level: 0.23, body: 2, pick: 0.6, metal: 0.5, decay: 5, room: 0.6, bright: 0.4 }),
    pl("Koto-ish", { level: 0.26, body: 2, pick: 0.85, metal: 0.25, decay: 1.6, damp: 0.3 }),
    pl("Sitar-ish", { level: 0.26, body: 0, pick: 0.9, metal: 0.8, decay: 3, bright: 0.4 }),
    // Basses
    pl("Finger Bass", { level: 0.27, body: 3, pick: 0.35, decay: 1.5 }),
    pl("Pick Bass", { level: 0.27, body: 3, pick: 0.8, bright: 0.3, decay: 1.2 }),
    pl("Muted Bass", { level: 0.27, body: 3, pick: 0.4, damp: 0.7, decay: 0.6 }),
    pl("Upright-ish", { level: 0.25, body: 3, pick: 0.2, damp: 0.4, decay: 0.9, room: 0.25 }),
    // Bars
    pl("Kalimba", { level: 0.27, body: 4, pick: 0.45, decay: 3.5 }),
    pl("Thumb Piano", { level: 0.30, body: 4, pick: 0.3, metal: 0, damp: 0.3, decay: 2.5, room: 0.3 }),
    pl("Music Box", { level: 0.22, body: 4, pick: 0.6, metal: 0.8, decay: 5.5, room: 0.45 }),
    pl("Marimba", { level: 0.28, body: 5, pick: 0.45, decay: 3 }),
    pl("Soft Mallets", { level: 0.30, body: 5, pick: 0.15, decay: 4, room: 0.35 }),
    pl("Glockenspiel", { level: 0.24, body: 5, pick: 0.75, metal: 1, decay: 6.25, room: 0.35 }),
    pl("Vibes-ish", { level: 0.34, body: 5, pick: 0.35, metal: 0.75, decay: 8.75, damp: 0.1, "ifx:type": 10, "ifx:a": 0.45, "ifx:b": 0.4 }),
    pl("Log Drum", { level: 0.30, body: 5, pick: 0.25, metal: 0, decay: 1.25, damp: 0.3 }),
    // Drums and bells
    pl("Steel Drum", { level: 0.23, body: 6, pick: 0.45, decay: 4 }),
    pl("Bright Pan", { level: 0.22, body: 6, pick: 0.75, metal: 0.6, decay: 5, room: 0.3 }),
    pl("Church Bell", { level: 0.18, body: 7, pick: 0.6, metal: 1, decay: 12, room: 0.6 }),
    pl("Tiny Bell", { level: 0.21, body: 7, pick: 0.8, metal: 0.8, decay: 5, bright: 0.5 }),
    pl("Chime", { level: 0.20, body: 7, pick: 0.5, metal: 0.55, decay: 10, room: 0.5 }),
    pl("Gong-ish", { level: 0.18, body: 7, pick: 0.2, metal: 1, decay: 12, damp: 0, room: 0.5 }),
  ],
};

// ---------- tonewheel organ: "Wheelhouse" (additive, no samples) ----------

export const DRAWBAR_FEET = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
export const VIB_CHORUS = ["Off", "V1", "V2", "V3", "C1", "C2", "C3"];
const STEPS = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];

/** A registration: nine drawbar digits ("888000000") plus settings. */
const reg = (name: string, bars: string, params: Record<string, number> = {}) => ({
  name, params: { ...Object.fromEntries([...bars].map((d, k) => [`db${k}`, Number(d)])), ...params },
});

export const ORGAN: InstrumentDef = {
  kind: "organ",
  name: "Wheelhouse",
  role: "Drawbars, percussion and a rotating speaker",
  group: "harmony",
  params: [
    ...DRAWBAR_FEET.map((ft, k) => ({ id: `db${k}`, label: ft, min: 0, max: 8, def: [8, 8, 8, 0, 0, 0, 0, 0, 0][k], options: STEPS })),
    { id: "rotary", label: "Rotary", min: 0, max: 2, def: 1, options: ["Stop", "Slow", "Fast"] },
    { id: "vibChorus", label: "Vib / Chorus", min: 0, max: 6, def: 0, options: VIB_CHORUS },
    { id: "drive", label: "Drive", min: 0, max: 1, def: 0.25 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing:
    { id: "perc", label: "Percussion", min: 0, max: 2, def: 0, options: ["Off", "2nd", "3rd"] },
    { id: "percFast", label: "Perc decay", min: 0, max: 1, def: 1, options: ["Slow", "Fast"] },
    { id: "click", label: "Key click", min: 0, max: 1, def: 0.3 },
    { id: "leak", label: "Leakage", min: 0, max: 1, def: 0.1 },
  ],
  macros: ["drive", "rotary", "vibChorus", "db0", "db2", "db3", "db5", "level"],
  presets: [
    reg("Gospel Full", "888888888", { level: 0.30, rotary: 2, drive: 0.45 }),
    reg("Jazz Combo", "888000000", { level: 0.42, perc: 2, rotary: 1, vibChorus: 6, drive: 0.15 }),
    reg("Blues Shuffle", "888800000", { level: 0.33, perc: 1, rotary: 2, drive: 0.4 }),
    reg("Rock Bark", "888800008", { level: 0.28, drive: 0.85, rotary: 2, click: 0.6 }),
    reg("Soft Flute", "008000000", { level: 0.64, rotary: 1, vibChorus: 2, drive: 0, click: 0.1 }),
    reg("Mellow", "806000000", { level: 0.47, vibChorus: 5, rotary: 1, drive: 0.1 }),
    reg("Bright Stops", "888888000", { level: 0.31, rotary: 1, drive: 0.3 }),
    reg("Percussive", "800000000", { level: 0.42, perc: 2, percFast: 1, rotary: 0, click: 0.5 }),
    reg("Ballad", "838000000", { level: 0.49, rotary: 1, vibChorus: 6, drive: 0.05 }),
    reg("Reedy", "688600000", { level: 0.36, rotary: 1, drive: 0.3 }),
    reg("Whistle", "000000008", { level: 0.71, rotary: 1, vibChorus: 3, drive: 0 }),
    reg("Dark Pad", "860000000", { level: 0.55, rotary: 1, vibChorus: 6, drive: 0.1, click: 0 }),
    reg("Cathedral", "888888886", { level: 0.22, rotary: 0, vibChorus: 0, drive: 0, click: 0.1, "ifx:type": 15, "ifx:a": 0.8, "ifx:b": 0.45 }),
    reg("Funk Stab", "888000000", { level: 0.32, perc: 1, percFast: 1, drive: 0.35, rotary: 0, click: 0.6 }),
    reg("Soul", "868000000", { level: 0.42, perc: 2, vibChorus: 6, rotary: 1, drive: 0.2 }),
    reg("Screamer", "888888888", { level: 0.26, drive: 1, rotary: 2, click: 0.7 }),
    reg("Cinema", "876543210", { level: 0.42, rotary: 1, vibChorus: 5, drive: 0.1 }),
    reg("Bass Pedal", "860000000", { level: 0.41, rotary: 0, drive: 0.2, click: 0.2 }),
    reg("Hollow", "808080800", { level: 0.37, rotary: 1, vibChorus: 4, drive: 0.1 }),
    reg("Bells", "800008008", { level: 0.42, perc: 2, percFast: 0, rotary: 1, drive: 0.05 }),
    reg("Skank", "888000000", { level: 0.36, perc: 0, rotary: 0, drive: 0.1, click: 0.7 }),
    reg("Gentle", "606000000", { level: 0.79, vibChorus: 1, rotary: 1, drive: 0, click: 0.05 }),
    reg("Swirl", "888600000", { level: 0.40, rotary: 2, vibChorus: 5, drive: 0.2 }),
    reg("Garage Organ", "008808000", { level: 0.29, drive: 0.6, rotary: 2, vibChorus: 3, click: 0.4 }),
  ],
};

// ---------- supersaw: "Anthem" ----------

const an = (name: string, params: Record<string, number>) => ({ name, params });

export const ANTHEM: InstrumentDef = {
  kind: "anthem",
  name: "Anthem",
  role: "The huge festival supersaw",
  group: "lead",
  params: [
    { id: "twist", label: "Twist", min: 0, max: 1, def: 0.6 },
    { id: "diffuse", label: "Diffuse", min: 0, max: 1, def: 0.3 },
    { id: "bottom", label: "Bottom", min: 0, max: 1, def: 0.2 },
    { id: "shine", label: "Shine", min: 0, max: 1, def: 0.3 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing (Pump and Repeat are the shared performer's tk:pump / tk:repeat):
    { id: "glide", label: "Glide", min: 0, max: 0.5, def: 0 },
    { id: "cutoff", label: "Cutoff", min: 200, max: 16000, def: 9000, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.1 },
    { id: "fenv", label: "Filter env", min: 0, max: 1, def: 0.2 },
    { id: "fdecay", label: "F decay", min: 0.02, max: 3, def: 0.4, curve: "exp", unit: "s" },
    { id: "attack", label: "Attack", min: 0.001, max: 3, def: 0.01, curve: "exp", unit: "s" },
    { id: "decay", label: "Decay", min: 0.02, max: 3, def: 0.5, curve: "exp", unit: "s" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0.85 },
    { id: "release", label: "Release", min: 0.01, max: 4, def: 0.35, curve: "exp", unit: "s" },
  ],
  macros: ["twist", "diffuse", "tk:pump", "tk:repeat", "bottom", "shine", "glide", "level"],
  presets: [
    // Leads
    an("Festival", { level: 0.28,}),
    an("Main Stage", { level: 0.26, twist: 0.85, diffuse: 0.4, shine: 0.45, "tk:pump": 0.5 }),
    an("Hands Up", { level: 0.26, twist: 0.75, shine: 0.35, glide: 0.04, cutoff: 12000 }),
    an("Trance Gate", { level: 0.24, twist: 0.7, "tk:repeat": 0.8, "tk:repDiv": 1, shine: 0.5 }),
    an("Thin Lead", { level: 0.31, twist: 0.25, diffuse: 0.1, shine: 0.2, cutoff: 7000 }),
    an("Glide Lead", { level: 0.31, twist: 0.5, glide: 0.12, shine: 0.3 }),
    an("Stutter Lead", { level: 0.29, twist: 0.6, "tk:repeat": 0.6, "tk:repDiv": 2, shine: 0.25 }),
    an("Hardstyle-ish", { level: 0.51, twist: 0.9, bottom: 0.3, cutoff: 6000, reso: 0.25, fenv: 0.4, "ifx:type": 6, "ifx:a": 0.4, "ifx:b": 0.15 }),
    an("Pluck Saw", { level: 0.46, twist: 0.55, attack: 0.002, decay: 0.25, sustain: 0, release: 0.2, fenv: 0.6, fdecay: 0.15, cutoff: 2000, shine: 0.4 }),
    an("Big Pluck", { level: 0.66, twist: 0.8, attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.3, fenv: 0.5, fdecay: 0.2, cutoff: 3000, shine: 0.5, "tk:pump": 0.4 }),
    an("Euphoria", { level: 0.19, twist: 1, diffuse: 0.6, shine: 0.7, "tk:pump": 0.35 }),
    an("Laser Saw", { level: 0.27, twist: 0.6, fenv: 0.9, fdecay: 0.08, cutoff: 1500, reso: 0.4 }),
    // Pads and chords
    an("Saw Pad", { level: 0.21, twist: 0.9, diffuse: 0.7, attack: 0.6, release: 2, shine: 0.6, cutoff: 5000 }),
    an("Pump Pad", { level: 0.31, twist: 0.8, diffuse: 0.5, attack: 0.05, release: 0.6, "tk:pump": 0.8, shine: 0.4 }),
    an("Wide Chords", { level: 0.26, twist: 0.75, diffuse: 0.8, shine: 0.4, sustain: 0.9 }),
    an("Dark Stack", { level: 0.28, twist: 0.7, cutoff: 1800, diffuse: 0.4, bottom: 0.35, shine: 0.3 }),
    an("Sunrise", { level: 0.17, twist: 0.65, attack: 1.2, release: 2.5, diffuse: 0.6, shine: 0.8, cutoff: 4000 }),
    an("Gated Pad", { level: 0.33, twist: 0.8, diffuse: 0.6, "tk:repeat": 0.9, "tk:repDiv": 1, shine: 0.3, attack: 0.1 }),
    // Basses and stabs
    an("Saw Bass", { level: 0.24, twist: 0.35, bottom: 0.6, cutoff: 1500, shine: 0, diffuse: 0, release: 0.12 }),
    an("Reese-ish", { level: 0.25, twist: 0.3, bottom: 0.5, cutoff: 900, reso: 0.2, shine: 0, diffuse: 0.1, sustain: 1 }),
    an("Stab", { level: 0.55, twist: 0.7, attack: 0.002, decay: 0.15, sustain: 0, release: 0.1, fenv: 0.5, fdecay: 0.1, shine: 0.35 }),
    an("Pump Stab", { level: 0.93, twist: 0.75, attack: 0.002, decay: 0.3, sustain: 0.2, release: 0.15, "tk:pump": 0.7, shine: 0.3 }),
    // FX
    an("Riser Saw", { level: 0.63, twist: 0.9, attack: 2.5, cutoff: 600, fenv: 0, glide: 0.4, shine: 0.6, diffuse: 0.5 }),
    an("Crowd Roar", { level: 0.11, twist: 1, diffuse: 1, shine: 1, cutoff: 3500, attack: 0.3, release: 3 }),
  ],
};

// ---------- semi-modular mono: "Patchwork" ----------

export const PW_JACKS = ["Off", "Pitch", "PW", "VCO 2 pitch", "VCO 1 level", "VCO 2 level", "Noise level", "Cutoff", "VCA", "MG 1 rate", "MG 2 rate"];
const MG_SHAPES = ["Triangle", "Saw", "Square", "S&H"];
const pw = (name: string, params: Record<string, number>) => ({ name, params });
// Jack numbers, for the presets' patches.
const J = { off: 0, pitch: 1, pw: 2, vco2: 3, lv1: 4, lv2: 5, noise: 6, cutoff: 7, vca: 8, mg1: 9, mg2: 10 };

export const PATCHWORK: InstrumentDef = {
  kind: "patch",
  name: "Patchwork",
  role: "A little patchable mono synth for deep basses",
  group: "bass",
  params: [
    { id: "vco1", label: "VCO 1", min: 0, max: 1, def: 0.8 },
    { id: "vco2", label: "VCO 2", min: 0, max: 1, def: 0.5 },
    { id: "noise", label: "Noise", min: 0, max: 1, def: 0 },
    { id: "cutoff", label: "Cutoff", min: 40, max: 10000, def: 800, curve: "exp", unit: "Hz" },
    { id: "peak", label: "Peak", min: 0, max: 1, def: 0.4 },
    { id: "drive", label: "Drive", min: 0, max: 1, def: 0.3 },
    { id: "attack", label: "Attack", min: 0.001, max: 2, def: 0.005, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.005, max: 3, def: 0.2, curve: "exp", unit: "s" },
    { id: "mg1Rate", label: "MG 1 rate", min: 0.05, max: 30, def: 4, curve: "exp", unit: "Hz" },
    { id: "mg2Rate", label: "MG 2 rate", min: 0.05, max: 30, def: 0.5, curve: "exp", unit: "Hz" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // The patch: where each cable goes, and how much.
    { id: "mg1To", label: "MG 1 to", min: 0, max: 10, def: 0, options: PW_JACKS },
    { id: "mg2To", label: "MG 2 to", min: 0, max: 10, def: 0, options: PW_JACKS },
    { id: "egTo", label: "EG to", min: 0, max: 10, def: 7, options: PW_JACKS },
    { id: "mg1Amt", label: "MG 1 amount", min: -1, max: 1, def: 0.3 },
    { id: "mg2Amt", label: "MG 2 amount", min: -1, max: 1, def: 0.3 },
    { id: "egAmt", label: "EG amount", min: -1, max: 1, def: 0.4 },
    // Hidden voicing:
    { id: "mg1Shape", label: "MG 1 shape", min: 0, max: 3, def: 0, options: MG_SHAPES },
    { id: "mg2Shape", label: "MG 2 shape", min: 0, max: 3, def: 0, options: MG_SHAPES },
    { id: "vco2Semi", label: "VCO 2 interval", min: -24, max: 24, def: 7, unit: "st" },
    { id: "vco2Detune", label: "VCO 2 detune", min: -1, max: 1, def: 0.08 },
    { id: "glide", label: "Glide", min: 0.001, max: 0.5, def: 0.02, curve: "exp", unit: "s" },
  ],
  macros: ["cutoff", "peak", "drive", "vco2", "mg1Rate", "mg2Rate", "release", "level"],
  presets: [
    // Basses
    pw("Deep Patch", { level: 0.52,}),
    pw("Sub Floor", { level: 0.40, vco1: 0.6, vco2: 0.7, vco2Semi: -12, cutoff: 300, peak: 0.2, drive: 0.4 }),
    pw("Fat Fifth", { level: 0.37, vco2Semi: 7, vco2: 0.7, cutoff: 600, peak: 0.45, drive: 0.5, egAmt: 0.6 }),
    pw("Octave Growl", { level: 0.31, vco2Semi: 12, vco2: 0.6, cutoff: 500, peak: 0.6, drive: 0.7, mg1To: J.cutoff, mg1Rate: 5, mg1Amt: 0.25 }),
    pw("Pluck Bass", { level: 0.54, cutoff: 300, peak: 0.5, egAmt: 0.8, release: 0.08, attack: 0.002 }),
    pw("Rubber", { level: 0.60, vco2: 0.3, cutoff: 400, peak: 0.7, egAmt: 0.5, glide: 0.08 }),
    pw("Detuned Unison", { level: 0.40, vco2Semi: 0, vco2Detune: 0.25, vco2: 0.8, cutoff: 900, drive: 0.3 }),
    pw("PWM Bass", { level: 0.41, vco1: 0.3, vco2: 0.9, vco2Semi: 0, mg1To: J.pw, mg1Rate: 0.6, mg1Amt: 0.6, cutoff: 1200 }),
    pw("Dirty Square", { level: 0.21, vco1: 0, vco2: 1, vco2Semi: 0, drive: 0.9, cutoff: 1500, peak: 0.3 }),
    pw("Wah Bass", { level: 0.53, cutoff: 250, peak: 0.75, mg1To: J.cutoff, mg1Rate: 2, mg1Amt: 0.55, egTo: 0 }),
    // Leads
    pw("Patch Lead", { level: 0.48, vco2Semi: 12, vco2: 0.5, cutoff: 2500, peak: 0.3, glide: 0.06, mg2To: J.pitch, mg2Rate: 5.5, mg2Amt: 0.012 }),
    pw("Screamer", { level: 0.30, vco2Semi: 7, cutoff: 3000, peak: 0.85, drive: 0.8, egAmt: 0.3 }),
    pw("Sync-ish Sweep", { level: 0.52, vco2Semi: 19, vco2: 0.7, egTo: J.vco2, egAmt: 0.6, cutoff: 3500 }),
    pw("Flute Patch", { level: 0.44, vco1: 0.2, vco2: 0.6, vco2Semi: 12, noise: 0.15, cutoff: 1800, peak: 0.2, attack: 0.06, mg2To: J.pitch, mg2Rate: 5, mg2Amt: 0.01 }),
    // Sequenced / arp-ish
    pw("Bleep", { level: 0.39, vco1: 0, vco2: 1, vco2Semi: 12, cutoff: 2000, peak: 0.5, release: 0.05, egAmt: 0.7 }),
    pw("S&H Burble", { level: 0.52, cutoff: 900, peak: 0.7, mg1To: J.cutoff, mg1Shape: 3, mg1Rate: 8, mg1Amt: 0.6 }),
    pw("Trill", { level: 0.41, vco2Semi: 0, mg1To: J.pitch, mg1Shape: 2, mg1Rate: 9, mg1Amt: 0.08, cutoff: 2200 }),
    // FX
    pw("Siren", { level: 0.38, vco1: 0, vco2: 0.9, vco2Semi: 0, mg1To: J.pitch, mg1Rate: 0.6, mg1Amt: 0.5, cutoff: 3000, peak: 0.3 }),
    pw("Laser", { level: 0.57, egTo: J.pitch, egAmt: -1, attack: 0.001, release: 0.3, cutoff: 4000, peak: 0.6 }),
    pw("Wind", { level: 0.59, vco1: 0, vco2: 0, noise: 1, cutoff: 900, peak: 0.85, mg1To: J.cutoff, mg1Rate: 0.15, mg1Amt: 0.6, attack: 0.8, release: 1.5 }),
    pw("UFO", { level: 0.53, vco2Semi: 5, mg1To: J.pitch, mg1Rate: 7, mg1Amt: 0.15, mg2To: J.mg1, mg2Rate: 0.3, mg2Amt: 0.8, cutoff: 3000, peak: 0.5 }),
    pw("Wobble Patch", { level: 0.38, cutoff: 300, peak: 0.6, drive: 0.6, mg1To: J.cutoff, mg1Shape: 0, mg1Rate: 3, mg1Amt: 0.7, egTo: 0 }),
    pw("Tremolo Drone", { level: 0.49, vco2Semi: -12, mg1To: J.vca, mg1Rate: 6, mg1Amt: -0.8, cutoff: 700, attack: 0.5, release: 1.2 }),
    pw("Noise Snap", { level: 0.63, vco1: 0, vco2: 0.3, noise: 0.9, cutoff: 3000, peak: 0.5, release: 0.06, egAmt: 0.9 }),
  ],
};

// ---------- formant synth: "Vox" ----------

const vx = (name: string, params: Record<string, number>) => ({ name, params });
// Pad positions of the vowels (x, y), for presets.
const A = { vowelX: 0.5, vowelY: 1 }, E = { vowelX: 1, vowelY: 0.6 }, I = { vowelX: 1, vowelY: 0 }, O = { vowelX: 0, vowelY: 0.6 }, U = { vowelX: 0, vowelY: 0 };

export const VOX: InstrumentDef = {
  kind: "vox",
  name: "Vox",
  role: "Voices without singers: choirs and talking basses",
  group: "harmony",
  params: [
    { id: "vowelX", label: "Vowel X", min: 0, max: 1, def: 0.5 },
    { id: "vowelY", label: "Vowel Y", min: 0, max: 1, def: 0.8 },
    { id: "throat", label: "Throat", min: 0, max: 1, def: 0.5 },
    { id: "breath", label: "Breath", min: 0, max: 1, def: 0.15 },
    { id: "choir", label: "Choir", min: 1, max: 5, def: 3, options: ["1", "2", "3", "4", "5"] },
    { id: "attack", label: "Attack", min: 0.005, max: 3, def: 0.08, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.02, max: 5, def: 0.6, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing:
    { id: "vibrato", label: "Vibrato", min: 0, max: 1, def: 0.3 },
    { id: "vowelLfo", label: "Vowel LFO", min: 0, max: 1, def: 0 },
    { id: "vowelRate", label: "Vowel LFO rate", min: 0.1, max: 12, def: 2, curve: "exp", unit: "Hz" },
  ],
  macros: ["vowelX", "vowelY", "throat", "breath", "choir", "attack", "release", "level"],
  presets: [
    // Choirs and pads
    vx("Aah Choir", { level: 0.56, ...A, choir: 5, attack: 0.4, release: 1.5 }),
    vx("Ooh Choir", { level: 0.37, ...U, choir: 5, attack: 0.5, release: 1.8, throat: 0.45 }),
    vx("Oh Choir", { level: 0.51, ...O, choir: 4, attack: 0.4, release: 1.5 }),
    vx("Angel Pad", { level: 0.66, ...A, choir: 5, throat: 0.25, breath: 0.25, attack: 1, release: 2.5, "ifx:type": 15, "ifx:a": 0.7, "ifx:b": 0.4 }),
    vx("Monk Drone", { level: 0.44, ...O, choir: 4, throat: 0.85, breath: 0.1, attack: 0.8, release: 2, vibrato: 0.1 }),
    vx("Whisper Pad", { level: 0.39, ...E, choir: 3, breath: 1, attack: 0.6, release: 2, vibrato: 0 }),
    vx("Glass Voices", { level: 0.41, vowelX: 0.8, vowelY: 0.3, choir: 4, throat: 0.3, attack: 0.3, release: 1.5, "ifx:type": 8, "ifx:a": 0.3, "ifx:b": 0.5 }),
    vx("Haunted", { level: 0.38, ...U, choir: 5, throat: 0.6, breath: 0.4, vowelLfo: 0.3, vowelRate: 0.2, attack: 1.2, release: 3 }),
    // Talking basses
    vx("Talk Bass", { level: 0.45, ...O, choir: 1, throat: 0.75, vowelLfo: 0.8, vowelRate: 2, attack: 0.005, release: 0.12, vibrato: 0 }),
    vx("Yoi Bass", { level: 0.46, ...U, choir: 2, throat: 0.8, vowelLfo: 1, vowelRate: 4, attack: 0.005, release: 0.1, vibrato: 0 }),
    vx("Mouth Bass", { level: 0.39, ...A, choir: 1, throat: 0.9, attack: 0.005, release: 0.15, vibrato: 0, breath: 0.05 }),
    vx("Wah Bass", { level: 0.42, ...U, choir: 1, throat: 0.7, vowelLfo: 0.6, vowelRate: 1, attack: 0.01, release: 0.2, vibrato: 0 }),
    vx("Grunt", { level: 0.44, ...O, choir: 2, throat: 1, breath: 0.2, attack: 0.005, release: 0.1, vibrato: 0 }),
    // Leads
    vx("Robot Lead", { level: 0.31, ...E, choir: 1, throat: 0.55, vibrato: 0, attack: 0.01, release: 0.2 }),
    vx("Diva", { level: 0.60, ...A, choir: 1, throat: 0.35, vibrato: 0.7, attack: 0.08, release: 0.6, "ifx:type": 15, "ifx:a": 0.5, "ifx:b": 0.3 }),
    vx("Yeah Lead", { level: 0.40, vowelX: 0.8, vowelY: 0.5, choir: 2, throat: 0.45, vowelLfo: 0.25, vowelRate: 0.6, attack: 0.02, release: 0.3 }),
    vx("Chipmunk", { level: 0.44, ...I, choir: 1, throat: 0, vibrato: 0.5, attack: 0.01, release: 0.2 }),
    vx("Giant", { level: 0.34, ...O, choir: 2, throat: 1, vibrato: 0.2, attack: 0.05, release: 0.6 }),
    // Plucks and chops
    vx("Vox Pluck", { level: 0.52, ...A, choir: 2, attack: 0.003, release: 0.15, vibrato: 0, throat: 0.45 }),
    vx("Hey Stab", { level: 0.42, ...E, choir: 4, attack: 0.003, release: 0.12, breath: 0.3, vibrato: 0 }),
    vx("Ooh Stab", { level: 0.36, ...U, choir: 4, attack: 0.003, release: 0.2, vibrato: 0 }),
    // FX
    vx("Alien Chat", { level: 0.30, ...I, choir: 1, throat: 0.4, vowelLfo: 1, vowelRate: 9, vibrato: 0, attack: 0.01, release: 0.2 }),
    vx("Breath", { level: 0.41, ...A, choir: 1, breath: 1, vibrato: 0, attack: 0.2, release: 0.8 }),
    vx("Siren Choir", { level: 0.50, ...A, choir: 5, vowelLfo: 0.7, vowelRate: 0.3, vibrato: 0.6, attack: 0.5, release: 2 }),
  ],
};

// ---------- one-shot FX and stabs: "Boom" ----------

export const BOOM_PARTS = ["Riser", "Impact", "Sweep", "Stab"];
const bm = (name: string, params: Record<string, number>) => ({ name, params });

export const BOOM: InstrumentDef = {
  kind: "boom",
  name: "Boom",
  role: "Risers, impacts, sweeps and stabs in the song's key",
  group: "fx",
  drumParts: 4,
  partNames: BOOM_PARTS,
  params: [
    { id: "rise", label: "Rise", min: 0, max: 1, def: 0.5 },
    { id: "impact", label: "Impact", min: 0, max: 1, def: 0.5 },
    { id: "tune", label: "Tune", min: -12, max: 12, def: 0, unit: "st" },
    { id: "length", label: "Length", min: 0.25, max: 3, def: 1, curve: "exp" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.7 },
    // Hidden voicing:
    { id: "p0level", label: "Riser level", min: 0, max: 1, def: 0.8 },
    { id: "p1level", label: "Impact level", min: 0, max: 1, def: 0.9 },
    { id: "p2level", label: "Sweep level", min: 0, max: 1, def: 0.7 },
    { id: "p3level", label: "Stab level", min: 0, max: 1, def: 0.7 },
  ],
  macros: ["rise", "impact", "tune", "length", "p0level", "p1level", "p2level", "level"],
  presets: [
    bm("Big Drop", { level: 1.00 }),
    bm("Festival Drop", { level: 0.68, rise: 1, impact: 0.85, length: 1.4 }),
    bm("Short Build", { level: 1.00, rise: 0.2, impact: 0.5, length: 0.8 }),
    bm("Long Build", { level: 0.90, rise: 1, impact: 0.6, length: 1.6 }),
    bm("Soft Swell", { level: 1.00, rise: 0.6, impact: 0.15, length: 1.5, p1level: 0.5 }),
    bm("Cinematic", { level: 0.70, rise: 0.9, impact: 1, length: 2.5, tune: -5 }),
    bm("Trap Impact", { level: 0.78, rise: 0.3, impact: 0.9, length: 2, tune: -7 }),
    bm("Thin Air", { level: 1.00, rise: 0.7, impact: 0.2, length: 0.7, tune: 7 }),
    bm("Deep Sub", { level: 0.62, rise: 0.4, impact: 0.7, length: 2.2, tune: -12 }),
    bm("Bright Stab", { level: 1.00, rise: 0.5, impact: 0.2, length: 0.6, tune: 12 }),
    bm("Dirty Stab", { level: 0.65, rise: 0.5, impact: 0.9, length: 0.8 }),
    bm("Long Stab", { level: 1.00, rise: 0.5, impact: 0.3, length: 2.4 }),
    bm("Low Stab", { level: 0.83, rise: 0.5, impact: 0.5, length: 1, tune: -12 }),
    bm("Downlift", { level: 1.00, rise: 0.5, impact: 0.3, length: 2.5, p2level: 0.9 }),
    bm("Tight Hits", { level: 1.00, rise: 0.3, impact: 0.6, length: 0.4 }),
    bm("Boomy", { level: 0.51, rise: 0.5, impact: 1, length: 3 }),
    bm("Gentle", { level: 1.00, rise: 0.4, impact: 0.1, length: 1.2, p0level: 1, p2level: 1, p3level: 1 }),
    bm("Distorted", { level: 0.62, rise: 0.6, impact: 1, length: 1, tune: -3 }),
    bm("Quick Rise", { level: 1.00, rise: 0, impact: 0.5, length: 0.6 }),
    bm("Tension", { level: 1.00, rise: 1, impact: 0.4, length: 1.2, tune: 5 }),
    bm("Thunder", { level: 0.50, rise: 0.6, impact: 0.95, length: 3, tune: -9, p2level: 0.9 }),
    bm("Pop Drop", { level: 1.00, rise: 0.6, impact: 0.45, length: 0.9, tune: 2 }),
    bm("Sub Boom", { level: 0.37, rise: 0.3, impact: 0.8, length: 2.6, tune: -10, p3level: 0.4 }),
    bm("Airy", { level: 1.00, rise: 0.8, impact: 0.15, length: 1.8, tune: 12, p1level: 0.4 }),
  ],
};

// ---------- sampled piano: "Parlor" (CC0 samples, public/piano) ----------

const PIANO_NOTES = ["C0", "G0", "C1", "G1", "C2", "G2", "C3", "G3", "C4", "G4", "C5", "G5", "C6"];
export const PIANO_CATS = ["Grand", "Upright", "Felt", "Colour"];
const pn = (name: string, cat: string, params: Record<string, number>) => ({ name, cat, params });

/** The sample files an instrument plays from (loaded on first use), or null if it has none. */
export function sampleSetRefs(t: Track): string[] | null {
  if (t.kind === "piano") return PIANO_NOTES.flatMap((n) => [`asset:piano/${n}-soft`, `asset:piano/${n}-hard`]);
  if (t.kind === "garage") {
    // Each part's soft and hard sound; the Kit picks the snare (and its rim).
    const kit = Math.round(t.params.kit ?? 0);
    const snare = ["snare", "snare2", "oldsnare", "deadsnare"][kit] ?? "snare";
    const layers = (x: string) => [`asset:garage/${x}-soft`, `asset:garage/${x}-hard`];
    const rim = kit === 2 ? ["asset:garage/oldrim", "asset:garage/oldrim"] : layers("rim");
    const cym = (t.params.cymbal ?? 0) >= 0.5 ? ["asset:garage/ride", "asset:garage/ride"] : layers("cym");
    return [...layers("kick"), ...layers(snare), ...rim, ...layers("chat"), ...layers("ohat"), ...layers("tomh"), ...layers("toml"), ...cym];
  }
  return null;
}

export const PARLOR: InstrumentDef = {
  kind: "piano",
  name: "Parlor",
  role: "A real piano, simple to play and to shape",
  group: "harmony",
  params: [
    { id: "character", label: "Character", min: 0, max: 1, def: 0.5 },
    { id: "release", label: "Release", min: 0.05, max: 3, def: 0.4, curve: "exp", unit: "s" },
    { id: "low", label: "Low", min: -12, max: 12, def: 0, unit: "dB" },
    { id: "mid", label: "Mid", min: -12, max: 12, def: 0, unit: "dB" },
    { id: "high", label: "High", min: -12, max: 12, def: 0, unit: "dB" },
    { id: "room", label: "Room", min: 0, max: 1, def: 0.25 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.7 },
    // Hidden voicing:
    { id: "felt", label: "Felt", min: 0, max: 1, def: 0 },
    { id: "width", label: "Width", min: 0, max: 1, def: 0.5 },
    { id: "stretch", label: "Stretch", min: 0, max: 1, def: 0.3 },
    { id: "velCurve", label: "Velocity curve", min: 0.5, max: 2, def: 1 },
  ],
  macros: ["character", "release", "low", "mid", "high", "room", "level", "velCurve"],
  presets: [
    // Grand-ish: wider, brighter, more room
    pn("Concert", "Grand", { level: 0.56, character: 0.6, width: 0.9, room: 0.45, high: 2, low: 2, stretch: 0.5 }),
    pn("Studio Grand", "Grand", { level: 0.79, character: 0.55, width: 0.8, room: 0.25, high: 1 }),
    pn("Bright Pop", "Grand", { level: 0.77, character: 0.85, high: 6, mid: 1, room: 0.2, width: 0.7 }),
    pn("Ballad Grand", "Grand", { level: 0.51, character: 0.4, release: 1, room: 0.6, width: 0.9, high: -1 }),
    pn("Rock Piano", "Grand", { level: 0.66, character: 0.95, high: 4, mid: 3, room: 0.15, velCurve: 0.8 }),
    pn("Hall", "Grand", { level: 0.33, character: 0.5, room: 0.9, release: 1.2, width: 1 }),
    // Upright
    pn("Upright", "Upright", { level: 0.79 }),
    pn("Parlour Room", "Upright", { level: 0.68, room: 0.4, character: 0.45 }),
    pn("Close Mic", "Upright", { level: 0.87, room: 0.05, character: 0.6, high: 2, width: 0.3 }),
    pn("Soft Touch", "Upright", { level: 0.99, character: 0.2, velCurve: 1.5, high: -3 }),
    pn("Hard Touch", "Upright", { level: 0.65, character: 0.8, velCurve: 0.7, mid: 2 }),
    pn("Short Keys", "Upright", { level: 0.88, release: 0.08, character: 0.6, room: 0.1 }),
    // Felt
    pn("Felt", "Felt", { level: 0.72, felt: 1, character: 0.2, room: 0.35, release: 0.8 }),
    pn("Night Felt", "Felt", { level: 0.49, felt: 1, character: 0.1, room: 0.55, release: 1.5, high: -4, low: 2 }),
    pn("Muffled", "Felt", { level: 0.75, felt: 0.6, character: 0.3, high: -8, room: 0.3 }),
    pn("Lullaby", "Felt", { level: 0.45, felt: 1, character: 0.15, room: 0.7, release: 2, width: 0.9 }),
    pn("Intimate", "Felt", { level: 0.85, felt: 0.8, character: 0.25, room: 0.15, release: 0.6 }),
    pn("Soft Felt Wide", "Felt", { level: 0.60, felt: 1, character: 0.2, width: 1, room: 0.5 }),
    // Colour
    pn("Honky Tonk", "Colour", { level: 0.79, character: 0.8, mid: 3, room: 0.2, "ifx:type": 8, "ifx:a": 0.6, "ifx:b": 0.35 }),
    pn("Lo-fi Keys", "Colour", { level: 0.63, character: 0.4, high: -6, low: 3, room: 0.3, "ifx:type": 7, "ifx:a": 0.65, "ifx:b": 0.55 }),
    pn("Tape Piano", "Colour", { level: 0.97, character: 0.45, high: -3, room: 0.25, "ifx:type": 8, "ifx:a": 0.15, "ifx:b": 0.3 }),
    pn("Phased", "Colour", { level: 1.00, character: 0.5, room: 0.2, "ifx:type": 9, "ifx:a": 0.2, "ifx:b": 0.5 }),
    pn("Echo Keys", "Colour", { level: 0.76, character: 0.5, room: 0.3, "ifx:type": 13, "ifx:a": 0.45, "ifx:b": 0.3 }),
    pn("Telephone", "Colour", { level: 0.65, character: 0.7, low: -12, high: -10, mid: 6, room: 0.05 }),
  ],
};

// ---------- acoustic drums: "Garage" (CC0 samples, public/garage) ----------

export const GARAGE_KITS = ["Studio", "Bright", "Vintage", "Dead"];
export const GARAGE_PARTS = ["Kick", "Snare", "Rim", "C-Hat", "O-Hat", "Tom Hi", "Tom Lo", "Cymbal"];
const gk = (name: string, params: Record<string, number>) => ({ name, params });

export const GARAGE: InstrumentDef = {
  kind: "garage",
  name: "Garage",
  role: "A real kit in a room",
  group: "drums",
  drumParts: 8,
  partNames: GARAGE_PARTS,
  params: [
    { id: "kit", label: "Kit", min: 0, max: 3, def: 0, options: GARAGE_KITS },
    { id: "room", label: "Room", min: 0, max: 1, def: 0.35 },
    { id: "smash", label: "Smash", min: 0, max: 1, def: 0.25 },
    { id: "tune", label: "Tune", min: -7, max: 7, def: 0, unit: "st" },
    { id: "damp", label: "Damp", min: 0, max: 1, def: 0.2 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.75 },
    // Hidden voicing: per-part level and tune, the cymbal (crash or ride bell).
    ...GARAGE_PARTS.flatMap((name, i) => [
      { id: `p${i}level`, label: `${name} level`, min: 0, max: 1, def: [0.95, 0.8, 0.6, 0.5, 0.45, 0.7, 0.75, 0.45][i] },
      { id: `p${i}tune`, label: `${name} tune`, min: -12, max: 12, def: 0, unit: "st" },
    ]),
    { id: "cymbal", label: "Cymbal", min: 0, max: 1, def: 0, options: ["Crash", "Ride bell"] },
  ],
  macros: ["room", "smash", "kit", "tune", "damp", "p0level", "p1level", "level"],
  presets: [
    gk("Studio Kit", { level: 0.60,}),
    gk("Live Room", { level: 0.39, room: 0.75, smash: 0.2 }),
    gk("Dry Funk", { level: 0.76, kit: 1, room: 0.05, damp: 0.5, smash: 0.3, p2level: 0.7 }),
    gk("Big Rock", { level: 0.32, room: 0.6, smash: 0.75, tune: -2, p0level: 1 }),
    gk("Vintage", { level: 0.52, kit: 2, room: 0.4, damp: 0.35, tune: 1 }),
    gk("Dead 70s", { level: 0.80, kit: 3, room: 0.1, damp: 0.7, smash: 0.2, tune: -1 }),
    gk("Jazz Club", { level: 0.79, kit: 1, room: 0.45, damp: 0.1, smash: 0, tune: 3, cymbal: 1, p0level: 0.7 }),
    gk("Crushed", { level: 0.27, room: 0.5, smash: 1, damp: 0.2 }),
    gk("Tight Pop", { level: 0.72, kit: 1, room: 0.15, smash: 0.4, damp: 0.45, tune: 2 }),
    gk("Hall Drums", { level: 0.29, room: 1, smash: 0.15, damp: 0 }),
    gk("Low Tuned", { level: 0.52, tune: -5, room: 0.4, smash: 0.35 }),
    gk("High Tuned", { level: 0.74, tune: 5, room: 0.3, kit: 1 }),
    gk("Lo-fi Kit", { level: 0.53, kit: 2, room: 0.3, damp: 0.6, smash: 0.5, "ifx:type": 7, "ifx:a": 0.6, "ifx:b": 0.5 }),
    gk("Breakbeat", { level: 0.50, kit: 1, room: 0.25, smash: 0.65, damp: 0.3, tune: 1 }),
    gk("Ride Groove", { level: 0.62, cymbal: 1, room: 0.35, smash: 0.2 }),
    gk("Thud", { level: 0.78, kit: 3, damp: 0.85, room: 0.05, tune: -3, smash: 0.3 }),
    gk("Arena", { level: 0.29, room: 0.85, smash: 0.6, tune: -1, p0level: 1, p1level: 0.9 }),
    gk("Garage Band", { level: 0.42, kit: 2, room: 0.55, smash: 0.45 }),
    gk("Session", { level: 0.62, room: 0.3, smash: 0.3, damp: 0.25 }),
    gk("Bedroom", { level: 0.79, kit: 1, room: 0.15, damp: 0.4, smash: 0.15, "ifx:type": 2, "ifx:a": 0.7, "ifx:b": 0.2 }),
    gk("Marching-ish", { level: 0.48, kit: 0, room: 0.6, damp: 0, tune: 2, p1level: 1 }),
    gk("Soft Brushes-ish", { level: 0.69, kit: 3, room: 0.4, damp: 0.5, smash: 0, p3level: 0.35 }),
    gk("Hip Hop Kit", { level: 0.46, kit: 2, room: 0.2, smash: 0.7, damp: 0.5, tune: -2 }),
    gk("Punk", { level: 0.34, kit: 1, room: 0.35, smash: 0.9, tune: 1, damp: 0.15 }),
  ],
};
