// Phase 3 instruments: definitions. DSP lives in dsp/instruments3-dsp.ts.

import type { InstrumentDef, ParamDef } from "./instruments";

// ---------- 8-bit chip synth: "Pixel" ----------

export const CHIP_WAVES = ["Square", "Pulse 25", "Pulse 12", "Triangle", "Noise"];
/** Jump! patterns (hidden voicing): Jump! itself sets how many of the notes are used. */
export const JUMP_TYPES = ["Octave", "Fifth", "Major", "Minor", "Sus", "Power"];
export const JUMP_STEPS: number[][] = [[0, 12, 24, 36], [0, 7, 12, 19, 24], [0, 4, 7, 12, 16, 19, 24], [0, 3, 7, 12, 15, 19, 24], [0, 5, 7, 12, 17, 19], [0, 7, 12, 19, 24]];

const px = (name: string, params: Record<string, number>) => ({ name, params });

export const CHIP: InstrumentDef = {
  kind: "chip",
  name: "Pixel",
  role: "8-bit game sounds: pulses, jumps, runs and glitches",
  group: "lead",
  params: [
    { id: "wave", label: "Wave", min: 0, max: 4, def: 0, options: CHIP_WAVES },
    { id: "jump", label: "Jump!", min: 0, max: 1, def: 0 },
    { id: "jumpRate", label: "Jump speed", min: 6, max: 60, def: 24, curve: "exp", unit: "Hz" },
    { id: "run", label: "Run!", min: 0, max: 1, def: 0 },
    { id: "glitch", label: "Glitch", min: 0, max: 1, def: 0.15 },
    { id: "attack", label: "Attack", min: 0.001, max: 1, def: 0.002, curve: "exp", unit: "s" },
    { id: "decay", label: "Decay", min: 0.02, max: 2, def: 0.3, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.55 },
    // Hidden voicing:
    { id: "jumpType", label: "Jump type", min: 0, max: 5, def: 2, options: JUMP_TYPES },
    { id: "runDir", label: "Run direction", min: 0, max: 1, def: 0, options: ["Down into", "Up into"] },
    { id: "sweepTime", label: "Run time", min: 0.01, max: 1, def: 0.08, curve: "exp", unit: "s" },
    { id: "vibDepth", label: "Vibrato", min: 0, max: 1, def: 0 },
    { id: "vibRate", label: "Vib rate", min: 2, max: 12, def: 6, curve: "exp", unit: "Hz" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0.6 },
    { id: "release", label: "Release", min: 0.01, max: 2, def: 0.12, curve: "exp", unit: "s" },
  ],
  macros: ["jump", "jumpRate", "run", "glitch", "wave", "decay", "attack", "level"],
  presets: [
    // Leads
    px("Hero Square", { level: 0.39,}),
    px("Thin Pulse", { level: 0.59, wave: 2, decay: 0.15, sustain: 0.3 }),
    px("Vibrato Lead", { level: 0.32, wave: 1, vibDepth: 0.4, vibRate: 6.5, sustain: 0.8 }),
    px("Slide Lead", { level: 0.32, wave: 1, run: 0.3, runDir: 0, sweepTime: 0.06, sustain: 0.8, vibDepth: 0.2 }),
    px("Hollow Hero", { level: 0.36, wave: 2, sustain: 0.7, vibDepth: 0.25, glitch: 0.05 }),
    px("Final Boss", { level: 0.30, wave: 0, run: 0.2, glitch: 0.55, sustain: 0.9, vibDepth: 0.3 }),
    // Arps
    px("Major Jump", { level: 0.39, jump: 0.35, jumpType: 2, jumpRate: 30 }),
    px("Minor Jump", { level: 0.38, jump: 0.35, jumpType: 3, jumpRate: 22, wave: 1 }),
    px("Octave Bounce", { level: 0.39, jump: 0.4, jumpType: 0, jumpRate: 12 }),
    px("Big Run Up", { level: 0.39, jump: 1, jumpType: 2, jumpRate: 40, wave: 1 }),
    px("Sus Sparkle", { level: 0.40, jump: 0.7, jumpType: 4, jumpRate: 34, wave: 2, decay: 0.5, sustain: 0.4 }),
    px("Power Chord", { level: 0.30, jump: 0.45, jumpType: 5, jumpRate: 50, wave: 0, sustain: 0.9 }),
    px("Glitch Arp", { level: 0.39, jump: 0.6, jumpType: 3, jumpRate: 26, glitch: 0.6 }),
    // Bass
    px("Tri Bass", { level: 0.48, wave: 3, sustain: 1, decay: 0.5, glitch: 0.4 }),
    px("Pulse Bass", { level: 0.32, wave: 1, sustain: 0.8, decay: 0.3, glitch: 0.1 }),
    px("Octave Bass", { level: 0.48, wave: 3, jump: 0.35, jumpType: 0, jumpRate: 16, sustain: 1 }),
    px("Drop Bass", { level: 0.32, wave: 0, run: 0.5, runDir: 1, sweepTime: 0.05, sustain: 0.8 }),
    // Jingles
    px("Level Clear", { level: 0.36, jump: 0.8, jumpType: 2, jumpRate: 18, wave: 1, decay: 0.8, sustain: 0.5 }),
    px("Game Over", { level: 0.35, jump: 0.6, jumpType: 3, jumpRate: 9, wave: 2, run: 0.2, runDir: 1, decay: 1.2, sustain: 0.3 }),
    px("Fanfare Bit", { level: 0.30, jump: 0.5, jumpType: 5, jumpRate: 14, wave: 0, sustain: 0.9 }),
    // FX
    px("Coin", { level: 0.61, jump: 0.35, jumpType: 1, jumpRate: 14, wave: 1, decay: 0.35, sustain: 0, release: 0.05 }),
    px("Jump", { level: 0.71, run: 0.55, runDir: 0, sweepTime: 0.12, wave: 1, decay: 0.25, sustain: 0, release: 0.05 }),
    px("Power Up", { level: 0.56, run: 0.5, runDir: 0, sweepTime: 0.15, wave: 1, decay: 0.4, sustain: 0, jump: 0.5, jumpType: 2, jumpRate: 40 }),
    px("Laser Blip", { level: 1.00, run: 1, runDir: 1, sweepTime: 0.05, decay: 0.08, sustain: 0, release: 0.05 }),
    px("Noise Snare", { level: 0.99, wave: 4, decay: 0.12, sustain: 0, release: 0.05 }),
    px("Explosion", { level: 0.42, wave: 4, run: 0.6, runDir: 1, sweepTime: 0.4, decay: 0.9, sustain: 0, glitch: 0.5 }),
    px("Hit", { level: 1.00, wave: 4, run: 0.4, runDir: 1, sweepTime: 0.05, decay: 0.06, sustain: 0, release: 0.03, glitch: 0.3 }),
    px("Teleport", { level: 0.48, run: 0.8, runDir: 0, sweepTime: 0.3, jump: 0.8, jumpType: 0, jumpRate: 50, glitch: 0.3, decay: 0.6, sustain: 0 }),
  ],
};

// ---------- FM / bell synth: "Glint" ----------

export const C_RATIOS = ["0.5", "1", "2", "3", "4"];
export const M_RATIOS = ["0.5", "1", "1.41", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "11", "13"];

const gl = (name: string, params: Record<string, number>) => ({ name, params });

export const FM: InstrumentDef = {
  kind: "fm",
  name: "Glint",
  role: "Glassy, metallic FM tones: bells, mallets, tines",
  group: "harmony",
  params: [
    { id: "ratioM", label: "Ratio", min: 0, max: 14, def: 6, options: M_RATIOS },
    { id: "shimmer", label: "Shimmer", min: 0, max: 1, def: 0.3 },
    { id: "strike", label: "Strike", min: 0, max: 1, def: 0.4 },
    { id: "harmonics", label: "Harmonics", min: 0, max: 1, def: 0.4 },
    { id: "attack", label: "Attack", min: 0.001, max: 2, def: 0.002, curve: "exp", unit: "s" },
    { id: "decay", label: "Decay", min: 0.05, max: 6, def: 1.6, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.05, max: 6, def: 1.2, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
    // Hidden voicing:
    { id: "ratioC", label: "Carrier", min: 0, max: 4, def: 1, options: C_RATIOS },
    { id: "index", label: "FM amount", min: 0, max: 10, def: 3 },
    { id: "indexDecay", label: "FM decay", min: 0.02, max: 6, def: 0.8, curve: "exp", unit: "s" },
    { id: "indexSus", label: "FM sustain", min: 0, max: 1, def: 0.15 },
    { id: "feedback", label: "Feedback", min: 0, max: 1, def: 0.05 },
    { id: "velIndex", label: "Vel → FM", min: 0, max: 1, def: 0.5 },
    { id: "detune", label: "Stereo", min: 0, max: 1, def: 0.1 },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0 },
  ],
  macros: ["harmonics", "strike", "shimmer", "ratioM", "decay", "release", "attack", "level"],
  presets: [
    // Bells
    gl("Glass Bell", { level: 0.43,}),
    gl("Tubular", { level: 0.33, ratioM: 5, index: 4, indexDecay: 2, decay: 4, release: 3, harmonics: 0.5 }),
    gl("Church Bell", { level: 0.34, ratioC: 1, ratioM: 2, index: 5, indexDecay: 3, decay: 5, release: 4, harmonics: 0.65, shimmer: 0.5 }),
    gl("Tiny Bell", { level: 0.49, ratioC: 2, ratioM: 9, index: 2, indexDecay: 0.6, decay: 1.2, release: 1, strike: 0.6 }),
    gl("Wind Chime", { level: 0.35, ratioC: 2, ratioM: 13, index: 3, indexDecay: 1.2, decay: 5, release: 5, shimmer: 0.75 }),
    gl("Gamelan", { level: 0.36, ratioM: 4, index: 4, indexDecay: 1.5, decay: 3, release: 2.5, harmonics: 0.75, shimmer: 0.4 }),
    gl("Cluster Bell", { level: 0.37, ratioM: 13, index: 3.5, decay: 3, release: 3, harmonics: 0.8, shimmer: 0.6 }),
    // Mallets
    gl("Marimba", { level: 0.83, ratioM: 11, index: 1.5, indexDecay: 0.08, decay: 0.4, release: 0.3, strike: 0.6, harmonics: 0.3 }),
    gl("Vibes", { level: 0.41, ratioM: 7, index: 1.8, indexDecay: 0.5, decay: 2, release: 1.5, shimmer: 0.6, strike: 0.3 }),
    gl("Xylo", { level: 0.91, ratioM: 11, index: 2.2, indexDecay: 0.05, decay: 0.25, release: 0.2, strike: 0.8, harmonics: 0.35 }),
    gl("Kalimba", { level: 0.63, ratioM: 9, index: 1.6, indexDecay: 0.12, decay: 0.7, release: 0.5, strike: 0.7, harmonics: 0.2 }),
    gl("Steel Drum", { level: 0.55, ratioM: 5, index: 2.5, indexDecay: 0.2, decay: 0.9, release: 0.6, strike: 0.5, harmonics: 0.55 }),
    // Keys / tines
    gl("Tine Keys", { level: 0.36, ratioM: 13, index: 2.2, indexDecay: 0.4, decay: 2, sustain: 0.25, velIndex: 0.8, strike: 0.5 }),
    gl("Glass Keys", { level: 0.38, ratioM: 7, index: 1.5, indexDecay: 0.6, decay: 1.8, sustain: 0.2, shimmer: 0.45, strike: 0.35 }),
    gl("FM Organ", { level: 0.22, ratioM: 3, index: 1.2, indexSus: 1, sustain: 1, attack: 0.005, release: 0.15, harmonics: 0.3, strike: 0 }),
    // Glass pads
    gl("Soft Pad", { level: 0.29, ratioM: 5, index: 1.2, indexSus: 0.8, attack: 0.6, decay: 2, sustain: 0.8, release: 2.5, shimmer: 0.6, strike: 0 }),
    gl("Glass Pad", { level: 0.26, ratioM: 7, index: 1, indexSus: 0.7, attack: 0.9, decay: 3, sustain: 0.7, release: 3, shimmer: 0.85, strike: 0, harmonics: 0.25 }),
    gl("Frost", { level: 0.30, ratioC: 2, ratioM: 9, index: 1.5, indexSus: 0.6, attack: 1.2, decay: 3, sustain: 0.6, release: 3.5, shimmer: 1, strike: 0 }),
    gl("Breath Pad", { level: 0.27, ratioM: 1, index: 0.8, indexSus: 0.9, attack: 0.8, sustain: 0.85, release: 2, shimmer: 0.5, feedback: 0.3, strike: 0 }),
    // Plucks and others
    gl("Glass Pluck", { level: 0.89, ratioM: 7, index: 2.5, indexDecay: 0.1, decay: 0.35, release: 0.3, strike: 0.7 }),
    gl("Harp-ish", { level: 0.42, ratioM: 3, index: 1.6, indexDecay: 0.25, decay: 1.2, release: 0.8, strike: 0.45, shimmer: 0.3 }),
    gl("Metal Clang", { level: 0.53, ratioM: 3, index: 7, feedback: 0.4, indexDecay: 0.3, decay: 1, harmonics: 0.85, strike: 0.7 }),
    gl("FM Bass", { level: 0.33, ratioC: 0, ratioM: 1, index: 4, indexDecay: 0.15, indexSus: 0.3, decay: 0.5, sustain: 0.6, release: 0.1, shimmer: 0, strike: 0.5 }),
    gl("Digital Pluck Bass", { level: 0.78, ratioC: 0, ratioM: 3, index: 3, indexDecay: 0.1, decay: 0.4, release: 0.1, shimmer: 0, strike: 0.6, harmonics: 0.45 }),
  ],
};

// ---------- wavetable synth: "Morph" (factory tables from the CHOMPI firmware, MIT) ----------

export const TABLE_NAMES = ["Basic", "Soft", "Scan", "Bright", "Digital", "Vowel", "Glitch"];
export const WT_FRAMES = 33;
export const WT_SIZE = 2048;
export const WT_LEVELS = 9; // mip levels: 1024 harmonics, 512, ... 4

const mo = (name: string, params: Record<string, number>) => ({ name, params });

export const WAVE: InstrumentDef = {
  kind: "wave",
  name: "Morph",
  role: "Sweep through waveforms; Warp bends them on a big pad",
  group: "harmony",
  params: [
    { id: "pos", label: "Position", min: 0, max: 1, def: 0.2 },
    { id: "warp", label: "Warp", min: 0, max: 1, def: 0.2 },
    { id: "table", label: "Table", min: 0, max: 6, def: 0, options: TABLE_NAMES },
    { id: "lfoAmt", label: "Motion", min: 0, max: 1, def: 0.15 },
    { id: "lfoRate", label: "Motion speed", min: 0.05, max: 10, def: 0.5, curve: "exp", unit: "Hz" },
    { id: "cutoff", label: "Cutoff", min: 100, max: 16000, def: 9000, curve: "exp", unit: "Hz" },
    { id: "attack", label: "Attack", min: 0.001, max: 3, def: 0.01, curve: "exp", unit: "s" },
    { id: "release", label: "Release", min: 0.01, max: 5, def: 0.6, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.55 },
    // Hidden voicing:
    { id: "envAmt", label: "Pos env", min: -1, max: 1, def: 0.4 },
    { id: "envDecay", label: "Env decay", min: 0.05, max: 4, def: 0.8, curve: "exp", unit: "s" },
    { id: "unison", label: "Voices", min: 0, max: 2, def: 1, options: ["1", "2", "3"] },
    { id: "detune", label: "Detune", min: 0, max: 1, def: 0.25 },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.15 },
    { id: "decay", label: "Decay", min: 0.02, max: 4, def: 0.6, curve: "exp", unit: "s" },
    { id: "sustain", label: "Sustain", min: 0, max: 1, def: 0.7 },
  ],
  macros: ["warp", "pos", "lfoAmt", "lfoRate", "table", "cutoff", "release", "level"],
  presets: [
    // Leads
    mo("Morph Lead", { level: 0.34,}),
    mo("Bright Saws", { level: 0.40, table: 3, pos: 0.6, unison: 2, detune: 0.4, cutoff: 12000, warp: 0.1 }),
    mo("Warp Lead", { level: 0.38, table: 3, pos: 0.3, warp: 0.7, envAmt: 0.2, unison: 1, detune: 0.2, cutoff: 7000 }),
    mo("Vowel Lead", { level: 0.59, table: 5, pos: 0.4, warp: 0.3, lfoAmt: 0.35, lfoRate: 4.5, sustain: 0.9 }),
    mo("Glass Lead", { level: 0.31, table: 1, pos: 0.8, warp: 0.45, unison: 0, cutoff: 10000, sustain: 0.85, "ifx:type": 13, "ifx:a": 0.4, "ifx:b": 0.3 }),
    mo("Scan Solo", { level: 0.39, table: 2, pos: 0.2, envAmt: 0.6, envDecay: 1.5, warp: 0.25, unison: 1, sustain: 0.9 }),
    // Pads
    mo("Slow Scan", { level: 0.23, table: 2, pos: 0.1, envAmt: 0, lfoAmt: 0.6, lfoRate: 0.15, attack: 0.4, release: 1.5 }),
    mo("Wide Pad", { level: 0.22, table: 1, pos: 0.4, unison: 2, detune: 0.6, attack: 0.8, release: 2.5, lfoAmt: 0.3, lfoRate: 0.2 }),
    mo("Warp Pad", { level: 0.16, table: 0, pos: 0.5, warp: 0.55, unison: 2, detune: 0.5, attack: 1, release: 2.5, lfoAmt: 0.25, lfoRate: 0.1, cutoff: 5000 }),
    mo("Choir Morph", { level: 0.26, table: 5, pos: 0.6, envAmt: 0, lfoAmt: 0.45, lfoRate: 0.25, unison: 2, detune: 0.35, attack: 0.7, release: 2, cutoff: 4500 }),
    mo("Digital Haze", { level: 0.22, table: 4, pos: 0.3, warp: 0.35, lfoAmt: 0.5, lfoRate: 0.08, unison: 2, detune: 0.7, attack: 1.5, release: 3, cutoff: 3500 }),
    mo("Evolving", { level: 0.26, table: 2, pos: 0, envAmt: 1, envDecay: 4, lfoAmt: 0.2, lfoRate: 0.3, unison: 2, attack: 0.6, release: 3 }),
    // Basses
    mo("Digital Bass", { level: 0.53, table: 4, pos: 0.5, envAmt: -0.4, envDecay: 0.3, unison: 0, cutoff: 3000, sustain: 0.8, release: 0.1 }),
    mo("Warp Bass", { level: 0.41, table: 3, pos: 0.2, warp: 0.6, envAmt: 0.3, envDecay: 0.2, unison: 0, cutoff: 1800, reso: 0.3, sustain: 0.8, release: 0.08 }),
    mo("Growl Table", { level: 0.39, table: 6, pos: 0.4, warp: 0.4, lfoAmt: 0.5, lfoRate: 4, unison: 1, detune: 0.15, cutoff: 2500, sustain: 0.9, release: 0.1 }),
    mo("Sub Morph", { level: 0.42, table: 1, pos: 0.05, warp: 0, unison: 0, cutoff: 900, sustain: 1, release: 0.1 }),
    // Arps and plucks
    mo("Sweep Pluck", { level: 0.64, pos: 0, envAmt: 0.9, envDecay: 0.25, decay: 0.3, sustain: 0.2, lfoAmt: 0 }),
    mo("Vowel Keys", { level: 0.84, table: 5, pos: 0.3, envAmt: 0.5, envDecay: 0.6, decay: 0.8, sustain: 0.4 }),
    mo("Glitch Stab", { level: 0.94, table: 6, pos: 0.8, envAmt: -0.8, envDecay: 0.1, decay: 0.15, sustain: 0, release: 0.1 }),
    mo("Warp Arp", { level: 0.99, table: 3, pos: 0.1, warp: 0.5, envAmt: 0.7, envDecay: 0.12, decay: 0.18, sustain: 0, release: 0.12, lfoAmt: 0 }),
    mo("Bell Table", { level: 0.33, table: 1, pos: 0.9, warp: 0.65, envAmt: -0.5, envDecay: 0.5, decay: 1.2, sustain: 0, release: 1, lfoAmt: 0 }),
    mo("Digital Pluck", { level: 0.58, table: 4, pos: 0.7, envAmt: -0.7, envDecay: 0.15, decay: 0.25, sustain: 0, release: 0.15, lfoAmt: 0 }),
    // FX
    mo("Scanner", { level: 0.39, table: 2, pos: 0.5, lfoAmt: 1, lfoRate: 6, warp: 0.4, sustain: 1 }),
    mo("Warp Riser", { level: 0.17, table: 3, pos: 0, envAmt: 1, envDecay: 4, warp: 0.8, attack: 2, sustain: 1, release: 1, unison: 2, detune: 0.5 }),
  ],
};

// ---------- sampler / SFX pads: "Grab" ----------

/** Built-in sounds (rendered by tools/make-sfx.ts, CC0). Pads reference them as "sfx:<name>". */
/** Grab's built-in sounds (synthesised by tools/make-sfx.ts, ours, CC0), in groups for the sound menu. */
export const SFX_GROUPS: Record<string, string[]> = {
  FX: ["riser", "impact", "laser", "downlifter", "tape-stop", "horn", "glitch", "stab", "sweep-up", "noise-hit",
    "boom", "zap", "whoosh", "reverse-cymbal", "siren", "bubble", "alarm", "coin", "drop", "thunder"],
  Vox: ["vox-ah", "vox-oh", "vox-ee", "vox-oo", "vox-hey", "vox-yeah", "vox-choir", "vox-chop-up", "vox-chop-down", "vox-breath"],
  Stabs: ["stab-major", "stab-minor", "stab-seventh", "stab-organ", "stab-brass", "stab-hit", "stab-piano", "stab-bell", "stab-rave", "stab-sus"],
  Perc: ["snap", "clap", "shaker", "tamb", "conga", "bongo", "woodblock", "triangle", "cowbell", "scratch"],
};
export const SFX = Object.values(SFX_GROUPS).flat();
export const SAMPLER_PADS = 8;
export const PAD_MODES = ["One-shot", "Gate", "Loop"];
export const DEFAULT_SAMPLER_REFS = ["sfx:riser", "sfx:impact", "sfx:laser", "sfx:downlifter", "sfx:tape-stop", "sfx:horn", "sfx:glitch", "sfx:stab"];

const samplerParams: ParamDef[] = [
  { id: "crunch", label: "Crunch", min: 0, max: 1, def: 0 },
  { id: "vinyl", label: "Vinyl", min: 0, max: 1, def: 0 },
  { id: "pitch", label: "Pitch", min: -12, max: 12, def: 0, unit: "st" },
  { id: "level", label: "Level", min: 0, max: 1, def: 0.8 },
];
for (let i = 0; i < SAMPLER_PADS; i++) {
  samplerParams.push(
    { id: `p${i}tune`, label: "Tune", min: -24, max: 24, def: 0, unit: "st" },
    { id: `p${i}start`, label: "Start", min: 0, max: 0.9, def: 0 },
    { id: `p${i}decay`, label: "Decay", min: 0.05, max: 10, def: 10, curve: "exp", unit: "s" },
    { id: `p${i}rev`, label: "Reverse", min: 0, max: 1, def: 0, options: ["Off", "On"] },
    // Hidden voicing:
    { id: `p${i}level`, label: "Level", min: 0, max: 1, def: 0.8 },
    { id: `p${i}pan`, label: "Pan", min: -1, max: 1, def: 0 },
    { id: `p${i}mode`, label: "Mode", min: 0, max: 2, def: 0, options: PAD_MODES },
  );
}

/** A Grab kit: its eight pad sounds (built-in names) and its settings. */
const kit = (name: string, sounds: string[], params: Record<string, number> = {}) => ({ name, params, samples: sounds.map((x) => `sfx:${x}`) });
const allPads = (k: string, v: number) => Object.fromEntries(Array.from({ length: SAMPLER_PADS }, (_, i) => [`p${i}${k}`, v]));

export const SAMPLER: InstrumentDef = {
  kind: "sampler",
  name: "Grab",
  role: "Your own sounds and found sounds, in a boombox",
  group: "fx",
  drumParts: SAMPLER_PADS,
  params: samplerParams,
  macros: ["crunch", "vinyl", "pitch", "p0tune", "p0start", "p1tune", "p0decay", "level"],
  presets: [
    kit("SFX Kit", ["riser", "impact", "laser", "downlifter", "tape-stop", "horn", "glitch", "stab"], { level: 0.59 }),
    kit("Big Drops", ["riser", "downlifter", "impact", "boom", "reverse-cymbal", "sweep-up", "noise-hit", "thunder"], { level: 0.39 }),
    kit("Transitions", ["riser", "sweep-up", "whoosh", "downlifter", "reverse-cymbal", "impact", "tape-stop", "boom"], { level: 0.40 }),
    kit("Arcade", ["laser", "zap", "coin", "bubble", "alarm", "glitch", "drop", "siren"], { level: 0.19, crunch: 0.3 }),
    kit("Sci-Fi", ["laser", "zap", "siren", "bubble", "glitch", "alarm", "sweep-up", "noise-hit"], { level: 0.28, pitch: -3 }),
    kit("Game Show", ["coin", "alarm", "horn", "drop", "laser", "bubble", "stab-brass", "impact"], { level: 0.32 }),
    kit("Dub Siren", ["siren", "horn", "impact", "boom", "drop", "thunder", "stab-minor", "vox-hey"], { level: 0.37, vinyl: 0.4 }),
    kit("Vox Chops", ["vox-ah", "vox-oh", "vox-ee", "vox-oo", "vox-hey", "vox-chop-up", "vox-chop-down", "vox-breath"], { level: 0.47 }),
    kit("Choir Pad", ["vox-choir", "vox-ah", "vox-oh", "vox-oo", "vox-ee", "vox-yeah", "vox-hey", "vox-breath"], { level: 0.76, ...allPads("mode", 1), vinyl: 0.15 }),
    kit("Chipmunk", ["vox-ah", "vox-oh", "vox-ee", "vox-oo", "vox-hey", "vox-yeah", "vox-chop-up", "vox-chop-down"], { level: 0.55, pitch: 12 }),
    kit("Monster", ["vox-ah", "vox-oh", "vox-ee", "vox-oo", "vox-hey", "vox-yeah", "vox-chop-up", "vox-chop-down"], { level: 0.26, pitch: -12, crunch: 0.3 }),
    kit("House Stabs", ["stab-major", "stab-minor", "stab-seventh", "stab-organ", "stab-bell", "stab-sus", "stab-piano", "stab-brass"], { level: 1.00 }),
    kit("Rave Stabs", ["stab-rave", "stab-hit", "stab-minor", "stab-brass", "horn", "siren", "zap", "impact"], { level: 0.23, crunch: 0.2 }),
    kit("Gospel Stabs", ["stab-seventh", "stab-sus", "stab-organ", "vox-choir", "stab-brass", "stab-piano", "stab-major", "vox-hey"], { level: 0.86 }),
    kit("Low Stabs", ["stab-major", "stab-minor", "stab-seventh", "stab-organ", "stab-brass", "stab-hit", "stab-piano", "stab-sus"], { level: 0.98, pitch: -5, vinyl: 0.2 }),
    kit("Hand Perc", ["snap", "clap", "shaker", "tamb", "conga", "bongo", "woodblock", "triangle"], { level: 0.91 }),
    kit("Latin Perc", ["conga", "bongo", "cowbell", "woodblock", "shaker", "tamb", "triangle", "snap"], { level: 0.87, p0tune: -3, p1tune: 2 }),
    kit("Crunch Perc", ["snap", "clap", "shaker", "tamb", "conga", "bongo", "woodblock", "cowbell"], { level: 0.31, crunch: 0.75 }),
    kit("Lo-fi Box", ["stab-piano", "vox-oo", "snap", "shaker", "stab-seventh", "vox-breath", "conga", "scratch"], { level: 0.55, vinyl: 0.65, crunch: 0.3 }),
    kit("Vinyl Dust", ["vox-choir", "stab-piano", "stab-bell", "vox-oo", "triangle", "snap", "stab-sus", "scratch"], { level: 0.90, vinyl: 0.85 }),
    kit("Tape Mess", ["tape-stop", "reverse-cymbal", "glitch", "scratch", "whoosh", "vox-chop-down", "drop", "noise-hit"], { level: 0.34, vinyl: 0.5, crunch: 0.4 }),
    kit("Reversed", ["riser", "impact", "laser", "downlifter", "tape-stop", "horn", "glitch", "stab"], { level: 0.67, ...allPads("rev", 1) }),
    kit("Pitched Down", ["riser", "impact", "laser", "downlifter", "tape-stop", "horn", "glitch", "stab"], { level: 0.53, pitch: -7 }),
    kit("Gated", ["vox-choir", "stab-organ", "siren", "riser", "whoosh", "vox-ah", "stab-brass", "thunder"], { level: 0.53, ...allPads("mode", 1) }),
  ],
};
