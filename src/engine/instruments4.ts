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
    pl("Steel Guitar", { level: 0.39, body: 0 }),
    pl("Muted Funk", { level: 0.57, body: 0, damp: 0.75, pick: 0.7, decay: 0.6 }),
    pl("Bright Strum", { level: 0.42, body: 0, pick: 0.85, bright: 0.5, room: 0.3 }),
    pl("Twelve-ish", { level: 0.46, body: 0, metal: 0.4, pick: 0.6, "ifx:type": 8, "ifx:a": 0.3, "ifx:b": 0.6 }),
    pl("Nylon", { level: 0.32, body: 1, pick: 0.35, decay: 2.5 }),
    pl("Soft Nylon", { level: 0.16, body: 1, pick: 0.15, damp: 0.35, room: 0.35 }),
    pl("Harp", { level: 0.20, body: 2, pick: 0.4, decay: 4, room: 0.45 }),
    pl("Glass Harp", { level: 0.24, body: 2, pick: 0.6, metal: 0.5, decay: 5, room: 0.6, bright: 0.4 }),
    pl("Koto-ish", { level: 0.51, body: 2, pick: 0.85, metal: 0.25, decay: 1.6, damp: 0.3 }),
    pl("Sitar-ish", { level: 0.50, body: 0, pick: 0.9, metal: 0.8, decay: 3, bright: 0.4 }),
    // Basses
    pl("Finger Bass", { level: 0.27, body: 3, pick: 0.35, decay: 1.5 }),
    pl("Pick Bass", { level: 0.45, body: 3, pick: 0.8, bright: 0.3, decay: 1.2 }),
    pl("Muted Bass", { level: 0.46, body: 3, pick: 0.4, damp: 0.7, decay: 0.6 }),
    pl("Upright-ish", { level: 0.26, body: 3, pick: 0.2, damp: 0.4, decay: 0.9, room: 0.25 }),
    // Bars
    pl("Kalimba", { level: 0.40, body: 4, pick: 0.45, decay: 3.5 }),
    pl("Thumb Piano", { level: 0.44, body: 4, pick: 0.3, metal: 0, damp: 0.3, decay: 2.5, room: 0.3 }),
    pl("Music Box", { level: 0.25, body: 4, pick: 0.6, metal: 0.8, decay: 5.5, room: 0.45 }),
    pl("Marimba", { level: 0.43, body: 5, pick: 0.45, decay: 3 }),
    pl("Soft Mallets", { level: 0.35, body: 5, pick: 0.15, decay: 4, room: 0.35 }),
    pl("Glockenspiel", { level: 0.28, body: 5, pick: 0.75, metal: 1, decay: 6.25, room: 0.35 }),
    pl("Vibes-ish", { level: 0.34, body: 5, pick: 0.35, metal: 0.75, decay: 8.75, damp: 0.1, "ifx:type": 10, "ifx:a": 0.45, "ifx:b": 0.4 }),
    pl("Log Drum", { level: 0.62, body: 5, pick: 0.25, metal: 0, decay: 1.25, damp: 0.3 }),
    // Drums and bells
    pl("Steel Drum", { level: 0.39, body: 6, pick: 0.45, decay: 4 }),
    pl("Bright Pan", { level: 0.33, body: 6, pick: 0.75, metal: 0.6, decay: 5, room: 0.3 }),
    pl("Church Bell", { level: 0.18, body: 7, pick: 0.6, metal: 1, decay: 12, room: 0.6 }),
    pl("Tiny Bell", { level: 0.38, body: 7, pick: 0.8, metal: 0.8, decay: 5, bright: 0.5 }),
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
