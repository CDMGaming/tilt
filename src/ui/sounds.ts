// The UI side of sounds by role: the last ~10 rolls (so NUDGE and the dice don't keep
// serving the same sounds), the generated-share setting, and loading a sound into a track.

import { defaultParams } from "../engine/instruments";
import type { Track } from "../engine/model";
import { generatePreset, soundKey, type PickOptions, type SoundRef } from "../engine/sounds";
import { applyPreset, type PresetEntry } from "./presets";
import { STORE_PREFIX } from "./storage";

const RECENT_KEY = STORE_PREFIX + "recentSounds.v1";
const ROLLS_KEPT = 10;

/** The generated share choices in Settings (the brief's default: 40% generated). */
export const GEN_SHARES = [0, 0.2, 0.4, 0.6];
export const DEFAULT_GEN_SHARE = 0.4;

function loadRolls(): string[][] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Sounds heard in the last rolls (soundKey). */
export function recentSounds(): Set<string> {
  return new Set(loadRolls().flat());
}

/** Remember one roll's sounds. */
export function noteRoll(sounds: SoundRef[]) {
  const rolls = [sounds.map(soundKey), ...loadRolls()].slice(0, ROLLS_KEPT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(rolls)); } catch { /* storage full or blocked */ }
}

/** What the pickers need from the player's settings and history. */
export function pickOptions(genShare: number | undefined): PickOptions {
  return { recent: recentSounds(), genShare: genShare ?? DEFAULT_GEN_SHARE };
}

/** Load a sound (built in or generated) into a track. */
export function applySound(track: Track, s: SoundRef, list: PresetEntry[]) {
  if (s.gen !== undefined) {
    const g = generatePreset(track.kind, s.gen);
    track.params = { ...defaultParams(track.kind), ...g.params };
    track.preset = g.name;
    track.gen = s.gen;
  } else applyPreset(track, list[s.preset]);
}
