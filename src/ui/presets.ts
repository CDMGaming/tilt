// User presets: sounds saved by the player, reusable in any song.
// Stored in the browser (per instrument), alongside the factory presets.

import { INSTRUMENTS, defaultParams } from "../engine/instruments";
import type { InstrumentKind, Track } from "../engine/model";
import { STORE_PREFIX } from "./storage";

const KEY = STORE_PREFIX + "userPresets.v1";
export const USER_MARK = "★ ";

export interface PresetEntry { name: string; params: Record<string, number>; user: boolean; samples?: string[]; sampleNames?: string[] }

type Store = Partial<Record<InstrumentKind, { name: string; params: Record<string, number>; samples?: string[]; sampleNames?: string[] }[]>>;

function load(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
}

function save(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

export function userPresets(kind: InstrumentKind) {
  return load()[kind] ?? [];
}

/** Factory presets first, then the user's (names prefixed with a star). */
export function allPresets(kind: InstrumentKind): PresetEntry[] {
  return [
    ...INSTRUMENTS[kind].presets.map((p) => ({ name: p.name, params: p.params, user: false, samples: p.samples })),
    ...userPresets(kind).map((p) => ({ name: USER_MARK + p.name, params: p.params, user: true, samples: p.samples, sampleNames: p.sampleNames })),
  ];
}

export function applyPreset(track: Track, p: PresetEntry) {
  track.params = { ...defaultParams(track.kind), ...p.params };
  track.preset = p.name;
  // A sampler kit brings its pad sounds.
  if (p.samples) { track.samples = [...p.samples]; track.sampleNames = p.sampleNames ? [...p.sampleNames] : undefined; if (!track.sampleNames) delete track.sampleNames; }
  delete track.gen;
}

export function presetPosition(track: Track): number {
  return Math.max(0, allPresets(track.kind).findIndex((p) => p.name === track.preset));
}

/** Save the track's current sound. Same name replaces. Returns the stored display name. */
export function saveUserPreset(track: Track, name: string): string {
  const s = load();
  const list = (s[track.kind] ??= []);
  const clean = name.replace(/^[★✦]\s*/, "").trim().slice(0, 32);
  const i = list.findIndex((p) => p.name === clean);
  const entry = { name: clean, params: { ...track.params }, ...(track.kind === "sampler" && track.samples ? { samples: [...track.samples], sampleNames: [...(track.sampleNames ?? [])] } : {}) };
  if (i >= 0) list[i] = entry; else list.push(entry);
  save(s);
  return USER_MARK + clean;
}

export function deleteUserPreset(kind: InstrumentKind, name: string) {
  const s = load();
  s[kind] = (s[kind] ?? []).filter((p) => p.name !== name.replace(/^★\s*/, ""));
  save(s);
}
