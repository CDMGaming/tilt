// Phase 4 instruments (new): definitions (params, macros, presets). DSP lives in dsp/instruments4-dsp.ts.

import type { InstrumentDef } from "./instruments";

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
