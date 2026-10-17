// A template + the jam's choices -> a TILT song: one scene per section, one track per part, clips
// written from the riff pools over each section's chord progression, the chain following the
// template's form. Rebuilding keeps track and scene ids, so the engine just picks up the changes.

import { INSTRUMENTS, presetParams } from "../engine/instruments";
import { PPQ, TICKS_PER_BAR, defaultMaster, emptyFx, newId, type Note, type Song, type Track } from "../engine/model";
import { scaleById, scaleChord, snapToScale, inScale } from "../engine/music";
import { ROLE_MACROS, applyMacros, stepOf } from "./macros";
import { DRUM_VOICES, SECTIONS, SECTION_NAMES, type Groove, type PartSpec, type Section, type Template } from "./pack";

const STEP = PPQ / 4; // a 16th note

/** Everything the player has changed from the template's home. */
export interface JamState {
  key: number;
  scale: string;
  tempo: number;
  /** Progression choice per section (index into the template's pool). */
  prog: Partial<Record<Section, number>>;
  /** Pool choice per part. */
  pick: number[];
  /** Knob positions per part (in ROLE_MACROS order). */
  knobs: number[][];
  mute: boolean[];
}

export const homeKnobs = (p: PartSpec) => ROLE_MACROS[p.role].map((m) => p.home?.[m.id] ?? m.home);

/** The template as it comes: first key, scale and progressions, first pool entries, knobs at home. */
export function homeState(t: Template, key = t.keys[0], scale = t.scales[0], tempo = Math.round((t.tempo[0] + t.tempo[1]) / 2)): JamState {
  return { key, scale, tempo, prog: {}, pick: t.parts.map(() => 0), knobs: t.parts.map(homeKnobs), mute: t.parts.map(() => false) };
}

/** Sections that get a scene: the form's, and every live pad. */
export function sectionsOf(t: Template): Section[] {
  return SECTIONS.filter((s) => s === "intro" || s === "outro" ? t.form.some((f) => f.s === s) : true);
}

export const LAST_CHORUS = "Last chorus";
export const sceneName = (s: Section) => SECTION_NAMES[s];

/** The progression a section plays (sections without their own borrow a sensible neighbour's). */
export function progressionOf(t: Template, st: JamState, s: Section): number[] {
  const fallback: Record<Section, Section[]> = {
    intro: ["intro", "chorus", "verse"], verse: ["verse"], chorus: ["chorus", "verse"], bridge: ["bridge", "verse"],
    solo: ["solo", "chorus", "verse"], breakdown: ["breakdown", "bridge", "verse"], outro: ["outro", "chorus", "verse"],
  };
  for (const k of fallback[s]) {
    const pool = t.progressions[k];
    if (pool?.length) return pool[(st.prog[k] ?? 0) % pool.length];
  }
  return [1, 4, 5, 1];
}

/** Build the whole song from scratch. */
export function buildSong(t: Template, st: JamState): Song {
  const song: Song = {
    version: 1, title: `${t.name} jam`, tempo: st.tempo, swing: 0, key: st.key, scale: st.scale,
    songLoop: true, sceneLoop: true, metronome: false, tracks: [], scenes: [], master: { ...defaultMaster(), limiter: true, limitDepth: 0.45, reverb: true, reverbTime: 0.5 },
    nextId: 1,
  };
  for (const s of sectionsOf(t)) song.scenes.push({ id: newId(song), name: sceneName(s), repeat: 1, tempo: null, fadeIn: false, fadeOut: s === "outro" });
  if (t.moves.lastChorusUp) song.scenes.push({ id: newId(song), name: LAST_CHORUS, repeat: 1, tempo: null, fadeIn: false, fadeOut: false, transpose: t.moves.lastChorusUp });
  t.parts.forEach((p) => {
    const def = INSTRUMENTS[p.kind];
    const pi = Math.max(0, def.presets.findIndex((x) => x.name === p.preset));
    const track: Track = {
      id: newId(song), name: p.name, kind: p.kind, preset: def.presets[pi]?.name ?? p.preset, params: {},
      volume: 0.8, pan: p.mix?.pan ?? 0, send: 0.12, fx: emptyFx(), mute: false, solo: false, clips: {}, color: 0,
    };
    song.tracks.push(track);
  });
  song.chain = chainOf(t, song);
  updateSong(t, st, song);
  return song;
}

/** The song's chain from the template's form (the last chorus may be the key-change scene). */
function chainOf(t: Template, song: Song) {
  const lastChorus = t.form.map((f) => f.s).lastIndexOf("chorus");
  return t.form.map((f, i) => {
    const name = i === lastChorus && t.moves.lastChorusUp ? LAST_CHORUS : sceneName(f.s);
    return { sceneId: song.scenes.find((x) => x.name === name)!.id, repeat: f.repeat ?? 1 };
  });
}

export const sceneOf = (song: Song, s: Section | typeof LAST_CHORUS) => song.scenes.find((x) => x.name === (s === LAST_CHORUS ? LAST_CHORUS : sceneName(s as Section)));
export const sectionOfScene = (song: Song, sceneId: number): Section | null => {
  const sc = song.scenes.find((x) => x.id === sceneId);
  if (!sc) return null;
  if (sc.name === LAST_CHORUS) return "chorus";
  return SECTIONS.find((s) => SECTION_NAMES[s] === sc.name) ?? null;
};

/** Apply the state to the song in place: key / scale / tempo, every part's sound and every clip. */
export function updateSong(t: Template, st: JamState, song: Song, only?: number) {
  song.key = st.key;
  song.scale = st.scale;
  song.tempo = st.tempo;
  t.parts.forEach((p, i) => {
    if (only !== undefined && only !== i) return;
    updateSound(t, st, song, i);
    writeClips(t, st, song, i);
  });
}

/** A part's sound from its preset, the template's tweaks and its knobs. */
export function updateSound(t: Template, st: JamState, song: Song, i: number) {
  const p = t.parts[i], track = song.tracks[i];
  const def = INSTRUMENTS[p.kind];
  const pi = Math.max(0, def.presets.findIndex((x) => x.name === p.preset));
  const base = { ...presetParams(p.kind, pi), ...(p.params ?? {}) };
  applyMacros(track, p.role, base, st.knobs[i], { vol: p.mix?.vol ?? 0.8, send: p.mix?.send ?? 0.12, pan: p.mix?.pan ?? 0 });
  track.mute = st.mute[i];
}

/** The knob value of a macro on a part (by id), or its home. */
function knob(t: Template, st: JamState, i: number, id: string): number {
  const ms = ROLE_MACROS[t.parts[i].role], k = ms.findIndex((m) => m.id === id);
  return k < 0 ? 0.5 : st.knobs[i][k];
}

/** The drums' Feel knob: swing for the whole band (0..1 of a 16th's lateness for the off-16ths). */
function swingOf(t: Template, st: JamState): number {
  const d = t.parts.findIndex((p) => p.role === "drums");
  return d < 0 ? (t.swing ?? 0) / 100 : knob(t, st, d, "feel") * 0.62;
}

function writeClips(t: Template, st: JamState, song: Song, i: number) {
  const p = t.parts[i], track = song.tracks[i];
  const entry = p.pool[st.pick[i] % p.pool.length];
  for (const sc of song.scenes) {
    const s = sectionOfScene(song, sc.id)!;
    const prog = progressionOf(t, st, s);
    const bars = Math.max(1, Math.min(8, prog.length));
    let notes: Omit<Note, "id">[] = [];
    if (!p.rests?.includes(s)) {
      const src = entry.by[s] ?? entry.by.any ?? Object.values(entry.by)[0];
      notes = p.role === "drums" ? drumNotes(t, st, i, src as Groove, bars, s, entry.by.fill as Groove | undefined) : pitchedNotes(t, st, i, String(src ?? ""), prog, s, song);
    }
    const sw = swingOf(t, st);
    let nid = 1;
    track.clips[sc.id] = {
      bars, muted: false,
      notes: notes.map((n) => ({ ...n, id: nid++, start: swung(n.start, sw) })),
    };
  }
}

/** Off-16ths come late by the swing (a shuffle at high settings). */
function swung(tick: number, sw: number): number {
  const step = Math.round(tick / STEP);
  return step % 2 === 1 && tick % STEP === 0 ? tick + Math.round(sw * STEP * 0.66) : tick;
}

// ---------------------------------------------------------------- drums

function drumNotes(t: Template, st: JamState, i: number, g: Groove, bars: number, s: Section, fill?: Groove): Omit<Note, "id">[] {
  const energy = knob(t, st, i, "energy");
  const half = t.moves.halfTimeBridge && (s === "bridge" || s === "breakdown") && !t.parts[i].pool[st.pick[i] % t.parts[i].pool.length].by[s];
  const out: Omit<Note, "id">[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const useFill = fill && bars >= 2 && bar === bars - 1 && s !== "outro";
    const groove = useFill ? fill! : g;
    DRUM_VOICES.forEach((voice, part) => {
      let row = groove[voice];
      if (!row) return;
      if (half && !useFill) row = halfTime(voice, row);
      const len = row.length >= 32 ? 32 : 16, off = (bar % (len / 16)) * 16;
      for (let k = 0; k < 16; k++) {
        const c = row[off + k];
        if (!c || c === ".") continue;
        if (c === "o" && energy < 0.35) continue; // no ghost notes when it's soft
        if (voice === "hat" && energy < 0.2 && k % 2 === 1) continue; // sparse hats
        const base = c === "X" ? 118 : c === "o" ? 46 : 96;
        const vel = Math.max(1, Math.min(127, Math.round(base * (0.72 + energy * 0.45))));
        out.push({ pitch: 36 + part, start: bar * TICKS_PER_BAR + k * STEP, len: STEP, vel });
      }
    });
    // Big energy: a crash on the first beat of the section.
    if (bar === 0 && energy > 0.75 && !g.crash?.startsWith("X") && !g.crash?.startsWith("x") && s !== "verse" && s !== "breakdown") {
      out.push({ pitch: 36 + DRUM_VOICES.indexOf("crash"), start: 0, len: STEP, vel: 112 });
    }
  }
  return out;
}

/** Half time: the snare on beat 3 only, the kick on beat 1 (and its pickups), the rest as it was. */
function halfTime(voice: string, row: string): string {
  const r = row.slice(0, 16);
  if (voice === "snare") return "........X.......";
  if (voice === "kick") return "X.........x.....";
  return r;
}

// ---------------------------------------------------------------- pitched parts

/** Semitones above the chord root for a riff digit, picked to stay in the scale. */
const DIGIT: Record<string, number[]> = { "1": [0], "2": [2, 1], "3": [4, 3], "4": [5, 6], "5": [7, 6, 8], "6": [9, 8], "7": [10, 11], "8": [12], "9": [14, 13] };

function rootPitch(key: number, scale: string, degree: number, center: number): number {
  const steps = scaleById(scale).steps, n = steps.length;
  const d = ((degree - 1) % n + n) % n;
  let r = key + steps[d];
  while (r < center - 6) r += 12;
  while (r > center + 5) r -= 12;
  return r;
}

function inKey(p: number, st: JamState): number {
  return inScale(p, st.key, st.scale) ? p : snapToScale(p, st.key, st.scale);
}

/** A digit's pitch over this chord root, in the scale. */
function digitPitch(root: number, d: string, st: JamState): number {
  for (const iv of DIGIT[d] ?? [0]) if (inScale(root + iv, st.key, st.scale)) return root + iv;
  return inKey(root + (DIGIT[d]?.[0] ?? 0), st);
}

/** The chord as the part plays it: a power chord (guitar), a triad around the part's middle (keys). */
function chordPitches(role: string, root: number, center: number, st: JamState, full: boolean, mute: boolean): number[] {
  const fifth = digitPitch(root, "5", st);
  if (role === "guitar" || role === "bass") {
    if (mute) return [root, fifth];
    if (!full) return [root, fifth, root + 12];
    return [root, fifth, root + 12, digitPitch(root, "3", st) + 12, fifth + 12];
  }
  const tri = scaleChord(root, st.key, st.scale, 3);
  const notes = (full ? [...tri, tri[0] + 12] : tri).map((p) => { let q = p; while (q < center - 6) q += 12; while (q > center + 8) q -= 12; return q; });
  return [...new Set(notes)].sort((a, b) => a - b);
}

interface Hit { step: number; len: number; pitches: number[]; vel: number; prio: number }

function pitchedNotes(t: Template, st: JamState, i: number, riff: string, prog: number[], s: Section, song: Song): Omit<Note, "id">[] {
  const p = t.parts[i];
  if (!riff) return [];
  const riffBars = riff.length >= 32 ? 2 : 1, rl = riffBars * 16;
  let octave = 0;
  if (p.role === "bass") octave = [-12, 0, 12][stepOf(ROLE_MACROS.bass[2], knob(t, st, i, "octave"))];
  const center = p.center + octave;
  const hits: Hit[] = [];
  for (let bar = 0; bar < prog.length; bar++) {
    const root = rootPitch(st.key, st.scale, prog[bar], center);
    const off = (bar % riffBars) * 16;
    let down = false;
    for (let k = 0; k < 16; k++) {
      const c = riff[(off + k) % rl];
      if (c === "<") { down = true; continue; }
      if (c === "-" || c === "." || c === undefined) { if (c === "-" && hits.length && hits[hits.length - 1].step + hits[hits.length - 1].len === bar * 16 + k) hits[hits.length - 1].len++; continue; }
      const step = bar * 16 + k;
      const prio = k % 16 === 0 ? 4 : k % 8 === 0 ? 3 : k % 4 === 0 ? 2 : k % 2 === 0 ? 1 : 0;
      let pitches: number[] = [], vel = k % 4 === 0 ? 104 : 92;
      if (c === "x" || c === "X") { pitches = chordPitches(p.role, root, center, st, false, false); if (c === "X") vel = 118; }
      else if (c === "c") { pitches = chordPitches(p.role, root, center, st, true, false); vel = 104; }
      else if (c === "m") { pitches = p.role === "guitar" ? chordPitches(p.role, root, center, st, false, true) : [root]; vel = 44; }
      else if (c === "s") { pitches = [p.role === "guitar" ? root + 24 : digitPitch(root, "8", st)]; vel = 127; }
      else if (DIGIT[c]) { pitches = [digitPitch(root, c, st) - (down ? 12 : 0)]; }
      down = false;
      if (pitches.length) hits.push({ step, len: 1, pitches, vel, prio });
    }
  }
  return shape(t, st, i, hits, prog.length * 16, s, song).flatMap((h) => h.pitches.map((pitch) => ({
    pitch, start: h.step * STEP, len: Math.max(STEP / 2, h.len * STEP - (h.vel === 44 ? STEP / 2 : 4)), vel: h.vel,
  })));
}

/** The Riff / Follow knobs: thin the riff out (legato), play it as written, or double it up. */
function shape(t: Template, st: JamState, i: number, hits: Hit[], total: number, s: Section, song: Song): Hit[] {
  const p = t.parts[i];
  const u = p.role === "bass" ? knob(t, st, i, "follow") : p.role === "drums" ? 0.5 : knob(t, st, i, "riff");
  let out = hits;
  if (u < 0.45) {
    // Simpler: keep the strong beats, each held until the next one.
    const keep = u < 0.15 ? 4 : u < 0.3 ? 3 : 2;
    out = hits.filter((h) => h.prio >= keep || (h.step % 16 === 0));
    out.forEach((h, k) => { const next = out[k + 1]?.step ?? total; h.len = Math.max(h.len, Math.min(next - h.step, 16)); });
  } else if (u > 0.6) {
    // Busier: long notes re-struck in 8ths (16ths near the top) -- the chug.
    const every = u > 0.88 ? 1 : 2;
    out = hits.flatMap((h) => {
      if (h.len < every * 2 || h.vel === 127) return [h];
      const parts: Hit[] = [];
      for (let k = 0; k < h.len; k += every) parts.push({ ...h, step: h.step + k, len: every, vel: k ? Math.min(h.vel, 96) - (k % 4 ? 8 : 0) : h.vel });
      return parts;
    });
  }
  // Bass, Follow to the right: roots on every kick the bass isn't already playing.
  if (p.role === "bass" && u > 0.7) {
    const d = t.parts.findIndex((x) => x.role === "drums");
    if (d >= 0) {
      const dt = song.tracks[d], sc = song.scenes.find((x) => sectionOfScene(song, x.id) === s);
      const kicks = (sc && dt.clips[sc.id]?.notes.filter((n) => n.pitch === 36).map((n) => Math.round(n.start / STEP))) ?? [];
      const on = new Set(out.map((h) => h.step));
      for (const k of kicks) {
        if (on.has(k) || k >= total) continue;
        const prev = [...out].reverse().find((h) => h.step < k) ?? out[0];
        if (prev) out.push({ step: k, len: 1, pitches: [prev.pitches[0]], vel: 100, prio: 0 });
      }
      out.sort((a, b) => a.step - b.step);
    }
  }
  return out;
}
