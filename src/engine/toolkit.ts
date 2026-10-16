// The shared voice toolkit: building blocks every synth gets on its "More" page (a second
// filter with its own envelope, 2 LFOs, velocity, voice mode, pitch envelope, pulse width,
// a built-in FX slot saved with the preset, and on leads Pump + Repeat), plus each synth's
// XY pad targets. All of it lives in the track's params under "tk:" / "ifx:" keys, so presets,
// undo, automation, MIDI learn and sharing carry it like any other knob. Shared by the UI and
// the worklet (src/engine/dsp/toolkit-dsp.ts).

import type { ParamDef } from "./instruments";
import type { InstrumentKind } from "./model";
import { FX_TYPES } from "./params";

/** Synths that get the toolkit (drum machines and the sampler don't). */
export const TOOLKIT_KINDS: InstrumentKind[] = ["acid", "poly", "lead", "wobble", "pad", "chip", "fm", "wave", "epiano", "pluck", "anthem", "patch"];
/** Polyphonic synths: these get the voice-mode section (the mono ones have their own glide / legato). */
export const POLY_KINDS: InstrumentKind[] = ["poly", "pad", "chip", "fm", "wave", "epiano", "pluck"];
/** Lead synths: these get the performance FX (Pump, Repeat). */
export const LEAD_KINDS: InstrumentKind[] = ["lead", "chip", "anthem"];

export const hasToolkit = (k: InstrumentKind) => TOOLKIT_KINDS.includes(k);

/** Each synth's most characterful parameter: an LFO destination ("Tone") alongside the common ones. */
export const TONE_PARAM: Partial<Record<InstrumentKind, { id: string; label: string }>> = {
  epiano: { id: "tone", label: "Tone" },
  acid: { id: "envmod", label: "Env mod" }, poly: { id: "mix", label: "Osc mix" }, lead: { id: "sync", label: "Sync" },
  wobble: { id: "xmod", label: "X-mod" }, pad: { id: "lofi", label: "Lo-fi" }, chip: { id: "crush", label: "Crush" },
  fm: { id: "index", label: "FM amount" }, wave: { id: "pos", label: "Position" },
};

/** The XY pad (X, Y): only where the pad is the instrument's idea (Morph's Warp pad; Vox later). */
export const XY_PARAMS: Partial<Record<InstrumentKind, [string, string]>> = {
  wave: ["pos", "warp"],
};

export const FILTER_TYPES = ["Off", "LP12", "LP24", "HP", "BP", "Notch"];
export const LFO_SHAPES = ["Sine", "Triangle", "Saw", "Square", "S&H"];
/** LFO sync: "Free" (the Rate knob, Hz) or a note value; in beats. */
export const LFO_SYNC = ["Free", "1 bar", "1/2", "1/4", "1/8", "1/16", "1/4T", "1/8T"];
export const LFO_SYNC_BEATS = [0, 4, 2, 1, 0.5, 0.25, 2 / 3, 1 / 3];
/** LFO destinations: the common ones, then the synth's own "Tone" parameter. */
export const LFO_DESTS = ["None", "Pitch", "Filter", "Amp", "Pan", "Pulse width", "Tone"];
export const DEST = { none: 0, pitch: 1, filter: 2, amp: 3, pan: 4, pw: 5, tone: 6 } as const;
export const VOICE_MODES = ["Poly", "Mono", "Legato"];
export const REPEAT_DIVS = ["1/8", "1/16", "1/32"];
export const REPEAT_BEATS = [0.5, 0.25, 0.125];

const lfo = (n: 1 | 2, kind: InstrumentKind): ParamDef[] => {
  const tone = TONE_PARAM[kind]?.label ?? "Tone";
  return [
    { id: `tk:l${n}Shape`, label: "Shape", min: 0, max: LFO_SHAPES.length - 1, def: 0, options: LFO_SHAPES },
    { id: `tk:l${n}Rate`, label: "Rate", min: 0.05, max: 20, def: n === 1 ? 4 : 0.5, curve: "exp", unit: "Hz" },
    { id: `tk:l${n}Sync`, label: "Sync", min: 0, max: LFO_SYNC.length - 1, def: 0, options: LFO_SYNC },
    { id: `tk:l${n}Key`, label: "Key sync", min: 0, max: 1, def: 0, options: ["Free", "Retrig"] },
    { id: `tk:l${n}Delay`, label: "Fade in", min: 0, max: 4, def: 0, unit: "s" },
    { id: `tk:l${n}Dest`, label: "To", min: 0, max: LFO_DESTS.length - 1, def: 0, options: LFO_DESTS.map((d) => (d === "Tone" ? tone : d)) },
    { id: `tk:l${n}Amt`, label: "Amount", min: -1, max: 1, def: 0 },
  ];
};

const cache = new Map<InstrumentKind, ParamDef[]>();

/** Every toolkit parameter this instrument has (built once per kind). */
export function toolkitParams(kind: InstrumentKind): ParamDef[] {
  let out = cache.get(kind);
  if (out) return out;
  out = [
    // The built-in FX slot (every instrument): same effects as the mixer's inserts, kept in the preset.
    { id: "ifx:type", label: "FX", min: 0, max: FX_TYPES.length - 1, def: 0, options: FX_TYPES.map((f) => (f.id === "off" ? "Off" : f.name)) },
    { id: "ifx:a", label: "Edit 1", min: 0, max: 1, def: 0.5 },
    { id: "ifx:b", label: "Edit 2", min: 0, max: 1, def: 0.5 },
  ];
  if (hasToolkit(kind)) {
    out.push(
      { id: "tk:fType", label: "Filter", min: 0, max: FILTER_TYPES.length - 1, def: 0, options: FILTER_TYPES },
      { id: "tk:fCut", label: "Cutoff", min: 20, max: 18000, def: 3000, curve: "exp", unit: "Hz" },
      { id: "tk:fRes", label: "Reso", min: 0, max: 0.95, def: 0.2 },
      { id: "tk:fTrack", label: "Key track", min: 0, max: 1, def: 0.5 },
      { id: "tk:fEnv", label: "Env", min: -1, max: 1, def: 0 },
      { id: "tk:fA", label: "A", min: 0.001, max: 4, def: 0.005, curve: "exp", unit: "s" },
      { id: "tk:fD", label: "D", min: 0.01, max: 4, def: 0.3, curve: "exp", unit: "s" },
      { id: "tk:fS", label: "S", min: 0, max: 1, def: 0.4 },
      { id: "tk:fR", label: "R", min: 0.01, max: 4, def: 0.3, curve: "exp", unit: "s" },
      ...lfo(1, kind), ...lfo(2, kind),
      { id: "tk:velAmp", label: "Vel → amp", min: 0, max: 1, def: 1 },
      { id: "tk:velFilt", label: "Vel → filter", min: 0, max: 1, def: 0 },
      { id: "tk:pAmt", label: "Pitch env", min: -24, max: 24, def: 0, unit: "st" },
      { id: "tk:pDec", label: "P decay", min: 0.005, max: 1, def: 0.08, curve: "exp", unit: "s" },
      { id: "tk:pw", label: "Pulse width", min: 0.05, max: 0.95, def: 0.5 },
    );
    if (POLY_KINDS.includes(kind)) out.push(
      { id: "tk:mode", label: "Voice", min: 0, max: VOICE_MODES.length - 1, def: 0, options: VOICE_MODES },
      { id: "tk:uni", label: "Unison", min: 1, max: 4, def: 1, options: ["1", "2", "3", "4"] },
      { id: "tk:uniDet", label: "Detune", min: 0, max: 1, def: 0.3 },
      { id: "tk:glide", label: "Glide", min: 0, max: 1.5, def: 0, unit: "s" },
    );
    if (LEAD_KINDS.includes(kind)) out.push(
      { id: "tk:pump", label: "Pump", min: 0, max: 1, def: 0 },
      { id: "tk:repeat", label: "Repeat", min: 0, max: 1, def: 0 },
      { id: "tk:repDiv", label: "Repeat rate", min: 0, max: REPEAT_DIVS.length - 1, def: 1, options: REPEAT_DIVS },
    );
  }
  cache.set(kind, out);
  return out;
}

export const isToolkitKey = (id: string) => id.startsWith("tk:") || id.startsWith("ifx:");
