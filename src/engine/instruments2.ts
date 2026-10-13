// Phase 2 instruments: definitions (params, macros, presets). DSP lives in dsp/instruments2-dsp.ts.

import type { InstrumentDef } from "./instruments";

// ---------- lead synth: "Razor" (hard-sync oscillator, unison) ----------

export const UNISON_COUNTS = [1, 3, 5, 7];

export const LEAD: InstrumentDef = {
  kind: "lead",
  name: "Razor",
  role: "Mono lead: hard-sync oscillator, unison",
  group: "lead",
  params: [
    { id: "wave", label: "Wave", min: 0, max: 1, def: 0, options: ["Saw", "Square"] },
    { id: "sync", label: "Sync", min: 0, max: 24, def: 7, unit: "st" },
    { id: "syncEnv", label: "Sync env", min: 0, max: 1, def: 0.35 },
    { id: "unison", label: "Unison", min: 0, max: 3, def: 1, options: ["1", "3", "5", "7"] },
    { id: "detune", label: "Detune", min: 0, max: 1, def: 0.3 },
    { id: "spread", label: "Spread", min: 0, max: 1, def: 0.6 },
    { id: "cutoff", label: "Cutoff", min: 100, max: 16000, def: 5000, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.2 },
    { id: "fenv", label: "Filter env", min: 0, max: 1, def: 0.35 },
    { id: "envDecay", label: "Env decay", min: 0.02, max: 2, def: 0.3, curve: "exp", unit: "s" },
    { id: "attack", label: "Attack", min: 0.001, max: 2, def: 0.005, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.01, max: 3, def: 0.25, curve: "exp", unit: "s" },
    { id: "glide", label: "Glide", min: 0.002, max: 0.6, def: 0.04, curve: "exp", unit: "s" },
    { id: "vibRate", label: "Vib rate", min: 0.5, max: 12, def: 5.5, curve: "exp", unit: "Hz" },
    { id: "vibDepth", label: "Vibrato", min: 0, max: 1, def: 0.15 },
    { id: "legato", label: "Legato", min: 0, max: 1, def: 1, options: ["Off", "On"] },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
  ],
  macros: ["sync", "syncEnv", "detune", "cutoff", "reso", "fenv", "glide", "level"],
  presets: [
    { name: "Sync Razor", params: {} },
    { name: "Supersaw Lead", params: { sync: 0, syncEnv: 0, unison: 3, detune: 0.55, spread: 0.9, cutoff: 9000, fenv: 0.15 } },
    { name: "Laser Sweep", params: { sync: 3, syncEnv: 1, envDecay: 0.6, unison: 1, detune: 0.2 } },
    { name: "Square Whistle", params: { wave: 1, sync: 12, syncEnv: 0.1, unison: 0, cutoff: 4000, vibDepth: 0.35 } },
    { name: "Fat Unison", params: { sync: 5, unison: 3, detune: 0.7, spread: 1, cutoff: 3000, reso: 0.3 } },
    { name: "Soft Flute", params: { wave: 1, sync: 0, syncEnv: 0, unison: 0, cutoff: 1800, attack: 0.08, vibDepth: 0.3, release: 0.5 } },
    { name: "Scream", params: { sync: 19, syncEnv: 0.6, unison: 2, cutoff: 12000, reso: 0.5, fenv: 0.5 } },
    { name: "Pluck Lead", params: { sync: 9, syncEnv: 0.8, envDecay: 0.15, fenv: 0.7, cutoff: 1500, release: 0.15, legato: 0 } },
    { name: "Slow Glide", params: { glide: 0.35, sync: 7, unison: 1, vibDepth: 0.25 } },
    { name: "Chip-ish", params: { wave: 1, sync: 0, syncEnv: 0, unison: 0, cutoff: 16000, fenv: 0, glide: 0.002, vibDepth: 0 } },
  ],
};

// ---------- analog drum modules: "Thump Lab" (all synthesis, no samples) ----------

export const ANALOG_PARTS = ["Kick", "Snare", "Tom", "Perc"];
export const PERC_SHAPES = ["Metal", "Click", "FM", "Noise"];

export const ANALOG: InstrumentDef = {
  kind: "analog",
  name: "Thump Lab",
  role: "Analog drum modules: kick, snare, tom, perc",
  group: "drums",
  drumParts: 4,
  partNames: ANALOG_PARTS,
  params: [
    { id: "kTune", label: "Tune", min: 30, max: 120, def: 52, curve: "exp", unit: "Hz" },
    { id: "kDecay", label: "Decay", min: 0.05, max: 2, def: 0.5, curve: "exp", unit: "s" },
    { id: "kBend", label: "Bend", min: 0, max: 1, def: 0.5 },
    { id: "kDrive", label: "Boost", min: 0, max: 1, def: 0.2 },
    { id: "kLevel", label: "Level", min: 0, max: 1, def: 0.9 },
    { id: "sTune", label: "Tune", min: 100, max: 400, def: 190, curve: "exp", unit: "Hz" },
    { id: "sDecay", label: "Decay", min: 0.05, max: 1, def: 0.22, curve: "exp", unit: "s" },
    { id: "sSnappy", label: "Snappy", min: 0, max: 1, def: 0.6 },
    { id: "sTone", label: "Tone", min: 0, max: 1, def: 0.55 },
    { id: "sLevel", label: "Level", min: 0, max: 1, def: 0.75 },
    { id: "tTune", label: "Tune", min: 60, max: 400, def: 120, curve: "exp", unit: "Hz" },
    { id: "tDecay", label: "Decay", min: 0.05, max: 1.5, def: 0.4, curve: "exp", unit: "s" },
    { id: "tBend", label: "Bend", min: 0, max: 1, def: 0.4 },
    { id: "tNoise", label: "Noise", min: 0, max: 1, def: 0.15 },
    { id: "tLevel", label: "Level", min: 0, max: 1, def: 0.7 },
    { id: "pTune", label: "Tune", min: 200, max: 3000, def: 800, curve: "exp", unit: "Hz" },
    { id: "pDecay", label: "Decay", min: 0.02, max: 1, def: 0.12, curve: "exp", unit: "s" },
    { id: "pShape", label: "Shape", min: 0, max: 3, def: 0, options: PERC_SHAPES },
    { id: "pDepth", label: "Depth", min: 0, max: 1, def: 0.5 },
    { id: "pLevel", label: "Level", min: 0, max: 1, def: 0.6 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.85 },
  ],
  macros: ["kTune", "kDecay", "kBend", "sTune", "sSnappy", "tTune", "pTune", "pDepth"],
  presets: [
    { name: "Classic Boom", params: {} },
    { name: "Tight Techno", params: { kTune: 55, kDecay: 0.3, kBend: 0.35, kDrive: 0.5, sDecay: 0.15, pShape: 0, pDecay: 0.05 } },
    { name: "Deep 808-ish", params: { kTune: 42, kDecay: 1.6, kBend: 0.25, kDrive: 0.3, sTune: 170, tTune: 90 } },
    { name: "Punch Box", params: { kDrive: 0.8, kBend: 0.7, sSnappy: 0.8, sTone: 0.8, tDecay: 0.25 } },
    { name: "Electro Toms", params: { tTune: 180, tBend: 0.8, tDecay: 0.6, pShape: 2, pTune: 600, pDepth: 0.8 } },
    { name: "Clicky", params: { kDecay: 0.18, kBend: 0.9, pShape: 1, pTune: 2200, pDecay: 0.03, sDecay: 0.1 } },
    { name: "Noise Lab", params: { sSnappy: 1, sTone: 0.9, pShape: 3, pTune: 2500, tNoise: 0.6 } },
    { name: "Soft Lo", params: { kTune: 48, kDecay: 0.8, kDrive: 0, sTone: 0.3, sSnappy: 0.4, pShape: 2, pDepth: 0.3 } },
  ],
};

// ---------- wobble bass: "Wobbler" ----------

export const WOB_RATES = ["1/2", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];
export const WOB_BEATS = [2, 1, 0.5, 1 / 3, 0.25, 1 / 6, 0.125];

export const WOBBLE: InstrumentDef = {
  kind: "wobble",
  name: "Wobbler",
  role: "Mono bass: cross-mod, crush filter, tempo wobble",
  group: "bass",
  params: [
    { id: "wave", label: "Wave", min: 0, max: 2, def: 0, options: ["Saw", "Square", "Sine"] },
    { id: "sub", label: "Sub", min: 0, max: 1, def: 0.5 },
    { id: "xWave", label: "X-mod wave", min: 0, max: 2, def: 0, options: ["Sine", "Saw", "Square"] },
    { id: "xTune", label: "X-mod tune", min: -12, max: 24, def: 7, unit: "st" },
    { id: "xmod", label: "X-mod", min: 0, max: 1, def: 0.3 },
    { id: "cutoff", label: "Cutoff", min: 40, max: 8000, def: 600, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.45 },
    { id: "crush", label: "Crush", min: 0, max: 1, def: 0.2 },
    { id: "wobble", label: "Wobble", min: 0, max: 1, def: 0.7 },
    { id: "wobRate", label: "Rate", min: 0, max: 6, def: 2, options: WOB_RATES },
    { id: "wobShape", label: "Shape", min: 0, max: 3, def: 0, options: ["Sine", "Saw", "Square", "Ramp"] },
    { id: "glide", label: "Glide", min: 0.002, max: 0.5, def: 0.05, curve: "exp", unit: "s" },
    { id: "width", label: "Stereo", min: 0, max: 1, def: 0.4 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.65 },
  ],
  macros: ["cutoff", "reso", "wobble", "wobRate", "xmod", "xTune", "crush", "level"],
  presets: [
    { name: "Wub Classic", params: {} },
    { name: "Fast Talk", params: { wobRate: 4, wobble: 0.8, reso: 0.6, xmod: 0.45 } },
    { name: "Growl", params: { xmod: 0.8, xTune: 12, crush: 0.5, cutoff: 900, wobble: 0.5, wobRate: 3 } },
    { name: "Sub Wub", params: { wave: 2, sub: 0.9, xmod: 0.1, cutoff: 300, wobble: 0.6, wobRate: 1 } },
    { name: "Robot", params: { wave: 1, xWave: 2, xmod: 0.6, crush: 0.8, wobShape: 2, wobRate: 4 } },
    { name: "Half Wobble", params: { wobRate: 0, wobble: 0.9, wobShape: 3, reso: 0.55 } },
    { name: "Clean Reese", params: { xmod: 0, crush: 0, wobble: 0.15, wobRate: 0, width: 1, cutoff: 1500, reso: 0.2 } },
    { name: "Laser Wob", params: { wobShape: 1, wobRate: 5, xTune: 19, xmod: 0.5, reso: 0.7 } },
  ],
};

// ---------- lo-fi pad: "Haze" ----------

export const PAD: InstrumentDef = {
  kind: "pad",
  name: "Haze",
  role: "Wide lo-fi pads with built-in tape wobble and reverb",
  group: "harmony",
  params: [
    { id: "wave", label: "Wave", min: 0, max: 3, def: 0, options: ["Saw", "Triangle", "Sine", "Square"] },
    { id: "low", label: "Low", min: 0, max: 1, def: 0.5 },
    { id: "hi", label: "Hi", min: 0, max: 1, def: 0.8 },
    { id: "higher", label: "Higher", min: 0, max: 1, def: 0.25 },
    { id: "noise", label: "Noise", min: 0, max: 1, def: 0.1 },
    { id: "detune", label: "Detune", min: 0, max: 1, def: 0.4 },
    { id: "cutoff", label: "Cutoff", min: 100, max: 12000, def: 2200, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.15 },
    { id: "attack", label: "A", min: 0.005, max: 5, def: 0.8, curve: "exp", unit: "s" },
    { id: "decay", label: "D", min: 0.05, max: 5, def: 1, curve: "exp", unit: "s" },
    { id: "sustain", label: "S", min: 0, max: 1, def: 0.8 },
    { id: "release", label: "R", min: 0.05, max: 8, def: 2.2, curve: "exp", unit: "s" },
    { id: "lofi", label: "Lo-fi", min: 0, max: 1, def: 0.35 },
    { id: "wow", label: "Wow", min: 0, max: 1, def: 0.35 },
    { id: "revTime", label: "Rev time", min: 0, max: 1, def: 0.7 },
    { id: "revLevel", label: "Rev level", min: 0, max: 1, def: 0.45 },
    { id: "width", label: "Width", min: 0, max: 1, def: 0.8 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.55 },
  ],
  macros: ["cutoff", "attack", "release", "lofi", "wow", "revLevel", "detune", "level"],
  presets: [
    { name: "Dusty Dream", params: {} },
    { name: "Warm Tape", params: { wave: 1, lofi: 0.5, wow: 0.55, cutoff: 1500, revLevel: 0.35 } },
    { name: "Glass Air", params: { wave: 2, low: 0.2, hi: 0.7, higher: 0.7, cutoff: 9000, lofi: 0.1, revLevel: 0.6 } },
    { name: "Choir Haze", params: { wave: 0, detune: 0.7, cutoff: 1800, reso: 0.35, noise: 0.25, revTime: 0.9 } },
    { name: "Bit Fog", params: { lofi: 0.9, wow: 0.2, wave: 3, cutoff: 3000 } },
    { name: "Swell", params: { attack: 3, release: 5, revLevel: 0.6, revTime: 1 } },
    { name: "Short Keys", params: { attack: 0.01, decay: 0.6, sustain: 0.2, release: 0.6, revLevel: 0.3 } },
    { name: "Underwater", params: { cutoff: 500, reso: 0.4, wow: 0.8, lofi: 0.4, revLevel: 0.55 } },
  ],
};

