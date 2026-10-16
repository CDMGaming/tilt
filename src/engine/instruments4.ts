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
