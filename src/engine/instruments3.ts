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

export const FM: InstrumentDef = {
  kind: "fm",
  name: "Glint",
  role: "FM synth: bells, keys, metallic tones",
  group: "harmony",
  params: [
    { id: "ratioC", label: "Carrier", min: 0, max: 4, def: 1, options: C_RATIOS },
    { id: "ratioM", label: "Modulator", min: 0, max: 14, def: 6, options: M_RATIOS },
    { id: "index", label: "FM amount", min: 0, max: 10, def: 3 },
    { id: "indexDecay", label: "FM decay", min: 0.02, max: 6, def: 0.8, curve: "exp", unit: "s" },
    { id: "indexSus", label: "FM sustain", min: 0, max: 1, def: 0.15 },
    { id: "feedback", label: "Feedback", min: 0, max: 1, def: 0.05 },
    { id: "velIndex", label: "Vel → FM", min: 0, max: 1, def: 0.6 },
    { id: "detune", label: "Stereo", min: 0, max: 1, def: 0.3 },
    { id: "attack", label: "A", min: 0.001, max: 2, def: 0.002, curve: "exp", unit: "s" },
    { id: "decay", label: "D", min: 0.05, max: 6, def: 1.6, curve: "exp", unit: "s" },
    { id: "sustain", label: "S", min: 0, max: 1, def: 0 },
    { id: "release", label: "R", min: 0.05, max: 6, def: 1.2, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.6 },
  ],
  macros: ["ratioM", "index", "indexDecay", "feedback", "detune", "decay", "release", "level"],
  presets: [
    { name: "Glass Bell", params: {} },
    { name: "Tine Keys", params: { ratioM: 7, index: 2.2, indexDecay: 0.4, decay: 2, sustain: 0.25, velIndex: 0.8 } },
    { name: "Tubular", params: { ratioM: 3, index: 4, indexDecay: 2, decay: 4, release: 3 } },
    { name: "Marimba", params: { ratioM: 7, index: 1.5, indexDecay: 0.08, decay: 0.4, release: 0.3 } },
    { name: "Metal Clang", params: { ratioM: 2, index: 7, feedback: 0.4, indexDecay: 0.3, decay: 1 } },
    { name: "FM Bass", params: { ratioC: 0, ratioM: 1, index: 4, indexDecay: 0.15, indexSus: 0.3, decay: 0.5, sustain: 0.6, release: 0.1 } },
    { name: "Soft Pad", params: { ratioM: 3, index: 1.2, indexSus: 0.8, attack: 0.6, decay: 2, sustain: 0.8, release: 2.5 } },
    { name: "Wind Chime", params: { ratioC: 2, ratioM: 13, index: 3, indexDecay: 1.2, decay: 5, release: 5, detune: 0.7 } },
  ],
};

// ---------- wavetable synth: "Morph" (factory tables from the CHOMPI firmware, MIT) ----------

export const TABLE_NAMES = ["Table 1", "Table 2", "Table 3", "Table 4", "Table 5", "Table 6", "Table 7"];
export const WT_FRAMES = 33;
export const WT_SIZE = 2048;
export const WT_LEVELS = 9; // mip levels: 1024 harmonics, 512, ... 4

export const WAVE: InstrumentDef = {
  kind: "wave",
  name: "Morph",
  role: "Wavetable synth: sweep through 33 waveforms",
  group: "harmony",
  params: [
    { id: "table", label: "Table", min: 0, max: 6, def: 0, options: TABLE_NAMES },
    { id: "pos", label: "Position", min: 0, max: 1, def: 0.2 },
    { id: "envAmt", label: "Pos env", min: -1, max: 1, def: 0.4 },
    { id: "envDecay", label: "Env decay", min: 0.05, max: 4, def: 0.8, curve: "exp", unit: "s" },
    { id: "lfoAmt", label: "Pos LFO", min: 0, max: 1, def: 0.15 },
    { id: "lfoRate", label: "LFO rate", min: 0.05, max: 10, def: 0.5, curve: "exp", unit: "Hz" },
    { id: "unison", label: "Voices", min: 0, max: 2, def: 1, options: ["1", "2", "3"] },
    { id: "detune", label: "Detune", min: 0, max: 1, def: 0.25 },
    { id: "cutoff", label: "Cutoff", min: 100, max: 16000, def: 9000, curve: "exp", unit: "Hz" },
    { id: "reso", label: "Reso", min: 0, max: 1, def: 0.15 },
    { id: "attack", label: "A", min: 0.001, max: 3, def: 0.01, curve: "exp", unit: "s" },
    { id: "decay", label: "D", min: 0.02, max: 4, def: 0.6, curve: "exp", unit: "s" },
    { id: "sustain", label: "S", min: 0, max: 1, def: 0.7 },
    { id: "release", label: "R", min: 0.01, max: 5, def: 0.6, curve: "exp", unit: "s" },
    { id: "level", label: "Level", min: 0, max: 1, def: 0.55 },
  ],
  macros: ["pos", "envAmt", "lfoAmt", "lfoRate", "detune", "cutoff", "release", "level"],
  presets: [
    { name: "Morph Lead", params: {} },
    { name: "Sweep Pluck", params: { pos: 0, envAmt: 0.9, envDecay: 0.25, decay: 0.3, sustain: 0.2, lfoAmt: 0 } },
    { name: "Slow Scan", params: { table: 2, pos: 0.1, envAmt: 0, lfoAmt: 0.6, lfoRate: 0.15, attack: 0.4, release: 1.5 } },
    { name: "Digital Bass", params: { table: 4, pos: 0.5, envAmt: -0.4, envDecay: 0.3, unison: 0, cutoff: 3000, sustain: 0.8, release: 0.1 } },
    { name: "Wide Pad", params: { table: 1, pos: 0.4, unison: 2, detune: 0.6, attack: 0.8, release: 2.5, lfoAmt: 0.3, lfoRate: 0.2, level: 0.85 } },
    { name: "Vowel Keys", params: { table: 5, pos: 0.3, envAmt: 0.5, envDecay: 0.6, decay: 0.8, sustain: 0.4, level: 0.95 } },
    { name: "Glitch Stab", params: { table: 6, pos: 0.8, envAmt: -0.8, envDecay: 0.1, decay: 0.15, sustain: 0, release: 0.1 } },
    { name: "Bright Saws", params: { table: 3, pos: 0.6, unison: 2, detune: 0.4, cutoff: 12000 } },
  ],
};

// ---------- sampler / SFX pads: "Grab" ----------

/** Built-in sounds (rendered by tools/make-sfx.ts, CC0). Pads reference them as "sfx:<name>". */
export const SFX = ["riser", "impact", "laser", "downlifter", "tape-stop", "horn", "glitch", "stab", "sweep-up", "noise-hit"];
export const SAMPLER_PADS = 8;
export const PAD_MODES = ["One-shot", "Gate", "Loop"];
export const DEFAULT_SAMPLER_REFS = ["sfx:riser", "sfx:impact", "sfx:laser", "sfx:downlifter", "sfx:tape-stop", "sfx:horn", "sfx:glitch", "sfx:stab"];

const samplerParams: ParamDef[] = [];
for (let i = 0; i < SAMPLER_PADS; i++) {
  samplerParams.push(
    { id: `p${i}tune`, label: "Tune", min: -24, max: 24, def: 0, unit: "st" },
    { id: `p${i}start`, label: "Start", min: 0, max: 0.9, def: 0 },
    { id: `p${i}decay`, label: "Decay", min: 0.05, max: 10, def: 10, curve: "exp", unit: "s" },
    { id: `p${i}level`, label: "Level", min: 0, max: 1, def: 0.8 },
    { id: `p${i}pan`, label: "Pan", min: -1, max: 1, def: 0 },
    { id: `p${i}rev`, label: "Reverse", min: 0, max: 1, def: 0, options: ["Off", "On"] },
    { id: `p${i}mode`, label: "Mode", min: 0, max: 2, def: 0, options: PAD_MODES },
  );
}
samplerParams.push({ id: "level", label: "Level", min: 0, max: 1, def: 0.8 });

export const SAMPLER: InstrumentDef = {
  kind: "sampler",
  name: "Grab",
  role: "Sampler pads: built-in SFX or drop in your own WAVs",
  group: "fx",
  drumParts: SAMPLER_PADS,
  params: samplerParams,
  macros: ["p0tune", "p0decay", "p1tune", "p1decay", "p2tune", "p3tune", "p0start", "level"],
  presets: [
    { name: "SFX Kit", params: {} },
    { name: "Reversed", params: Object.fromEntries(Array.from({ length: SAMPLER_PADS }, (_, i) => [`p${i}rev`, 1])) },
    { name: "Pitched Down", params: Object.fromEntries(Array.from({ length: SAMPLER_PADS }, (_, i) => [`p${i}tune`, -7])) },
    { name: "Gated", params: Object.fromEntries(Array.from({ length: SAMPLER_PADS }, (_, i) => [`p${i}mode`, 1])) },
  ],
};
