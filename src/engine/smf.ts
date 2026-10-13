// Standard MIDI File export and import.

import { DRUM_BASE_NOTE, INSTRUMENTS, KIT_SAMPLES, drumCount } from "./instruments";
import { PPQ, TICKS_PER_BAR, newSong, type InstrumentKind, type Song, type Track } from "./model";
import { addNote, addTrack, ensureClip } from "./songops";
import { expandPitch, firstInstance, nextInstance, swingTicks, type PlayMode } from "./timeline";

// General MIDI drum notes for our drum sounds, so the file drops onto any drum rack.
const GM_BY_SAMPLE: Record<string, number> = {
  "kick-deep": 36, "kick-punch": 36, "kick-boom": 35, "snare-crack": 38, "snare-body": 40, clap: 39, rim: 37,
  "hat-closed": 42, "hat-open": 46, "hat-pedal": 44, "tom-low": 45, "tom-high": 48, cowbell: 56, shaker: 70, crash: 49, zap: 81,
};
const GM_ANALOG = [36, 38, 45, 56];

function gmDrum(track: Track, pitch: number): number {
  const part = pitch - DRUM_BASE_NOTE;
  if (track.kind === "analog") return GM_ANALOG[part] ?? pitch;
  const smp = KIT_SAMPLES[Math.round(track.params[`p${part}smp`] ?? 0)];
  return GM_BY_SAMPLE[smp] ?? pitch;
}

// ------------------------------------------------------------ export

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [...[...type].map((c) => c.charCodeAt(0)), (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...data];
}

function trackChunk(events: { tick: number; bytes: number[] }[]): number[] {
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0)); // offs (0x80) before ons (0x90)
  const data: number[] = [];
  let last = 0;
  for (const e of events) { data.push(...vlq(Math.max(0, e.tick - last)), ...e.bytes); last = e.tick; }
  data.push(0, 0xff, 0x2f, 0);
  return chunk("MTrk", data);
}

const text = (s: string) => [...new TextEncoder().encode(s)];

/** The whole song once, top to bottom (repeats and scene tempos included), as a type-1 MIDI file. */
export function exportMidi(song: Song): Uint8Array<ArrayBuffer> {
  const mode: PlayMode = { kind: "song", fromIndex: 0 };
  const once = { ...song, songLoop: false };
  const tempoEv: { tick: number; bytes: number[] }[] = [{ tick: 0, bytes: [0xff, 0x03, ...vlq(song.title.length), ...text(song.title)] }];
  const perTrack = new Map<number, { tick: number; bytes: number[] }[]>(song.tracks.map((t) => [t.id, []]));
  let inst = firstInstance(once, mode, 0);
  let offset = 0, lastBpm = -1, guard = 0;
  while (inst && guard++ < 2000) {
    const bpm = Math.round(60 / (inst.secPerTick * PPQ));
    if (bpm !== lastBpm) {
      const us = Math.round(60000000 / bpm);
      tempoEv.push({ tick: offset, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
      lastBpm = bpm;
    }
    song.tracks.forEach((t, ti) => {
      const clip = t.clips[inst!.sceneId];
      if (!clip || clip.muted) return;
      const ch = INSTRUMENTS[t.kind].drumParts ? 9 : [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][ti % 15];
      const clipTicks = clip.bars * TICKS_PER_BAR;
      const tr = INSTRUMENTS[t.kind].drumParts ? 0 : song.scenes.find((x) => x.id === inst!.sceneId)?.transpose ?? 0;
      for (let k = 0; k * clipTicks < inst!.ticks; k++) {
        for (const n of clip.notes) {
          const start = k * clipTicks + swingTicks(n.start, song.swing);
          if (start >= inst!.ticks) continue;
          const end = Math.min(k * clipTicks + n.start + n.len, inst!.ticks);
          const pitches = INSTRUMENTS[t.kind].drumParts ? [gmDrum(t, n.pitch)] : expandPitch(song, t, n.pitch).map((p) => p + tr);
          for (const p of pitches) {
            perTrack.get(t.id)!.push({ tick: offset + start, bytes: [0x90 | ch, p & 127, Math.max(1, n.vel)] });
            perTrack.get(t.id)!.push({ tick: offset + Math.max(start + 1, end), bytes: [0x80 | ch, p & 127, 0] });
          }
        }
      }
    });
    offset += inst.ticks;
    inst = nextInstance(once, mode, inst);
  }
  const bytes = [
    ...chunk("MThd", [0, 1, 0, song.tracks.length + 1, (PPQ >> 8) & 255, PPQ & 255]),
    ...trackChunk(tempoEv),
    ...song.tracks.flatMap((t, i) => {
      const name = `${i + 1} ${INSTRUMENTS[t.kind].name} - ${t.preset}`;
      return trackChunk([{ tick: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...text(name)] }, ...perTrack.get(t.id)!]);
    }),
  ];
  return new Uint8Array(bytes);
}

// ------------------------------------------------------------ import

interface RawNote { ch: number; pitch: number; vel: number; start: number; end: number }

/** Parse a MIDI file into a new song: one track per part, scenes of 8 bars, key guessed from the notes. */
export function importMidi(buf: ArrayBuffer, title = "Imported"): Song {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  if (str(4) !== "MThd") throw new Error("Not a MIDI file");
  const hlen = d.getUint32(p); p += 4;
  const ntrk = d.getUint16(p + 2), division = d.getUint16(p + 4);
  p += hlen;
  if (division & 0x8000) throw new Error("SMPTE-timed MIDI files aren't supported");
  const scale = PPQ / division;
  let tempo = 120;
  const parts = new Map<string, { name: string; notes: RawNote[] }>();
  for (let t = 0; t < ntrk && p < d.byteLength; t++) {
    if (str(4) !== "MTrk") throw new Error("Broken MIDI file");
    const len = d.getUint32(p); p += 4;
    const end = p + len;
    let tick = 0, status = 0, name = "";
    const open = new Map<string, { start: number; vel: number }>();
    const readVlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (p < end) {
      tick += readVlq();
      let b = d.getUint8(p);
      // Running status applies to channel messages only.
      if (b & 0x80) { p++; if (b < 0xf0) status = b; } else b = status;
      const statusNow = b;
      const type = statusNow & 0xf0, ch = statusNow & 0x0f;
      if (statusNow === 0xff) {
        const meta = d.getUint8(p++), l = readVlq();
        if (meta === 0x51 && tempo === 120) tempo = Math.round(60000000 / ((d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)));
        if (meta === 0x03) { const s0 = p; name = ""; for (let i = 0; i < l; i++) name += String.fromCharCode(d.getUint8(s0 + i)); }
        p += l;
      } else if (statusNow === 0xf0 || statusNow === 0xf7) { p += readVlq(); }
      else if (type === 0x90 || type === 0x80) {
        const pitch = d.getUint8(p++), vel = d.getUint8(p++);
        const key = `${ch}:${pitch}`;
        const partKey = `${t}:${ch}`;
        if (type === 0x90 && vel > 0) open.set(key, { start: tick, vel });
        else {
          const o = open.get(key);
          if (o) {
            open.delete(key);
            if (!parts.has(partKey)) parts.set(partKey, { name, notes: [] });
            parts.get(partKey)!.notes.push({ ch, pitch, vel: o.vel, start: Math.round(o.start * scale), end: Math.round(tick * scale) });
          }
        }
      } else if (type === 0xc0 || type === 0xd0) p += 1;
      else p += 2;
    }
    for (const part of parts.values()) if (!part.name) part.name = name;
    p = end;
  }

  const song = newSong();
  song.title = title.slice(0, 40);
  song.tempo = Math.max(40, Math.min(250, tempo));
  const all = [...parts.values()].flatMap((x) => x.notes).filter((n) => n.ch !== 9);
  Object.assign(song, guessKey(all.map((n) => n.pitch)));
  const lastTick = Math.max(TICKS_PER_BAR, ...[...parts.values()].flatMap((x) => x.notes.map((n) => n.end)));
  const sceneTicks = 8 * TICKS_PER_BAR;
  const nScenes = Math.min(32, Math.ceil(lastTick / sceneTicks));
  while (song.scenes.length < nScenes) song.scenes.push({ id: song.nextId++, name: `Part ${song.scenes.length + 1}`, repeat: 1, tempo: null, fadeIn: false, fadeOut: false });
  for (const part of [...parts.values()].slice(0, 8)) {
    if (!part.notes.length) continue;
    const drums = part.notes[0].ch === 9;
    const avg = part.notes.reduce((a, n) => a + n.pitch, 0) / part.notes.length;
    const top = Math.max(...part.notes.map((n) => n.pitch));
    const kind: InstrumentKind = drums ? "drums" : avg < 53 || top < 60 ? "acid" : "poly";
    const track = addTrack(song, kind, 0);
    if (!track) break;
    if (kind === "acid") track.params.arpOn = 0;
    if (kind === "poly") track.params.chord = 0;
    for (const n of part.notes) {
      const si = Math.floor(n.start / sceneTicks);
      if (si >= song.scenes.length) continue;
      const clip = ensureClip(song, track, song.scenes[si].id);
      clip.bars = 8;
      const pitch = drums ? fromGm(n.pitch) : n.pitch;
      addNote(song, clip, { pitch, start: n.start - si * sceneTicks, len: Math.max(6, n.end - n.start), vel: Math.max(1, n.vel) });
    }
  }
  return song;
}

/** Nearest Kitbox pad for a General MIDI drum note. */
function fromGm(gm: number): number {
  const map: Record<number, number> = { 35: 0, 36: 0, 38: 1, 40: 1, 39: 2, 42: 3, 44: 3, 46: 4, 41: 5, 43: 5, 45: 5, 47: 5, 48: 5, 50: 5, 37: 6, 56: 7, 70: 7, 49: 4, 51: 4 };
  return DRUM_BASE_NOTE + (map[gm] ?? Math.abs(gm) % drumCount("drums"));
}

/** Krumhansl-style key guess: best match of the pitch-class histogram against major and minor. */
export function guessKey(pitches: number[]): { key: number; scale: string } {
  if (!pitches.length) return { key: 0, scale: "minor" };
  const hist = new Array(12).fill(0);
  for (const p of pitches) hist[((p % 12) + 12) % 12]++;
  const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  let best = { key: 0, scale: "minor", score: -Infinity };
  for (let k = 0; k < 12; k++) {
    for (const [name, prof] of [["major", major], ["minor", minor]] as const) {
      let s = 0;
      for (let i = 0; i < 12; i++) s += hist[(i + k) % 12] * prof[i];
      if (s > best.score) best = { key: k, scale: name, score: s };
    }
  }
  return { key: best.key, scale: best.scale };
}
