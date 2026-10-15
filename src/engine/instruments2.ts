// Phase 2 instruments: definitions (params, macros, presets). DSP lives in dsp/instruments2-dsp.ts.

import type { InstrumentDef } from "./instruments";

// ---------- lead synth: "Razor" (hard-sync oscillator, unison) ----------

export const UNISON_COUNTS = [1, 3, 5, 7];

const rz = (name: string, params: Record<string, number>) => ({ name, params });

export const LEAD: InstrumentDef = {
  kind: "lead",
  name: "Razor",
  role: "The screaming hard-sync lead, played on faders",
  group: "lead",
  params: [
    { id: "scream", label: "Scream", min: 0, max: 1, def: 0.4 },
    { id: "sweep", label: "Sweep", min: 0, max: 1, def: 0.4 },
    { id: "cutoff", label: "Tone", min: 100, max: 16000, def: 5000, curve: "exp", unit: "Hz" },
    { id: "unison", label: "Voices", min: 0, max: 3, def: 1, options: ["1", "3", "5", "7"] },
    { id: "spread", label: "Spread", min: 0, max: 1, def: 0.5 },
    { id: "attack", label: "Attack", min: 0.001, max: 2, def: 0.005, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.01, max: 3, def: 0.25, curve: "exp", unit: "s" },
    { id: "glide", label: "Glide", min: 0, max: 1, def: 0.2 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing:
    { id: "wave", label: "Wave", min: 0, max: 1, def: 0, options: ["Saw", "Square"] },
    { id: "sync", label: "Sync base", min: 0, max: 24, def: 0, unit: "st" },
    { id: "syncEnv", label: "Sync env", min: 0, max: 1, def: 0.1 },
    { id: "fenv", label: "Filter env", min: 0, max: 1, def: 0.15 },
    { id: "envDecay", label: "Env decay", min: 0.02, max: 2, def: 0.25, curve: "exp", unit: "s" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.2 },
    { id: "vibRate", label: "Vib rate", min: 0.5, max: 12, def: 5.5, curve: "exp", unit: "Hz" },
    { id: "vibDepth", label: "Vibrato", min: 0, max: 1, def: 0.15 },
  ],
  macros: ["scream", "sweep", "cutoff", "glide", "unison", "spread", "attack", "level"],
  presets: [
    // Leads
    rz("Sync Razor", { level: 0.58,}),
    rz("Supersaw Lead", { level: 0.77, scream: 0, sync: 0, syncEnv: 0, unison: 3, spread: 0.8, cutoff: 9000, sweep: 0.1 }),
    rz("Laser Sweep", { level: 0.59, scream: 0.2, syncEnv: 0.8, sweep: 0.9 }),
    rz("Square Whistle", { level: 0.30, wave: 1, scream: 0.3, sweep: 0.1, unison: 0, cutoff: 4000, vibDepth: 0.35 }),
    rz("Fat Unison", { level: 0.79, scream: 0.3, unison: 3, spread: 1, cutoff: 3000, reso: 0.3 }),
    rz("Soft Flute", { level: 0.36, wave: 1, scream: 0, sweep: 0, syncEnv: 0, unison: 0, cutoff: 1800, attack: 0.08, vibDepth: 0.3, release: 0.5, glide: 0.3 }),
    rz("Scream", { level: 0.67, scream: 1, unison: 2, cutoff: 12000, reso: 0.5, sweep: 0.5 }),
    rz("Pluck Lead", { level: 0.61, scream: 0.45, sweep: 0.8, envDecay: 0.1, cutoff: 1500, release: 0.15, glide: 0 }),
    rz("Slow Glide", { level: 0.58, glide: 0.75, scream: 0.4, unison: 1, vibDepth: 0.25 }),
    rz("Chip-ish", { level: 0.33, wave: 1, scream: 0, sweep: 0, syncEnv: 0, unison: 0, cutoff: 16000, glide: 0, vibDepth: 0 }),
    rz("Echo Lead", { level: 0.55, scream: 0.5, sweep: 0.3, "ifx:type": 13, "ifx:a": 0.45, "ifx:b": 0.35 }),
    rz("Neon Solo", { level: 0.54, scream: 0.65, sweep: 0.45, glide: 0.4, unison: 1, spread: 0.5, vibDepth: 0.3, vibRate: 6, "ifx:type": 13, "ifx:a": 0.5, "ifx:b": 0.3 }),
    rz("Mellow Sync", { level: 0.59, scream: 0.25, cutoff: 2200, sweep: 0.2, attack: 0.02 }),
    rz("Trance Lead", { level: 0.55, scream: 0.15, unison: 3, spread: 0.9, cutoff: 7000, release: 0.4, "ifx:type": 15, "ifx:a": 0.5, "ifx:b": 0.3 }),
    rz("Hollow Pulse", { level: 0.50, wave: 1, "tk:pw": 0.2, scream: 0.2, unison: 1, cutoff: 3500 }),
    rz("Bright Hook", { level: 0.57, scream: 0.55, sweep: 0.6, envDecay: 0.15, cutoff: 6000, glide: 0.1 }),
    // Sync basses
    rz("Sync Bass", { level: 0.47, scream: 0.35, sweep: 0.55, cutoff: 1200, reso: 0.3, unison: 0, glide: 0.15 }),
    rz("Growl Sync", { level: 0.59, scream: 0.7, sweep: 0.4, cutoff: 900, reso: 0.4, unison: 1, spread: 0.3 }),
    rz("Rubber Sync", { level: 0.63, scream: 0.3, sweep: 0.8, envDecay: 0.12, cutoff: 700, glide: 0.2 }),
    // Arps
    rz("Sync Arp", { level: 0.59, scream: 0.45, sweep: 0.7, envDecay: 0.08, release: 0.08, glide: 0 }),
    rz("Zap Arp", { level: 0.57, scream: 0.6, syncEnv: 1, sweep: 1, envDecay: 0.05, release: 0.05, glide: 0 }),
    rz("Gated Sync", { level: 0.64, scream: 0.5, "ifx:type": 12, "ifx:a": 0.5, "ifx:b": 0.8 }),
    // Solos
    rz("Wailing", { level: 0.53, scream: 0.85, glide: 0.5, vibDepth: 0.45, vibRate: 5, reso: 0.3, "ifx:type": 13, "ifx:a": 0.4, "ifx:b": 0.3 }),
    rz("Fuzz Lead", { level: 0.66, scream: 0.75, sweep: 0.2, cutoff: 3000, "ifx:type": 6, "ifx:a": 0.35, "ifx:b": 0.12 }),
  ],
};

// ---------- analog drum machine: "Thump Lab" (all synthesis, no samples) ----------

/** Parts in note order (from the drum base note): the same order as Kitbox's, so phrases fit both. */
export const ANALOG_PARTS = ["Kick", "Snare", "Clap", "Closed Hat", "Open Hat", "Low Tom", "High Tom", "Perc"];
export const PERC_TYPES = ["Rim", "Cowbell", "Clave"];
export const THUMP_MODELS = ["Deep", "Club", "Tiny", "Parlour", "Hex"];

const tl = (model: number, extra: Record<string, number> = {}) => ({ model, ...extra });

export const ANALOG: InstrumentDef = {
  kind: "analog",
  name: "Thump Lab",
  role: "Analog drum machine: eight synthesized parts, five models",
  group: "drums",
  drumParts: 8,
  partNames: ANALOG_PARTS,
  params: [
    { id: "model", label: "Model", min: 0, max: 4, def: 1, options: THUMP_MODELS },
    { id: "accent", label: "Accent", min: 0, max: 1, def: 0.3 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.85 },
    // Kick
    { id: "kTune", label: "Tune", min: 30, max: 120, def: 50, curve: "exp", unit: "Hz" },
    { id: "kDecay", label: "Decay", min: 0.05, max: 2, def: 0.5, curve: "exp", unit: "s" },
    { id: "kBend", label: "Bend", min: 0, max: 1, def: 0.5 },
    { id: "kBoost", label: "Boost", min: 0, max: 1, def: 0.3 },
    { id: "kClick", label: "Click", min: 0, max: 1, def: 0.4 },
    { id: "kLevel", label: "Level", min: 0, max: 1, def: 0.9 },
    { id: "kPan", label: "Pan", min: -1, max: 1, def: 0 },
    // Snare
    { id: "sTune", label: "Tune", min: 100, max: 400, def: 190, curve: "exp", unit: "Hz" },
    { id: "sDecay", label: "Decay", min: 0.05, max: 1, def: 0.22, curve: "exp", unit: "s" },
    { id: "sSnappy", label: "Snappy", min: 0, max: 1, def: 0.6 },
    { id: "sPunch", label: "Punch", min: 0, max: 1, def: 0.3 },
    { id: "sTone", label: "Tone", min: 0, max: 1, def: 0.5 },
    { id: "sLevel", label: "Level", min: 0, max: 1, def: 0.75 },
    { id: "sPan", label: "Pan", min: -1, max: 1, def: 0 },
    // Clap
    { id: "cDecay", label: "Decay", min: 0.05, max: 1, def: 0.3, curve: "exp", unit: "s" },
    { id: "cSpread", label: "Spread", min: 0, max: 1, def: 0.5 },
    { id: "cTone", label: "Tone", min: 0, max: 1, def: 0.5 },
    { id: "cRoom", label: "Room", min: 0, max: 1, def: 0.3 },
    { id: "cLevel", label: "Level", min: 0, max: 1, def: 0.7 },
    { id: "cPan", label: "Pan", min: -1, max: 1, def: 0.1 },
    // Closed hat
    { id: "hDecay", label: "Decay", min: 0.01, max: 0.5, def: 0.06, curve: "exp", unit: "s" },
    { id: "hTone", label: "Tone", min: 0, max: 1, def: 0.5 },
    { id: "hMetal", label: "Metal", min: 0, max: 1, def: 0.6 },
    { id: "hLevel", label: "Level", min: 0, max: 1, def: 0.55 },
    { id: "hPan", label: "Pan", min: -1, max: 1, def: -0.2 },
    // Open hat
    { id: "oDecay", label: "Decay", min: 0.05, max: 2, def: 0.35, curve: "exp", unit: "s" },
    { id: "oTone", label: "Tone", min: 0, max: 1, def: 0.5 },
    { id: "oMetal", label: "Metal", min: 0, max: 1, def: 0.6 },
    { id: "oLevel", label: "Level", min: 0, max: 1, def: 0.5 },
    { id: "oPan", label: "Pan", min: -1, max: 1, def: -0.2 },
    // Low tom
    { id: "ltTune", label: "Tune", min: 50, max: 300, def: 100, curve: "exp", unit: "Hz" },
    { id: "ltDecay", label: "Decay", min: 0.05, max: 1.5, def: 0.45, curve: "exp", unit: "s" },
    { id: "ltBend", label: "Bend", min: 0, max: 1, def: 0.4 },
    { id: "ltNoise", label: "Noise", min: 0, max: 1, def: 0.15 },
    { id: "ltLevel", label: "Level", min: 0, max: 1, def: 0.7 },
    { id: "ltPan", label: "Pan", min: -1, max: 1, def: -0.3 },
    // High tom
    { id: "htTune", label: "Tune", min: 80, max: 500, def: 170, curve: "exp", unit: "Hz" },
    { id: "htDecay", label: "Decay", min: 0.05, max: 1.5, def: 0.35, curve: "exp", unit: "s" },
    { id: "htBend", label: "Bend", min: 0, max: 1, def: 0.4 },
    { id: "htNoise", label: "Noise", min: 0, max: 1, def: 0.15 },
    { id: "htLevel", label: "Level", min: 0, max: 1, def: 0.7 },
    { id: "htPan", label: "Pan", min: -1, max: 1, def: 0.3 },
    // Perc
    { id: "pType", label: "Type", min: 0, max: 2, def: 0, options: PERC_TYPES },
    { id: "pTune", label: "Tune", min: 200, max: 3000, def: 800, curve: "exp", unit: "Hz" },
    { id: "pDecay", label: "Decay", min: 0.02, max: 1, def: 0.12, curve: "exp", unit: "s" },
    { id: "pDepth", label: "Depth", min: 0, max: 1, def: 0 },
    { id: "pSpeed", label: "Speed", min: 0, max: 1, def: 0 },
    { id: "pLevel", label: "Level", min: 0, max: 1, def: 0.6 },
    { id: "pPan", label: "Pan", min: -1, max: 1, def: 0.25 },
  ],
  macros: ["kDecay", "kBend", "sSnappy", "sTune", "hDecay", "ltTune", "accent", "level"],
  presets: [
    // Deep: big, boomy, metallic
    { name: "Deep Classic", params: tl(0, { level: 0.82 }) },
    { name: "Long Boom", params: tl(0, { level: 0.64, kDecay: 1.6, kTune: 42, kBend: 0.25, kBoost: 0.4 }) },
    { name: "Cowbell Disco", params: tl(0, { level: 0.82, pType: 1, pTune: 760, cRoom: 0.5, oDecay: 0.5 }) },
    { name: "Slow Jam", params: tl(0, { level: 0.72, kDecay: 0.9, sSnappy: 0.4, sTone: 0.3, cSpread: 0.7 }) },
    { name: "Trap Room", params: tl(0, { level: 0.65, kDecay: 1.9, kTune: 40, hDecay: 0.03, htTune: 230, cRoom: 0.7 }) },
    // Club: punchy, clicky, noisy
    { name: "Club Standard", params: tl(1, { level: 0.82 }) },
    { name: "Warehouse", params: tl(1, { level: 0.74, kBoost: 0.7, kClick: 0.7, kDecay: 0.45, sPunch: 0.6, oDecay: 0.5, hMetal: 0.3 }) },
    { name: "Tight Techno", params: tl(1, { level: 0.86, kDecay: 0.3, kBend: 0.35, kBoost: 0.5, sDecay: 0.15, hDecay: 0.03 }) },
    { name: "House Shuffle", params: tl(1, { level: 0.82, cRoom: 0.5, oDecay: 0.25, pType: 2, pTune: 900 }) },
    { name: "Hard Floor", params: tl(1, { level: 0.60, kBoost: 1, kClick: 1, sSnappy: 0.9, sPunch: 0.8, accent: 0.7 }) },
    // Tiny: small, tight, bright
    { name: "Tiny Box", params: tl(2, { level: 0.99 }) },
    { name: "Bleep Kit", params: tl(2, { level: 0.99, pType: 2, pTune: 1400, hMetal: 0.9 }) },
    { name: "Pocket Electro", params: tl(2, { level: 0.89, kDecay: 0.8, kBend: 0.8, sSnappy: 0.4 }) },
    { name: "Toy Room", params: tl(2, { level: 0.98, cRoom: 0.6, kTune: 60 }) },
    { name: "Tick Tock", params: tl(2, { level: 0.99, hDecay: 0.02, pType: 0, pDecay: 0.05 }) },
    // Parlour: a soft, vintage rhythm box
    { name: "Parlour Waltz", params: tl(3, { level: 1.00 }) },
    { name: "Bossa Box", params: tl(3, { level: 1.00, pType: 2, pTune: 900, kDecay: 0.4 }) },
    { name: "Organ Top", params: tl(3, { level: 1.00, hMetal: 0.2, hTone: 0.3, sTone: 0.2 }) },
    { name: "Soft Shuffle", params: tl(3, { level: 1.00, cSpread: 0.8, cRoom: 0.5, sSnappy: 0.5 }) },
    { name: "Lounge", params: tl(3, { level: 1.00, ltTune: 120, htTune: 200, ltBend: 0.1, htBend: 0.1 }) },
    // Hex: electronic toms and sweeps
    { name: "Hex Toms", params: tl(4, { level: 0.84 }) },
    { name: "Pew Pew", params: tl(4, { level: 0.85, ltBend: 1, htBend: 1, ltDecay: 0.8, htDecay: 0.6, sDecay: 0.4 }) },
    { name: "Synth Pop", params: tl(4, { level: 0.85, kBend: 0.7, sTone: 0.7, cRoom: 0.5 }) },
    { name: "Glitch Rack", params: tl(4, { level: 0.84, pSpeed: 0.6, pDepth: 0.8, hMetal: 1 }) },
  ],
};

// ---------- wobble bass: "Wobbler" ----------

export const WOB_RATES = ["1/1", "1/2", "1/4", "1/8", "1/16", "1/8T", "1/16T"];
export const WOB_BEATS = [4, 2, 1, 0.5, 0.25, 1 / 3, 1 / 6];

const wb = (name: string, params: Record<string, number>) => ({ name, params });

export const WOBBLE: InstrumentDef = {
  kind: "wobble",
  name: "Wobbler",
  role: "The growling, tempo-locked wobble bass",
  group: "bass",
  params: [
    { id: "wobble", label: "Wobble", min: 0, max: 1, def: 0.7 },
    { id: "wobRate", label: "Rate", min: 0, max: 6, def: 3, options: WOB_RATES },
    { id: "growl", label: "Growl", min: 0, max: 1, def: 0.3 },
    { id: "crush", label: "Crush", min: 0, max: 1, def: 0.2 },
    { id: "cutoff", label: "Cutoff", min: 40, max: 8000, def: 600, curve: "exp", unit: "Hz" },
    { id: "sub", label: "Sub", min: 0, max: 1, def: 0.5 },
    { id: "glide", label: "Glide", min: 0.002, max: 0.5, def: 0.05, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.65 },
    // Hidden voicing:
    { id: "wave", label: "Wave", min: 0, max: 2, def: 0, options: ["Saw", "Square", "Sine"] },
    { id: "xWave", label: "X-mod wave", min: 0, max: 2, def: 0, options: ["Sine", "Saw", "Square"] },
    { id: "xTune", label: "X-mod tune", min: -12, max: 24, def: 7, unit: "st" },
    { id: "xmod", label: "X-mod", min: 0, max: 1, def: 0.15 },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.35 },
    { id: "wobShape", label: "Shape", min: 0, max: 3, def: 0, options: ["Sine", "Saw", "Square", "Ramp"] },
    { id: "width", label: "Stereo", min: 0, max: 1, def: 0.4 },
  ],
  macros: ["wobble", "wobRate", "growl", "crush", "cutoff", "sub", "glide", "level"],
  presets: [
    // Wobbles
    wb("Wub Classic", { level: 0.50,}),
    wb("Fast Talk", { level: 0.56, wobRate: 4, wobble: 0.8, reso: 0.5, growl: 0.45 }),
    wb("Half Time", { level: 0.50, wobRate: 1, wobble: 0.9, wobShape: 3, reso: 0.45 }),
    wb("Triplet Wub", { level: 0.50, wobRate: 5, wobble: 0.75, growl: 0.3 }),
    wb("Square Chop", { level: 0.54, wobShape: 2, wobRate: 3, wobble: 0.85, crush: 0.3 }),
    wb("Saw Swing", { level: 0.49, wobShape: 1, wobRate: 2, wobble: 0.8, growl: 0.2 }),
    wb("Sub Wub", { level: 0.42, wave: 2, sub: 0.9, growl: 0.05, cutoff: 300, wobble: 0.6, wobRate: 2 }),
    // Growls
    wb("Growl", { level: 0.74, growl: 0.8, xTune: 0, crush: 0.5, cutoff: 900, wobble: 0.5, wobRate: 5 }),
    wb("Robot", { level: 0.73, wave: 1, xWave: 2, growl: 0.6, crush: 0.8, wobShape: 2, wobRate: 4 }),
    wb("Laser Wob", { level: 0.57, wobShape: 1, wobRate: 4, xTune: 7, growl: 0.5, reso: 0.55 }),
    wb("Metal Jaw", { level: 0.54, wave: 1, growl: 1, xTune: 5, crush: 0.4, wobble: 0.6, wobRate: 3, cutoff: 1100 }),
    wb("Grinder", { level: 0.93, growl: 0.7, crush: 0.9, wobble: 0.5, wobRate: 4, cutoff: 1400 }),
    // Reese
    wb("Clean Reese", { level: 0.28, growl: 0, xmod: 0, crush: 0, wobble: 0.15, wobRate: 0, width: 1, cutoff: 1500, reso: 0.15 }),
    wb("Dark Reese", { level: 0.39, growl: 0.15, xmod: 0.05, crush: 0.1, wobble: 0.25, wobRate: 0, width: 1, cutoff: 700, sub: 0.7 }),
    wb("Moving Reese", { level: 0.48, growl: 0.25, wobble: 0.35, wobRate: 1, wobShape: 0, width: 0.9, cutoff: 1000 }),
    wb("Square Reese", { level: 0.34, wave: 1, growl: 0.1, wobble: 0.2, wobRate: 0, width: 1, cutoff: 1200 }),
    // Talking
    wb("Talking Bass", { level: 0.49, growl: 0.6, xTune: 0, wobble: 0.55, wobRate: 3, reso: 0.5, crush: 0.1 }),
    wb("Yoi Yoi", { level: 0.57, growl: 0.75, wobble: 0.7, wobRate: 4, wobShape: 3, reso: 0.4 }),
    wb("Mouthy", { level: 0.60, growl: 0.9, wobble: 0.4, wobRate: 2, crush: 0.2, cutoff: 800 }),
    // Risers and fx
    wb("Riser Wub", { level: 0.62, wobRate: 6, wobble: 0.9, growl: 0.5, crush: 0.3, glide: 0.4 }),
    wb("Siren", { level: 0.47, wave: 2, sub: 0.2, growl: 0.4, wobble: 1, wobRate: 2, wobShape: 0, cutoff: 2000, reso: 0.6 }),
    wb("Bit Storm", { level: 1.00, crush: 1, growl: 0.5, wobble: 0.8, wobRate: 6, cutoff: 1800 }),
    wb("Zapper", { level: 0.54, wobShape: 1, wobRate: 6, wobble: 1, growl: 0.3, reso: 0.6, crush: 0.2 }),
    wb("Deep Pulse", { level: 0.28, wave: 2, sub: 1, growl: 0, crush: 0, wobble: 0.5, wobRate: 3, cutoff: 200 }),
  ],
};

// ---------- lo-fi pad: "Haze" ----------

const hz = (name: string, params: Record<string, number>) => ({ name, params });

export const PAD: InstrumentDef = {
  kind: "pad",
  name: "Haze",
  role: "Dreamy, worn-tape pads that drift and breathe",
  group: "harmony",
  params: [
    { id: "low", label: "Low", min: 0, max: 1, def: 0.5 },
    { id: "hi", label: "Hi", min: 0, max: 1, def: 0.8 },
    { id: "higher", label: "Higher", min: 0, max: 1, def: 0.25 },
    { id: "drift", label: "Drift", min: 0, max: 1, def: 0.35 },
    { id: "dust", label: "Dust", min: 0, max: 1, def: 0.3 },
    { id: "space", label: "Space", min: 0, max: 1, def: 0.5 },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.55 },
    // Hidden voicing:
    { id: "wave", label: "Wave", min: 0, max: 3, def: 0, options: ["Saw", "Triangle", "Sine", "Square"] },
    { id: "detune", label: "Detune", min: 0, max: 1, def: 0.4 },
    { id: "noise", label: "Noise", min: 0, max: 1, def: 0.05 },
    { id: "cutoff", label: "Cutoff", min: 100, max: 12000, def: 2200, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.15 },
    { id: "attack", label: "Attack", min: 0.005, max: 5, def: 0.8, curve: "exp", unit: "s" },
    { id: "decay", label: "Decay", min: 0.05, max: 5, def: 1, curve: "exp", unit: "s" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0.8 },
    { id: "release", label: "Release", min: 0.05, max: 8, def: 2.2, curve: "exp", unit: "s" },
  ],
  macros: ["drift", "dust", "space", "low", "hi", "higher", "attack", "level"],
  presets: [
    // Pads
    hz("Dusty Dream", { level: 0.56,}),
    hz("Warm Tape", { level: 0.53, wave: 1, dust: 0.5, drift: 0.55, cutoff: 1500, space: 0.4 }),
    hz("Glass Air", { level: 0.29, wave: 2, low: 0.2, hi: 0.7, higher: 0.7, cutoff: 9000, dust: 0.1, space: 0.75 }),
    hz("Choir Haze", { level: 0.32, wave: 0, detune: 0.7, cutoff: 1800, reso: 0.35, noise: 0.1, space: 0.8 }),
    hz("Swell", { level: 0.60, attack: 3, release: 5, space: 0.8 }),
    hz("Underwater", { level: 0.50, cutoff: 500, reso: 0.4, drift: 0.8, dust: 0.4, space: 0.65 }),
    hz("Sunset", { level: 0.33, wave: 0, low: 0.6, hi: 0.8, higher: 0.4, cutoff: 3000, drift: 0.25, dust: 0.15, space: 0.6 }),
    hz("Cathedral", { level: 0.23, wave: 1, low: 0.7, hi: 0.6, higher: 0.5, cutoff: 4000, attack: 1.5, release: 4, space: 1, dust: 0.05 }),
    hz("Velvet", { level: 0.37, wave: 1, low: 0.8, hi: 0.5, higher: 0, cutoff: 1200, drift: 0.2, dust: 0.2, space: 0.45 }),
    hz("Old Film", { level: 0.58, wave: 0, drift: 0.7, dust: 0.75, cutoff: 2500, space: 0.4 }),
    hz("Polar", { level: 0.42, wave: 2, low: 0.3, hi: 0.8, higher: 0.8, cutoff: 7000, drift: 0.15, dust: 0, space: 0.9, attack: 2 }),
    hz("Deep Fog", { level: 0.41, wave: 0, low: 1, hi: 0.4, higher: 0, cutoff: 700, drift: 0.4, dust: 0.3, space: 0.7, attack: 1.8 }),
    // Keys
    hz("Short Keys", { level: 1.00, attack: 0.01, decay: 0.6, sustain: 0.2, release: 0.6, space: 0.4 }),
    hz("Lo-fi Piano", { level: 0.73, wave: 1, attack: 0.005, decay: 1.2, sustain: 0.15, release: 0.8, low: 0.3, hi: 1, higher: 0.3, dust: 0.55, drift: 0.4, cutoff: 3200, space: 0.35 }),
    hz("Tape Rhodes", { level: 0.55, wave: 2, attack: 0.01, decay: 1.5, sustain: 0.3, release: 0.9, low: 0.2, hi: 1, higher: 0.5, dust: 0.35, drift: 0.5, cutoff: 4500, space: 0.4 }),
    hz("Cassette Organ", { level: 0.28, wave: 3, attack: 0.02, sustain: 1, release: 0.3, low: 0.5, hi: 0.6, higher: 0.4, dust: 0.6, drift: 0.45, cutoff: 2200, space: 0.3 }),
    hz("Bedroom Keys", { level: 0.68, wave: 1, attack: 0.008, decay: 0.9, sustain: 0.25, release: 1, dust: 0.4, drift: 0.3, space: 0.55 }),
    hz("Music Box Dust", { level: 0.61, wave: 2, attack: 0.003, decay: 0.8, sustain: 0, release: 1, low: 0, hi: 0.6, higher: 1, dust: 0.5, drift: 0.35, cutoff: 9000, space: 0.6 }),
    // Textures
    hz("Bit Fog", { level: 0.30, dust: 0.95, drift: 0.2, wave: 3, cutoff: 3000, space: 0.5 }),
    hz("Wind", { level: 1, noise: 1, low: 0, hi: 0.3, higher: 0, cutoff: 3500, reso: 0.55, drift: 0.8, space: 0.8, attack: 2 }),
    hz("Vinyl Room", { level: 0.55, noise: 0.15, dust: 0.85, drift: 0.3, cutoff: 1800, space: 0.5 }),
    hz("Rain Glass", { level: 0.17, wave: 2, higher: 1, hi: 0.3, low: 0, noise: 0.2, dust: 0.3, space: 0.95, cutoff: 8000, attack: 1 }),
    hz("Drone", { level: 0.43, wave: 0, low: 1, hi: 1, higher: 0.3, attack: 3, release: 6, drift: 0.6, dust: 0.25, cutoff: 1400, space: 0.7 }),
    hz("Memory", { level: 0.26, wave: 1, drift: 0.9, dust: 0.5, cutoff: 2000, space: 0.85, attack: 1.2, release: 4 }),
  ],
};

