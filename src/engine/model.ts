// Song data model. Plain JSON-serialisable objects only. The engine never
// touches the DOM, so this model (and everything in src/engine) can be ported.

export const PPQ = 96; // ticks per quarter note; divisible by 2, 3, 4 (16ths and triplets)
export const BEATS_PER_BAR = 4; // 4/4 only, on purpose
export const TICKS_PER_BAR = PPQ * BEATS_PER_BAR;
export const MAX_BARS = 8;
export const MAX_TRACKS = 8;
export const MAX_SCENES = 32;

export type InstrumentKind = "drums" | "acid" | "poly";

export interface Note {
  id: number;
  pitch: number; // MIDI note. Drum tracks: 36 + part index
  start: number; // ticks from clip start
  len: number; // ticks
  vel: number; // 1..127
}

/** One automation breakpoint. `v` is the knob position 0..1 (not the raw value). */
export interface AutoPoint { tick: number; v: number }

export interface Clip {
  bars: number; // 1..MAX_BARS
  notes: Note[];
  muted: boolean; // clip mute (used by the auto-arranger)
  /** Automation lanes keyed by param key (see params.ts): instrument ids, "mix:vol", "fx0:a"... */
  auto?: Record<string, AutoPoint[]>;
}

export const FX_SLOTS = 3;

/** An insert effect: a type and its two knobs (EDIT 1 / EDIT 2), each 0..1. */
export interface FxSlot { type: string; a: number; b: number }

export interface Master {
  volume: number; // 0..1
  limiter: boolean;
  limitDepth: number; // 0..1
  reverb: boolean;
  reverbTime: number; // 0..1
}

export interface Track {
  id: number;
  name: string;
  kind: InstrumentKind;
  preset: string; // name of the preset last loaded (display only)
  params: Record<string, number>; // full instrument state
  volume: number; // 0..1
  pan: number; // -1..1
  send: number; // master reverb send 0..1
  fx: FxSlot[]; // FX_SLOTS insert effects, "off" when empty
  mute: boolean;
  solo: boolean;
  clips: Record<number, Clip>; // keyed by scene id; a missing key is an empty cell
  color: number; // palette index
}

export interface Scene {
  id: number;
  name: string;
  repeat: number; // 1..16
  tempo: number | null; // null = song tempo
  fadeIn: boolean;
  fadeOut: boolean;
}

export interface Song {
  version: 1;
  title: string;
  tempo: number; // BPM
  swing: number; // 0..100
  key: number; // 0 = C .. 11 = B
  scale: string; // id from music.ts SCALES
  songLoop: boolean;
  metronome: boolean;
  tracks: Track[];
  scenes: Scene[];
  master: Master;
  nextId: number;
  setupCode?: string; // DICE share code this song was started from
}

export function newId(song: Song): number {
  return song.nextId++;
}

export function emptyClip(bars = 1): Clip {
  return { bars, notes: [], muted: false };
}

export function newSong(): Song {
  const song: Song = {
    version: 1,
    title: "Untitled",
    tempo: 120,
    swing: 0,
    key: 0,
    scale: "minor",
    songLoop: false,
    metronome: false,
    tracks: [],
    scenes: [],
    master: defaultMaster(),
    nextId: 1,
  };
  song.scenes.push({ id: newId(song), name: "Scene 1", repeat: 1, tempo: null, fadeIn: false, fadeOut: false });
  return song;
}

/** Length of a scene in ticks: the longest clip in it, at least one bar. */
export function sceneTicks(song: Song, sceneId: number): number {
  let bars = 1;
  for (const t of song.tracks) {
    const c = t.clips[sceneId];
    if (c && c.bars > bars) bars = c.bars;
  }
  return bars * TICKS_PER_BAR;
}

export function sceneTempo(song: Song, scene: Scene): number {
  return scene.tempo ?? song.tempo;
}

export function defaultMaster(): Master {
  return { volume: 0.9, limiter: true, limitDepth: 0.5, reverb: true, reverbTime: 0.45 };
}

export function emptyFx(): FxSlot[] {
  return Array.from({ length: FX_SLOTS }, () => ({ type: "off", a: 0.5, b: 0.5 }));
}

/** Fill in fields added after a song was saved (older autosaves, shared files). */
export function normalizeSong(song: Song): Song {
  song.master = { ...defaultMaster(), ...(song.master ?? {}) };
  for (const t of song.tracks) {
    t.send ??= 0.15;
    t.fx ??= emptyFx();
    while (t.fx.length < FX_SLOTS) t.fx.push({ type: "off", a: 0.5, b: 0.5 });
  }
  return song;
}
