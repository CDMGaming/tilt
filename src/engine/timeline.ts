// Turns a song into timed note events. Pure: no audio, no DOM. Used by both
// the real-time scheduler (in small look-ahead windows) and the offline
// WAV renderer (whole song at once).

import { PPQ, TICKS_PER_BAR, sceneTempo, sceneTicks, songChain, type Scene, type Song, type Track } from "./model";
import { scaleChord } from "./music";
import { INSTRUMENTS, fromUnit } from "./instruments";
import { getParam, paramInfo } from "./params";
import { laneValue } from "./songops";

/** Automation lanes are sampled every 64th note; the worklet smooths between steps. */
export const AUTO_STEP = PPQ / 16;

/** `once`: play the scene one time and stop (otherwise it loops). */
export type PlayMode = { kind: "scene"; sceneId: number; once?: boolean } | { kind: "song"; fromIndex: number };

export interface SceneInstance {
  sceneId: number;
  index: number; // SONG mode: the step in the chain; SCENE mode: the scene's row
  repeat: number; // 0-based repeat number
  repeats: number;
  startTime: number; // seconds (context time)
  ticks: number;
  secPerTick: number;
  fadeIn: boolean; // fade over this instance (first repeat of a fade-in scene)
  fadeOut: boolean; // fade over this instance (last repeat of a fade-out scene)
}

export interface NoteEvent {
  time: number;
  trackId: number;
  type: "on" | "off" | "param";
  pitch: number;
  vel: number;
  key?: string; // "param" events: which parameter
  value?: number; // "param" events: raw parameter value
}

export function secPerTick(bpm: number): number {
  return 60 / (bpm * PPQ);
}

function makeInstance(song: Song, sc: Scene, index: number, repeat: number, repeats: number, startTime: number): SceneInstance {
  repeats = Math.max(1, repeats);
  return {
    sceneId: sc.id,
    index,
    repeat,
    repeats,
    startTime,
    ticks: sceneTicks(song, sc.id),
    secPerTick: secPerTick(sceneTempo(song, sc)),
    fadeIn: sc.fadeIn && repeat === 0,
    fadeOut: sc.fadeOut && repeat === repeats - 1,
  };
}

export function firstInstance(song: Song, mode: PlayMode, startTime: number): SceneInstance | null {
  if (!song.scenes.length) return null;
  if (mode.kind === "scene") {
    const i = song.scenes.findIndex((s) => s.id === mode.sceneId);
    if (i < 0) return null;
    // A looped scene ignores repeat count and fades.
    return { ...makeInstance(song, song.scenes[i], i, 0, 1, startTime), fadeIn: false, fadeOut: false };
  }
  return chainInstance(song, Math.max(0, mode.fromIndex), 0, startTime);
}

/** Step `k` of the song chain, repeat `repeat`, or null past the end. */
function chainInstance(song: Song, k: number, repeat: number, startTime: number): SceneInstance | null {
  const chain = songChain(song), step = chain[Math.min(k, chain.length - 1)];
  const sc = step && song.scenes.find((s) => s.id === step.sceneId);
  return sc ? makeInstance(song, sc, Math.min(k, chain.length - 1), repeat, step.repeat, startTime) : null;
}

/** The instance that follows `prev`, or null when the song ends. */
export function nextInstance(song: Song, mode: PlayMode, prev: SceneInstance): SceneInstance | null {
  const end = prev.startTime + prev.ticks * prev.secPerTick;
  if (mode.kind === "scene") return mode.once ? null : firstInstance(song, mode, end);
  // The chain may have been edited while playing: if the step moved, find the scene again.
  const chain = songChain(song);
  let k = prev.index;
  if (chain[k]?.sceneId !== prev.sceneId) { const f = chain.findIndex((x) => x.sceneId === prev.sceneId); k = f >= 0 ? f : Math.min(prev.index, chain.length - 1); }
  const step = chain[k];
  if (step && step.sceneId === prev.sceneId && prev.repeat + 1 < Math.max(1, step.repeat)) return chainInstance(song, k, prev.repeat + 1, end);
  if (k + 1 < chain.length) return chainInstance(song, k + 1, 0, end);
  if (song.songLoop) return chainInstance(song, 0, 0, end);
  return null;
}

/** Swing pushes every second 16th later; 100 = a hard shuffle a bit past triplet feel. */
export function swingTicks(tick: number, swing: number): number {
  const sixteenth = PPQ / 4;
  return tick % (sixteenth * 2) === sixteenth ? tick + Math.round((swing / 100) * sixteenth * 0.6) : tick;
}

/** Chord expansion for the poly synth's chord mode (also used for live input). */
export function expandPitch(song: Song, track: Track, pitch: number): number[] {
  if (track.kind !== "poly") return [pitch];
  const mode = Math.round(track.params.chord ?? 0);
  if (!mode) return [pitch];
  const chord = scaleChord(pitch, song.key, song.scale, mode === 2 ? 4 : 3);
  // Voicing: close; open (the 3rd up an octave); spread (the root down, the 3rd and 7th up).
  const voicing = track.params.voicing ?? 0.2;
  if (chord.length >= 3 && voicing >= 1 / 3) chord[1] += 12;
  if (chord.length >= 3 && voicing >= 2 / 3) { chord[0] -= 12; if (chord[3] !== undefined) chord[3] += 12; }
  return chord.sort((a, b) => a - b);
}

/** All note events of `inst` that start in [t0, t1). */
export function eventsInWindow(song: Song, inst: SceneInstance, t0: number, t1: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  const instEnd = inst.startTime + inst.ticks * inst.secPerTick;
  if (t1 <= inst.startTime || t0 >= instEnd) return out;
  for (const track of song.tracks) {
    const clip = track.clips[inst.sceneId];
    if (!clip || clip.muted || !clip.notes.length) continue;
    const clipTicks = clip.bars * PPQ * 4;
    const loops = Math.ceil(inst.ticks / clipTicks);
    const tr = INSTRUMENTS[track.kind].drumParts ? 0 : song.scenes.find((s) => s.id === inst.sceneId)?.transpose ?? 0;
    for (let k = 0; k < loops; k++) {
      for (const n of clip.notes) {
        const startTick = k * clipTicks + swingTicks(n.start, song.swing);
        if (startTick >= inst.ticks) continue;
        const time = inst.startTime + startTick * inst.secPerTick;
        if (time < t0 || time >= t1) continue;
        const endTick = Math.min(k * clipTicks + n.start + n.len, inst.ticks);
        const offTime = inst.startTime + endTick * inst.secPerTick - 0.0005;
        for (const p0 of expandPitch(song, track, n.pitch)) {
          const p = p0 + tr;
          out.push({ time, trackId: track.id, type: "on", pitch: p, vel: n.vel });
          out.push({ time: Math.max(time + 0.001, offTime), trackId: track.id, type: "off", pitch: p, vel: 0 });
        }
      }
    }
  }
  automationInWindow(song, inst, t0, t1, out);
  return out;
}

/**
 * Automation as "param" events. A param that this clip doesn't automate, but
 * another clip on the track does, is reset to its knob value when the scene starts.
 */
function automationInWindow(song: Song, inst: SceneInstance, t0: number, t1: number, out: NoteEvent[]) {
  const startsHere = inst.startTime >= t0 && inst.startTime < t1;
  for (const track of song.tracks) {
    const clip = track.clips[inst.sceneId];
    const lanes = clip && !clip.muted ? clip.auto ?? {} : {};
    if (startsHere) {
      const automated = new Set<string>();
      for (const c of Object.values(track.clips)) for (const k in c.auto ?? {}) if (c.auto![k].length) automated.add(k);
      for (const k of automated) {
        if (lanes[k]?.length) continue;
        out.push({ time: inst.startTime, trackId: track.id, type: "param", pitch: 0, vel: 0, key: k, value: getParam(track, k) });
      }
    }
    if (!clip) continue;
    const clipTicks = clip.bars * PPQ * 4;
    for (const key in lanes) {
      const lane = lanes[key];
      const def = paramInfo(track, key);
      if (!lane.length || !def) continue;
      // Ticks of this instance inside [t0, t1), on the AUTO_STEP grid.
      const first = Math.max(0, Math.ceil((t0 - inst.startTime) / inst.secPerTick / AUTO_STEP) * AUTO_STEP);
      const last = Math.min(inst.ticks, (t1 - inst.startTime) / inst.secPerTick);
      for (let tick = first; tick < last; tick += AUTO_STEP) {
        const time = inst.startTime + tick * inst.secPerTick;
        if (time < t0 || time >= t1) continue;
        out.push({ time, trackId: track.id, type: "param", pitch: 0, vel: 0, key, value: fromUnit(def, laneValue(lane, tick % clipTicks)) });
      }
    }
  }
}

/** Whole-song event list and duration, for offline rendering. Plays the song once, no loop. */
export function wholeSong(song: Song): { events: NoteEvent[]; duration: number; instances: SceneInstance[] } {
  const once = { ...song, songLoop: false };
  const mode: PlayMode = { kind: "song", fromIndex: 0 };
  const events: NoteEvent[] = [];
  const instances: SceneInstance[] = [];
  let inst = firstInstance(once, mode, 0);
  let guard = 0;
  while (inst && guard++ < 2000) {
    instances.push(inst);
    events.push(...eventsInWindow(once, inst, inst.startTime, inst.startTime + inst.ticks * inst.secPerTick));
    inst = nextInstance(once, mode, inst);
  }
  const last = instances[instances.length - 1];
  const duration = last ? last.startTime + last.ticks * last.secPerTick : 0;
  return { events, duration, instances };
}

/** Where a scene `ticks` long, now at `tick`, should end to change at the next bar line. */
export function barCut(ticks: number, tick: number): number {
  const end = Math.ceil(tick / TICKS_PER_BAR - 1e-9) * TICKS_PER_BAR;
  return end > 0 && end < ticks ? end : ticks;
}
