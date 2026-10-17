// Song data model. Plain JSON-serialisable objects only. The engine never
// touches the DOM, so this model (and everything in src/engine) can be ported.

import { DEFAULT_SAMPLER_REFS } from "./instruments3";

export const PPQ = 96; // ticks per quarter note; divisible by 2, 3, 4 (16ths and triplets)
export const BEATS_PER_BAR = 4; // 4/4 only, on purpose
export const TICKS_PER_BAR = PPQ * BEATS_PER_BAR;
export const MAX_BARS = 8;
export const MAX_TRACKS = 8;
export const MAX_SCENES = 32;

export type InstrumentKind = "drums" | "acid" | "poly" | "lead" | "analog" | "wobble" | "pad" | "chip" | "fm" | "wave" | "sampler" | "epiano" | "pluck" | "organ" | "anthem" | "patch" | "vox" | "boom" | "piano" | "garage" | "chop" | "midi" | "guitar";

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

export interface MidiBinding { ch: number; cc: number; trackId: number; key: string }

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
  /** A generated sound: its recipe seed (see sounds.ts), so a setup code can bring it back. */
  gen?: number;
  params: Record<string, number>; // full instrument state
  volume: number; // 0..1
  pan: number; // -1..1
  send: number; // master reverb send 0..1
  fx: FxSlot[]; // FX_SLOTS insert effects, "off" when empty
  samples?: string[]; // sampler pads: "sfx:<name>" (built in) or "user:<id>" (stored in the browser)
  sampleNames?: string[]; // display names for the pads (user samples)
  mute: boolean;
  solo: boolean;
  clips: Record<number, Clip>; // keyed by scene id; a missing key is an empty cell
  color: number; // shade of the instrument's colour: 0 = first of its kind, 1 = second… (see assignShades)
  /** Length of new notes on this track, in ticks (missing: the grid step). */
  noteLen?: number;
  /** External tracks: the MIDI output's name ("" or missing: none), and a label per CC knob. */
  midiPort?: string;
  ccLabels?: string[];
}

export interface Scene {
  id: number;
  name: string;
  repeat: number; // 1..16
  tempo: number | null; // null = song tempo
  fadeIn: boolean;
  fadeOut: boolean;
  transpose?: number; // semitones for every non-drum track in this scene (a key change)
}

export interface Song {
  version: 1;
  title: string;
  tempo: number; // BPM
  swing: number; // 0..100
  key: number; // 0 = C .. 11 = B
  scale: string; // id from music.ts SCALES
  songLoop: boolean;
  /** SCENE mode: false plays the scene once and stops (missing / true: it loops). */
  sceneLoop?: boolean;
  metronome: boolean;
  tracks: Track[];
  scenes: Scene[];
  /**
   * The song chain: what SONG mode plays, in order. A scene can appear more than once, each
   * step with its own repeat count. Missing (songs from before the chain): every scene in row order.
   */
  chain?: ChainStep[];
  master: Master;
  nextId: number;
  setupCode?: string; // DICE share code this song was started from
  /** How a shared song opens: ready to play the whole song (SONG) or the first scene (SCENE). */
  playAs?: "song" | "scene";
  /** Opened from someone's share: its song code (shown as "Shared · TILT-XXXXXXXX"). */
  sharedFrom?: string;
  /** Codes this song was shared under, newest first (each edit shares as a new code). */
  shares?: { code: string; at: number }[];
  challenges?: string[]; // challenge card ids dealt at START
  libId?: string; // id in the song library (set on first save)
  /** MIDI learn: hardware CC -> a parameter of a track. */
  midiMap?: MidiBinding[];
}

/**
 * Online games: each player hands out ids from their own lane (id % lanes === lane),
 * so two machines adding notes at the same moment never pick the same id.
 */
export const idLanes = { lane: 0, lanes: 1 };

export function newId(song: Song): number {
  let n = song.nextId;
  while (idLanes.lanes > 1 && n % idLanes.lanes !== idLanes.lane) n++;
  song.nextId = n + 1;
  return n;
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
export interface ChainStep { sceneId: number; repeat: number }

/** What SONG mode plays: the chain, or (none yet) every scene in row order. Steps whose scene is gone are skipped. */
export function songChain(song: Song): ChainStep[] {
  const ids = new Set(song.scenes.map((s) => s.id));
  const c = (song.chain ?? []).filter((x) => ids.has(x.sceneId));
  return c.length ? c : song.scenes.map((s) => ({ sceneId: s.id, repeat: Math.max(1, s.repeat) }));
}

/** The first chain step that plays this scene (0 when it isn't in the chain). */
export function chainIndexOf(song: Song, sceneId: number): number {
  return Math.max(0, songChain(song).findIndex((x) => x.sceneId === sceneId));
}

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

/** Colour shades follow the instrument: the n-th track of an instrument gets shade n. */
export function assignShades(song: Song) {
  const seen = new Map<InstrumentKind, number>();
  for (const t of song.tracks) {
    const n = seen.get(t.kind) ?? 0;
    t.color = n;
    seen.set(t.kind, n + 1);
  }
}

/** Fill in fields added after a song was saved (older autosaves, shared files). */
export function normalizeSong(song: Song): Song {
  assignShades(song);
  song.master = { ...defaultMaster(), ...(song.master ?? {}) };
  song.midiMap ??= [];
  // Songs from before the chain get one: the scenes in row order, with their repeat counts.
  song.chain = songChain(song).map((x) => ({ ...x }));
  for (const t of song.tracks) {
    t.send ??= 0.15;
    if (t.kind === "sampler" && !t.samples) t.samples = [...DEFAULT_SAMPLER_REFS];
    t.fx ??= emptyFx();
    while (t.fx.length < FX_SLOTS) t.fx.push({ type: "off", a: 0.5, b: 0.5 });
  }
  return song;
}
