// Every automatable thing on a track has a string key:
//   instrument params: their own ids ("cutoff", "p0tune", ...)
//   mixer:             "mix:vol", "mix:pan", "mix:send"
//   insert FX knobs:   "fx0:a", "fx0:b", ... (slot index, EDIT 1 / EDIT 2)
// This module maps keys to ParamDefs and values, for knobs, MIDI, lanes and the worklet.

import { paramDef, type ParamDef } from "./instruments";
import { scaleById } from "./music";
import type { Track } from "./model";

export interface FxDef { id: string; name: string; a: string; b: string; defA: number; defB: number }

/** Insert effects: each has exactly two knobs. Order is stable (the worklet uses the index). */
export const FX_TYPES: FxDef[] = [
  { id: "off", name: "—", a: "", b: "", defA: 0.5, defB: 0.5 },
  { id: "eq", name: "EQ", a: "Low", b: "High", defA: 0.5, defB: 0.5 },
  { id: "lpf", name: "Low-pass", a: "Cutoff", b: "Reso", defA: 0.6, defB: 0.3 },
  { id: "hpf", name: "High-pass", a: "Cutoff", b: "Reso", defA: 0.3, defB: 0.3 },
  { id: "bpf", name: "Band-pass", a: "Freq", b: "Reso", defA: 0.5, defB: 0.4 },
  { id: "comp", name: "Compressor", a: "Amount", b: "Attack", defA: 0.5, defB: 0.3 },
  { id: "drive", name: "Drive", a: "Gain", b: "Level", defA: 0.4, defB: 0.6 },
  { id: "decim", name: "Decimator", a: "Rate", b: "Bits", defA: 0.5, defB: 0.5 },
  { id: "chorus", name: "Chorus", a: "Speed", b: "Depth", defA: 0.3, defB: 0.5 },
  { id: "phaser", name: "Phaser", a: "Speed", b: "Depth", defA: 0.3, defB: 0.6 },
  { id: "trem", name: "Tremolo", a: "Speed", b: "Depth", defA: 0.5, defB: 0.6 },
  { id: "pump", name: "Pump", a: "Rate", b: "Depth", defA: 0.4, defB: 0.7 }, // 1/4: the classic sidechain pump
  { id: "slicer", name: "Slicer", a: "Rate", b: "Hold", defA: 0.5, defB: 0.5 },
  { id: "delay", name: "BPM delay", a: "Time", b: "Depth", defA: 0.4, defB: 0.4 },
  { id: "room", name: "Room reverb", a: "Time", b: "Level", defA: 0.4, defB: 0.4 },
  { id: "hall", name: "Hall reverb", a: "Time", b: "Level", defA: 0.6, defB: 0.4 },
];

export const fxIndex = (id: string) => Math.max(0, FX_TYPES.findIndex((f) => f.id === id));
export const fxDef = (id: string) => FX_TYPES[fxIndex(id)];

/** Tempo-synced divisions used by pump / slicer / delay "Rate"/"Time" knobs (in beats). */
export const SYNC_DIVS: { label: string; beats: number }[] = [
  { label: "1/32", beats: 0.125 }, { label: "1/16", beats: 0.25 }, { label: "1/16.", beats: 0.375 },
  { label: "1/8", beats: 0.5 }, { label: "1/8.", beats: 0.75 }, { label: "1/4", beats: 1 },
  { label: "1/4.", beats: 1.5 }, { label: "1/2", beats: 2 }, { label: "1 bar", beats: 4 },
];
export const syncDiv = (u: number) => SYNC_DIVS[Math.min(SYNC_DIVS.length - 1, Math.floor(u * SYNC_DIVS.length))];

const MIX: Record<string, ParamDef> = {
  "mix:vol": { id: "mix:vol", label: "Volume", min: 0, max: 1, def: 0.8 },
  "mix:pan": { id: "mix:pan", label: "Pan", min: -1, max: 1, def: 0 },
  "mix:send": { id: "mix:send", label: "Reverb send", min: 0, max: 1, def: 0.15 },
};

/** ParamDef for any key on this track (FX knob labels depend on the slot's current type). */
export function paramInfo(track: Track, key: string): ParamDef | undefined {
  if (MIX[key]) return MIX[key];
  const m = /^fx(\d):([ab])$/.exec(key);
  if (m) {
    const slot = track.fx[Number(m[1])];
    if (!slot) return undefined;
    const d = fxDef(slot.type);
    const label = m[2] === "a" ? d.a : d.b;
    return { id: key, label: `${d.name} ${label}`, min: 0, max: 1, def: m[2] === "a" ? d.defA : d.defB };
  }
  return paramDef(track.kind, key);
}

export function getParam(track: Track, key: string): number {
  switch (key) {
    case "mix:vol": return track.volume;
    case "mix:pan": return track.pan;
    case "mix:send": return track.send;
  }
  const m = /^fx(\d):([ab])$/.exec(key);
  if (m) return track.fx[Number(m[1])]?.[m[2] as "a" | "b"] ?? 0.5;
  return track.params[key] ?? paramDef(track.kind, key)?.def ?? 0;
}

export function setParamValue(track: Track, key: string, v: number) {
  switch (key) {
    case "mix:vol": track.volume = v; return;
    case "mix:pan": track.pan = v; return;
    case "mix:send": track.send = v; return;
  }
  const m = /^fx(\d):([ab])$/.exec(key);
  if (m) { const s = track.fx[Number(m[1])]; if (s) s[m[2] as "a" | "b"] = v; return; }
  track.params[key] = v;
}

/** Everything the worklet needs to know about a track, flattened into one params object. */
/** Everything the worklet needs for a track; `song` adds its key and whether the scale is minor (Boom's stab follows them). */
export function workletParams(track: Track, song?: { key: number; scale: string }): Record<string, number> {
  const out: Record<string, number> = { ...track.params, "mix:vol": track.volume, "mix:pan": track.pan, "mix:send": track.send };
  if (song) { out["song:key"] = song.key; out["song:minor"] = scaleById(song.scale).steps.includes(3) ? 1 : 0; }
  track.fx.forEach((f, i) => {
    out[`fx${i}:type`] = fxIndex(f.type);
    out[`fx${i}:a`] = f.a;
    out[`fx${i}:b`] = f.b;
  });
  return out;
}
