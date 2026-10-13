// Edits on the song model. All mutate in place; callers snapshot for undo first.

import {
  MAX_BARS, MAX_SCENES, MAX_TRACKS, TICKS_PER_BAR, emptyClip, emptyFx, newId, sceneTicks,
  type AutoPoint, type Clip, type InstrumentKind, type Note, type Scene, type Song, type Track,
} from "./model";
import { INSTRUMENTS, presetParams } from "./instruments";

export const SCENE_NAMES = ["Intro", "Verse", "Build", "Chorus", "Drop", "Break", "Bridge", "Outro"];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function freeColor(song: Song): number {
  const used = new Set(song.tracks.map((t) => t.color));
  for (let c = 0; c < 8; c++) if (!used.has(c)) return c;
  return song.tracks.length % 8;
}

export function addTrack(song: Song, kind: InstrumentKind, preset = 0, at = song.tracks.length): Track | null {
  if (song.tracks.length >= MAX_TRACKS) return null;
  const def = INSTRUMENTS[kind];
  const t: Track = {
    id: newId(song), name: def.name, kind,
    preset: def.presets[preset % def.presets.length].name,
    params: presetParams(kind, preset),
    volume: 0.8, pan: 0, send: 0.15, fx: emptyFx(), mute: false, solo: false, clips: {}, color: freeColor(song),
  };
  song.tracks.splice(at, 0, t);
  return t;
}

export function duplicateTrack(song: Song, index: number): Track | null {
  if (song.tracks.length >= MAX_TRACKS) return null;
  const src = song.tracks[index];
  const t: Track = { ...clone(src), id: newId(song), color: freeColor(song), solo: false };
  song.tracks.splice(index + 1, 0, t);
  return t;
}

export function deleteTrack(song: Song, index: number) {
  song.tracks.splice(index, 1);
}

export function changeInstrument(track: Track, kind: InstrumentKind, preset = 0) {
  const def = INSTRUMENTS[kind];
  track.kind = kind;
  track.name = def.name;
  track.preset = def.presets[preset % def.presets.length].name;
  track.params = presetParams(kind, preset);
}

export function loadPreset(track: Track, index: number) {
  const def = INSTRUMENTS[track.kind];
  const i = ((index % def.presets.length) + def.presets.length) % def.presets.length;
  track.params = presetParams(track.kind, i);
  track.preset = def.presets[i].name;
}

export function presetIndex(track: Track): number {
  return Math.max(0, INSTRUMENTS[track.kind].presets.findIndex((p) => p.name === track.preset));
}

function blankScene(song: Song, name?: string): Scene {
  return { id: newId(song), name: name ?? `Scene ${song.scenes.length + 1}`, repeat: 1, tempo: null, fadeIn: false, fadeOut: false };
}

export function addScene(song: Song): Scene | null {
  return insertBlankScene(song, song.scenes.length - 1);
}

export function insertBlankScene(song: Song, afterIndex: number): Scene | null {
  if (song.scenes.length >= MAX_SCENES) return null;
  const s = blankScene(song);
  song.scenes.splice(afterIndex + 1, 0, s);
  return s;
}

export function duplicateScene(song: Song, index: number): Scene | null {
  if (song.scenes.length >= MAX_SCENES) return null;
  const src = song.scenes[index];
  const s: Scene = { ...clone(src), id: newId(song), name: src.name.replace(/( copy)?$/, " copy") };
  for (const t of song.tracks) if (t.clips[src.id]) t.clips[s.id] = clone(t.clips[src.id]);
  song.scenes.splice(index + 1, 0, s);
  return s;
}

export function deleteScene(song: Song, index: number) {
  if (song.scenes.length <= 1) return;
  const [s] = song.scenes.splice(index, 1);
  for (const t of song.tracks) delete t.clips[s.id];
}

/** The clip in a cell, created (as long as the scene) if the cell is empty. */
export function ensureClip(song: Song, track: Track, sceneId: number): Clip {
  let c = track.clips[sceneId];
  if (!c) {
    c = emptyClip(Math.max(1, sceneTicks(song, sceneId) / TICKS_PER_BAR));
    track.clips[sceneId] = c;
  }
  return c;
}

/** Double the clip: length x2 and the notes copied into the new half. */
export function duplicateClip(song: Song, clip: Clip): boolean {
  if (clip.bars * 2 > MAX_BARS) return false;
  const shift = clip.bars * TICKS_PER_BAR;
  clip.notes.push(...clip.notes.map((n) => ({ ...n, id: newId(song), start: n.start + shift })));
  for (const k in clip.auto ?? {}) clip.auto![k].push(...clip.auto![k].map((p) => ({ tick: p.tick + shift, v: p.v })));
  clip.bars *= 2;
  return true;
}

export function setClipBars(clip: Clip, bars: number) {
  clip.bars = Math.max(1, Math.min(MAX_BARS, bars));
  const end = clip.bars * TICKS_PER_BAR;
  clip.notes = clip.notes.filter((n) => n.start < end);
  for (const k in clip.auto ?? {}) clip.auto![k] = clip.auto![k].filter((p) => p.tick < end);
  for (const n of clip.notes) n.len = Math.min(n.len, end - n.start + TICKS_PER_BAR); // may hang over into the loop, like a held note
}

export function addNote(song: Song, clip: Clip, n: Omit<Note, "id">): Note {
  // Same pitch starting at the same tick replaces the old note.
  clip.notes = clip.notes.filter((x) => !(x.pitch === n.pitch && x.start === n.start));
  const note = { ...n, id: newId(song) };
  clip.notes.push(note);
  clip.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return note;
}

export function noteAt(clip: Clip, tick: number, pitch: number): Note | undefined {
  // Latest-starting note wins when several cover the tick.
  let best: Note | undefined;
  for (const n of clip.notes) {
    if (n.pitch === pitch && tick >= n.start && tick < n.start + n.len && (!best || n.start > best.start)) best = n;
  }
  return best;
}

/**
 * The Quantize button: snap note STARTS to the grid (lengths are left alone).
 * A note that rounds to the clip end wraps to beat 1; notes that end up on top
 * of an identical note are removed. Returns how many notes moved.
 */
export function quantizeClip(clip: Clip, notes: Note[], grid: number): number {
  const ticks = clip.bars * TICKS_PER_BAR;
  let moved = 0;
  for (const n of notes) {
    const s = (Math.round(n.start / grid) * grid) % ticks;
    if (s !== n.start) { n.start = s; moved++; }
  }
  const seen = new Set<string>();
  clip.notes = clip.notes.filter((n) => {
    const k = `${n.pitch}:${n.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  clip.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return moved;
}

/** Quantize start and length (used on notes as they are recorded). */
export function quantizeNotes(notes: Note[], grid: number) {
  for (const n of notes) {
    n.start = Math.round(n.start / grid) * grid;
    n.len = Math.max(grid, Math.round(n.len / grid) * grid);
  }
}

export function sceneIndexById(song: Song, id: number): number {
  return song.scenes.findIndex((s) => s.id === id);
}

// ---------------------------------------------------------------- automation

/** Lane value (0..1) at a tick: linear between points, held before the first and after the last. */
export function laneValue(points: AutoPoint[], tick: number): number {
  if (!points.length) return 0;
  if (tick <= points[0].tick) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (tick <= b.tick) {
      const a = points[i - 1];
      return b.tick === a.tick ? b.v : a.v + ((b.v - a.v) * (tick - a.tick)) / (b.tick - a.tick);
    }
  }
  return points[points.length - 1].v;
}

/** Write a point, replacing any point at the same tick; keeps the lane sorted. */
export function setAutoPoint(clip: Clip, key: string, tick: number, v: number) {
  clip.auto ??= {};
  const lane = (clip.auto[key] ??= []);
  const i = lane.findIndex((p) => p.tick === tick);
  const pt = { tick, v: Math.max(0, Math.min(1, v)) };
  if (i >= 0) lane[i] = pt; else lane.push(pt);
  lane.sort((a, b) => a.tick - b.tick);
}

/** Remove points in (from, to] — used while recording knob moves over an existing lane. */
export function clearAutoRange(clip: Clip, key: string, from: number, to: number) {
  const lane = clip.auto?.[key];
  if (!lane) return;
  clip.auto![key] = from <= to ? lane.filter((p) => p.tick <= from || p.tick > to) : lane.filter((p) => p.tick > to && p.tick <= from);
}
