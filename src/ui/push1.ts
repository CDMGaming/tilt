// Ableton Push (1st generation) as a TILT controller.
//
// Protocol facts (from Ableton's Push remote scripts, as documented in Chompfe's
// push1.js): SysEx header F0 47 7F 15; LCD line n = F0 47 7F 15 <18+n> 00 45 00
// <68 ASCII> F7; Live mode = header 62 00 01 00 F7; pads notes 36..99 ch 1
// (36 bottom-left); encoders CC 71..78 relative two's complement; tempo/swing/
// master encoders CC 14/15/79; upper button row CC 20..27, lower row CC 102..109;
// scene buttons CC 43 (top) .. 36; RGB pad colours: 5 red, 9 amber, 13 yellow,
// 17 lime, 21 green, 29 turquoise, 37 sky, 45 blue, 49 orchid, 53 magenta,
// 57 pink (+1/+2 dimmer), 1 dark, 2 grey, 3 white.

import { DRUM_BASE_NOTE, INSTRUMENTS, drumCount, drumPartName, formatParam, fromUnit, isDrumKind, paramDef, presetParams, toUnit } from "../engine/instruments";
import { XY_PARAMS } from "../engine/toolkit";
import { MAX_BARS, MAX_SCENES, TICKS_PER_BAR, type Scene, type Track } from "../engine/model";
import { NOTE_NAMES, inScale, scaleById } from "../engine/music";
import { getParam, paramInfo } from "../engine/params";
import { addNote, addScene, duplicateClip, duplicateScene, ensureClip, quantizeClip, setClipBars } from "../engine/songops";
import type { App } from "./app";
import { fmtTime } from "./dom";
import { trackColor } from "./theme";

const SYSEX = [0xf0, 0x47, 0x7f, 0x15];
const LIVE_MODE = [...SYSEX, 0x62, 0x00, 0x01, 0x00, 0xf7];
const LCD_W = 68;
const COLS = [0, 8, 17, 25, 34, 42, 51, 59, 68];

const BTN = {
  play: 85, record: 86, stop: 29, tap: 3, metronome: 9, undo: 119, del: 118, double: 117, quantize: 116,
  duplicate: 88, shift: 49, scale: 58, note: 50, session: 51, octDown: 54, octUp: 55,
  left: 44, right: 45, up: 46, down: 47, mute: 60, solo: 61, device: 110, volume: 114, panSend: 115,
  tempo: 14, swing: 15, master: 79,
};
const RGB = { off: 0, dark: 1, grey: 2, white: 3, green: 21, magenta: 53 };
const PAGES = ["Macros", "Mixer", "FX"] as const;
type Page = (typeof PAGES)[number];

export const isPush1Name = (n: string) => /ableton push/i.test(n) && !/push\s*2/i.test(n) && !/user port|midiin2|midiout2|push midi 2/i.test(n);

/** Nearest Push palette colour for a CSS hex colour; level 0 = full, 1-2 = dimmer. */
export function pushColor(hex: string, level = 0): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.18) return level === 0 ? RGB.white : level === 1 ? RGB.grey : RGB.dark; // unsaturated: white/greys
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hues: [number, number][] = [[0, 5], [30, 9], [55, 13], [85, 17], [120, 21], [170, 29], [200, 37], [230, 45], [275, 49], [300, 53], [330, 57], [360, 5]];
  const near = hues.reduce((a, x) => (Math.abs(x[0] - h) < Math.abs(a[0] - h) ? x : a));
  return near[1] + level;
}

export class Push1Surface {
  mode: "session" | "note" = "session";
  page: Page = "Macros";
  /** Which of the selected instrument's parameter pages the encoders show (Device page). */
  private devPage = 0;
  private shift = false;
  private del = false;
  private sceneOffset = 0;
  private stepPage = 0;
  private selPitch: number | null = null; // the note a step tap places (pitched tracks)
  private heldSteps = new Set<number>();
  private stepUsed = false; // a held step received keys (so releasing it doesn't toggle)
  private padsDown = new Map<number, number>(); // pad note -> played pitch
  private accum = new Map<string, number>();
  private lcdLast = ["", "", "", ""];
  private ledLast = new Map<string, number>();
  private timer: number;

  /** `run` wraps each refresh (couch mode: draw as the seat that owns the Push). */
  constructor(private app: App, private out: { send(d: number[]): void } | null, private sysex: boolean, private run: (fn: () => void) => void = (fn) => fn()) {
    if (sysex) this.send(LIVE_MODE);
    this.lcdClear();
    // LEDs follow the playhead and the LCD shows the countdown: refresh ~20 times a second.
    this.timer = setInterval(() => this.run(() => this.render()), 50) as unknown as number;
    this.render();
  }

  destroy() {
    clearInterval(this.timer);
    for (let i = 36; i <= 99; i++) this.send([0x90, i, 0]);
    for (const k of this.ledLast.keys()) if (k[0] === "c") this.send([0xb0, Number(k.slice(1)), 0]);
    this.lcdClear();
  }

  private send(d: number[]) { try { this.out?.send(d); } catch { /* port gone */ } }

  // ------------------------------------------------------------ context

  private track(): Track | undefined { return this.app.track() ?? this.app.song.tracks[0]; }
  private sceneId() { return this.app.ed.sceneId; }
  private stepLen() { return this.app.grid(); }

  /** Make sure the app has a valid track/scene selected (the Push edits "the selected clip"). */
  private ensureSelection() {
    const app = this.app, s = app.song;
    if (!s.tracks.find((t) => t.id === app.ed.trackId) && s.tracks[0]) app.ed.trackId = s.tracks[0].id;
    if (!s.scenes.find((x) => x.id === app.ed.sceneId)) app.ed.sceneId = s.scenes[0].id;
  }

  /** The 8 encoder slots of the current page: [track, param key] (or null). */
  private slots(): ([Track, string] | null)[] {
    const t = this.track();
    if (!t) return Array(8).fill(null);
    if (this.page === "Mixer") return Array.from({ length: 8 }, (_, i) => (this.app.song.tracks[i] ? [this.app.song.tracks[i], this.shift ? "mix:pan" : "mix:vol"] : null));
    if (this.page === "FX") return ["fx0:a", "fx0:b", "fx1:a", "fx1:b", "fx2:a", "fx2:b", "mix:send", "mix:pan"].map((k) => (paramInfo(t, k) && (k.startsWith("mix") || t.fx[Number(k[2])].type !== "off") ? [t, k] : null));
    const pg = this.devPages()[this.devPage] ?? this.devPages()[0];
    return Array.from({ length: 8 }, (_, i) => (pg.keys[i] && paramInfo(t, pg.keys[i]) ? [t, pg.keys[i]] : null));
  }

  /**
   * The selected instrument's parameter pages: its 8 macros first, then every
   * parameter. Drum machines get a page per part (Kitbox / Grab: the selected pad,
   * Thump Lab: Kick, Snare, Tom, Perc), everything else pages of 8.
   */
  devPages(): { name: string; keys: string[] }[] {
    const t = this.track();
    if (!t) return [{ name: "Macros", keys: [] }];
    const def = INSTRUMENTS[t.kind];
    const pages = [{ name: def.name, keys: def.macros }];
    const groups = new Map<string, string[]>(), rest: string[] = [];
    let perPad = false;
    for (const p of def.params) {
      if (/^p\d+[a-z]/.test(p.id)) { perPad = true; continue; }
      const m = def.partNames ? /^([a-z])[A-Z]/.exec(p.id) : null;
      if (m) { if (!groups.has(m[1])) groups.set(m[1], []); groups.get(m[1])!.push(p.id); continue; }
      rest.push(p.id);
    }
    if (perPad) {
      const part = this.app.ed.drumPart, re = new RegExp(`^p${part}[a-z]`);
      pages.push({ name: drumPartName(t.params, part, t.kind), keys: def.params.filter((p) => re.test(p.id)).map((p) => p.id) });
    }
    [...groups.values()].forEach((keys, i) => pages.push({ name: def.partNames?.[i] ?? `Part ${i + 1}`, keys }));
    const chunks = Math.ceil(rest.length / 8);
    for (let i = 0; i < chunks; i++) {
      pages.push({ name: def.drumParts ? (chunks > 1 ? `Main ${i + 1}` : "Main") : `Params ${i + 1}`, keys: rest.slice(i * 8, i * 8 + 8) });
    }
    return pages.slice(0, 8);
  }

  private pickDevPage(i: number) {
    const pages = this.devPages();
    if (i >= pages.length) return;
    const t = this.track();
    // Pressing the per-pad page again steps to the next pad.
    if (i === this.devPage && t && i === 1 && INSTRUMENTS[t.kind].params.some((p) => /^p\d+[a-z]/.test(p.id))) {
      this.app.ed.drumPart = (this.app.ed.drumPart + 1) % drumCount(t.kind);
    }
    this.devPage = i;
  }

  // ------------------------------------------------------------ input

  onMessage(d: Uint8Array, time: number) {
    this.ensureSelection();
    const st = d[0] & 0xf0;
    if (st === 0x90 || st === 0x80) {
      const note = d[1], on = st === 0x90 && d[2] > 0;
      // Encoder touch (notes 0..7): hold Delete and touch a knob to put it back to the preset's value.
      if (note < 8) { if (on && this.del) this.resetSlot(note); return; }
      if (note >= 36 && note <= 99) { if (on) this.padDown(note, d[2], time); else this.padUp(note, time); }
      return;
    }
    if (st === 0xe0) {
      // Touch strip (pitch bend): the selected synth's XY pad, X axis.
      const t = this.app.track(), xy = t && XY_PARAMS[t.kind], def = t && xy && paramDef(t.kind, xy[0]);
      if (t && xy && def) this.app.setParam(t, xy[0], fromUnit(def, ((d[2] << 7) | d[1]) / 16383));
      return;
    }
    if (st !== 0xb0) return;
    const cc = d[1], val = d[2], rel = val < 64 ? val : val - 128, pressed = val > 0;
    if (cc >= 71 && cc <= 78) { if (this.del) this.resetSlot(cc - 71); else this.turn(cc - 71, rel); return; }
    if (cc === BTN.tempo) { this.stepped("tempo", rel, 1, (dir) => this.app.edit("Tempo", () => (this.app.song.tempo = Math.max(40, Math.min(250, this.app.song.tempo + dir))), { render: false })); this.app.renderHeader(); return; }
    if (cc === BTN.swing) { this.stepped("swing", rel, 2, (dir) => this.app.edit("Swing", () => (this.app.song.swing = Math.max(0, Math.min(100, this.app.song.swing + dir * 5))), { render: false })); return; }
    if (cc === BTN.master) { const m = this.app.song.master; this.app.setMaster("volume", Math.max(0, Math.min(1, m.volume + rel / 200))); return; }
    // Row under the display: the instrument's parameter pages (Device) or the tracks (Mixer).
    if (cc >= 20 && cc <= 27) {
      if (!pressed) return;
      if (this.page === "Macros") this.pickDevPage(cc - 20);
      else { const t = this.app.song.tracks[cc - 20]; if (t) { this.app.ed.trackId = t.id; this.selPitch = null; } }
      this.app.screens[this.app.screenName]?.render();
      return;
    }
    // Second row: Device / Mixer / FX.
    if (cc >= 102 && cc <= 109) { if (pressed && cc - 102 < PAGES.length) this.page = PAGES[cc - 102]; return; }
    if (cc >= 36 && cc <= 43) {
      if (!pressed) return;
      const i = this.sceneOffset + (43 - cc);
      // The (dim) button just below the last scene adds a new one.
      if (i === this.app.song.scenes.length) this.newScene(false);
      else this.launchScene(i);
      return;
    }
    if (!pressed && cc !== BTN.shift && cc !== BTN.del) return;
    const app = this.app;
    switch (cc) {
      case BTN.play: app.togglePlay(); break;
      case BTN.stop: if (app.engine.playing) app.togglePlay(); break;
      case BTN.record:
        // Record into the selected clip: the editor shows it while recording.
        if (!app.recording && app.screenName !== "edit") app.show("edit");
        app.toggleRecord();
        break;
      case BTN.tap: app.tapTempo?.(); break;
      case BTN.metronome: app.edit("Metronome", () => (app.song.metronome = !app.song.metronome)); break;
      case BTN.undo: if (this.shift) app.redo(); else app.undo(); break;
      case BTN.shift: this.shift = pressed; break;
      case BTN.del: this.del = pressed; break;
      case BTN.duplicate: if (this.shift) { this.newScene(true); break; } // falls through
      case BTN.double: { const t = this.track(); if (t) app.edit("Duplicate clip", () => duplicateClip(app.song, ensureClip(app.song, t, this.sceneId()))); break; }
      case BTN.quantize: { const c = this.track()?.clips[this.sceneId()]; if (c) app.edit("Quantize", () => quantizeClip(c, c.notes, this.stepLen())); break; }
      case BTN.mute: { const t = this.track(); if (t) app.edit("Mute", () => (t.mute = !t.mute)); break; }
      case BTN.solo: { const t = this.track(); if (t) app.edit("Solo", () => (t.solo = !t.solo)); break; }
      case BTN.note: this.mode = "note"; this.releaseAll(); break;
      case BTN.session: this.mode = "session"; this.releaseAll(); break;
      case BTN.scale: app.settings.scaleLock = !app.settings.scaleLock; app.saveSettings(); app.refresh(); break;
      case BTN.octDown: app.ed.octave = Math.max(0, app.ed.octave - 1); break;
      case BTN.octUp: app.ed.octave = Math.min(7, app.ed.octave + 1); break;
      case BTN.device: this.page = "Macros"; break;
      case BTN.volume: this.page = "Mixer"; break;
      case BTN.panSend: this.page = "FX"; break;
      case BTN.left: case BTN.right: {
        // Left / right: previous / next instrument. Shift: step page (note mode).
        const d = cc === BTN.left ? -1 : 1;
        if (this.shift && this.mode === "note") this.stepPage = Math.max(0, Math.min(this.stepPages() - 1, this.stepPage + d));
        else this.selectTrack(d);
        break;
      }
      case BTN.up: case BTN.down: {
        // Up / down: add / remove a bar of the selected clip. Shift: scroll scenes / pick scene.
        if (this.shift) {
          const d = cc === BTN.up ? -1 : 1;
          if (this.mode === "session") this.sceneOffset = Math.max(0, Math.min(Math.max(0, app.song.scenes.length - 8), this.sceneOffset + d));
          else this.selectScene(d);
        } else this.changeBars(cc === BTN.up ? 1 : -1);
        break;
      }
    }
    app.screens[app.screenName]?.render();
  }

  private selectTrack(d: number) {
    const ts = this.app.song.tracks, i = ts.findIndex((t) => t.id === this.app.ed.trackId);
    const n = ts[(i + d + ts.length) % ts.length];
    if (!n) return;
    this.app.ed.trackId = n.id;
    this.app.songCur.col = ts.indexOf(n);
    this.selPitch = null;
    this.stepPage = 0;
    this.devPage = Math.min(this.devPage, this.devPages().length - 1);
  }

  /** Add a blank scene at the end, or (copy) duplicate the selected scene right after it. */
  private newScene(copy: boolean) {
    const app = this.app, song = app.song;
    if (song.scenes.length >= MAX_SCENES) { app.overlays.toast(`${MAX_SCENES} scenes max`); return; }
    const i = song.scenes.findIndex((x) => x.id === this.sceneId());
    let s = null as Scene | null;
    app.edit(copy ? "Duplicate scene" : "Add scene", () => { s = copy ? duplicateScene(song, i) : addScene(song); });
    if (!s) return;
    const si = song.scenes.indexOf(s);
    app.ed.sceneId = s.id;
    app.songCur.row = si;
    this.sceneOffset = Math.max(this.sceneOffset, si - 7);
    app.overlays.toast(`Added ${s.name}`, 1200);
    app.refresh();
  }

  private changeBars(d: number) {
    const app = this.app, t = this.track();
    if (!t) return;
    const clip = ensureClip(app.song, t, this.sceneId());
    const bars = Math.max(1, Math.min(MAX_BARS, clip.bars + d));
    if (bars === clip.bars) { app.overlays.toast(d > 0 ? `Clips are ${MAX_BARS} bars max` : "1 bar is the shortest"); return; }
    app.edit("Clip length", () => setClipBars(clip, bars));
    this.stepPage = Math.min(this.stepPage, this.stepPages() - 1);
    app.overlays.toast(`${INSTRUMENTS[t.kind].name}: ${bars} bar${bars > 1 ? "s" : ""}`, 1200);
  }

  private selectScene(d: number) {
    const ss = this.app.song.scenes, i = ss.findIndex((s) => s.id === this.app.ed.sceneId);
    const n = ss[Math.max(0, Math.min(ss.length - 1, i + d))];
    this.app.ed.sceneId = n.id;
    this.stepPage = 0;
  }

  private launchScene(i: number) {
    const app = this.app, s = app.song.scenes[i];
    if (!s) return;
    app.ed.sceneId = s.id;
    app.songCur.row = i;
    app.songMode = "scene";
    if (app.engine.playing) app.engine.queue({ kind: "scene", sceneId: s.id });
    else app.engine.play({ kind: "scene", sceneId: s.id });
    app.refresh();
  }

  // ---- encoders

  private stepped(key: string, ticks: number, per: number, fn: (dir: 1 | -1) => void) {
    let a = (this.accum.get(key) ?? 0) + ticks;
    while (Math.abs(a) >= per) { const dir = a > 0 ? 1 : -1; fn(dir); a -= per * dir; }
    this.accum.set(key, a);
  }

  private turn(i: number, ticks: number) {
    const slot = this.slots()[i];
    if (!slot) return;
    const [t, key] = slot;
    const p = paramInfo(t, key);
    if (!p) return;
    if (p.options || p.unit === "st") {
      this.stepped(`${t.id}:${key}`, ticks, 4, (dir) => this.app.setParam(t, key, Math.max(p.min, Math.min(p.max, Math.round(getParam(t, key)) + dir))));
    } else {
      const u = toUnit(p, getParam(t, key)) + ticks / (this.shift ? 1000 : 200);
      this.app.setParam(t, key, fromUnit(p, Math.max(0, Math.min(1, u))));
    }
  }

  private resetSlot(i: number) {
    const slot = this.slots()[i];
    if (!slot) return;
    const [t, key] = slot;
    const p = paramInfo(t, key);
    if (!p) return;
    const pi = INSTRUMENTS[t.kind].presets.findIndex((x) => x.name === t.preset);
    const v = pi >= 0 && INSTRUMENTS[t.kind].params.some((q) => q.id === key) ? presetParams(t.kind, pi)[key] : p.def;
    this.app.setParam(t, key, v, true);
  }

  // ---- pads

  private padIdx(note: number) { return note - 36; } // 0 = bottom-left
  private rowFromBottom(idx: number) { return Math.floor(idx / 8); }
  private col(idx: number) { return idx % 8; }

  /** Note mode, bottom half: the pitch a key pad plays (null = unused pad). */
  private keyPitch(idx: number): number | null {
    const t = this.track();
    const row = this.rowFromBottom(idx), col = this.col(idx);
    if (!t || row > 3) return null;
    if (isDrumKind(t.kind)) {
      const part = row * 8 + col;
      return part < drumCount(t.kind) ? DRUM_BASE_NOTE + part : null;
    }
    const song = this.app.song, base = (this.app.ed.octave + 1) * 12 + song.key;
    if (!this.app.settings.scaleLock) return base + col + row * 5;
    const steps = scaleById(song.scale).steps, deg = col + row * 3;
    return base + Math.floor(deg / steps.length) * 12 + steps[deg % steps.length];
  }

  /** Note mode, top half: the step a pad stands for (or -1). */
  private stepOf(idx: number): number {
    const row = this.rowFromBottom(idx);
    return row >= 4 ? (7 - row) * 8 + this.col(idx) : -1;
  }

  private stepPages() {
    const c = this.track()?.clips[this.sceneId()];
    return Math.max(1, Math.ceil(((c?.bars ?? 1) * TICKS_PER_BAR) / (32 * this.stepLen())));
  }

  private stepTick(step: number) { return (this.stepPage * 32 + step) * this.stepLen(); }

  /** The pitch a step tap toggles. */
  private stepPitch(): number {
    const t = this.track();
    if (t && isDrumKind(t.kind)) return DRUM_BASE_NOTE + this.app.ed.drumPart;
    // Until a key is played: the song's root, in a bass octave for bass tracks.
    return this.selPitch ?? (t && INSTRUMENTS[t.kind].group === "bass" ? 36 : 60) + this.app.song.key;
  }

  private padDown(note: number, vel: number, time: number) {
    const app = this.app, idx = this.padIdx(note);
    if (this.mode === "session") {
      const t = app.song.tracks[this.col(idx)], si = this.sceneOffset + (7 - this.rowFromBottom(idx));
      const s = app.song.scenes[si];
      if (!t || !s) return;
      app.ed.trackId = t.id;
      app.songCur = { row: si, col: this.col(idx) };
      if (this.del) { if (t.clips[s.id]) app.edit("Clear clip", () => delete t.clips[s.id]); return; }
      // A pad selects that clip; Shift + pad (or the scene buttons) launches.
      if (this.shift) this.launchScene(si);
      else { app.ed.sceneId = s.id; this.selPitch = null; this.stepPage = 0; this.devPage = Math.min(this.devPage, this.devPages().length - 1); app.refresh(); }
      return;
    }
    const step = this.stepOf(idx);
    if (step >= 0) {
      if (this.del) { this.clearStep(step); return; }
      this.heldSteps.add(step);
      this.stepUsed = false;
      return;
    }
    const pitch = this.keyPitch(idx);
    if (pitch === null) return;
    const t = this.track()!;
    if (isDrumKind(t.kind)) app.ed.drumPart = pitch - DRUM_BASE_NOTE;
    else this.selPitch = pitch;
    if (this.heldSteps.size) {
      // Step entry: hold step(s), hit keys.
      this.stepUsed = true;
      app.edit("Step", () => {
        const c = ensureClip(app.song, t, this.sceneId());
        for (const s of this.heldSteps) addNote(app.song, c, { pitch, start: this.stepTick(s), len: this.stepLen(), vel: Math.max(1, vel) });
      });
      app.engine.preview(t.id, pitch, vel);
      return;
    }
    this.padsDown.set(note, pitch);
    app.noteInput(pitch, Math.max(1, vel), true, time, t);
  }

  private padUp(note: number, time: number) {
    const app = this.app, idx = this.padIdx(note);
    if (this.mode === "note") {
      const step = this.stepOf(idx);
      if (step >= 0 && this.heldSteps.has(step)) {
        this.heldSteps.delete(step);
        if (!this.stepUsed) this.toggleStep(step);
        if (!this.heldSteps.size) this.stepUsed = false;
        return;
      }
    }
    const pitch = this.padsDown.get(note);
    if (pitch !== undefined) { this.padsDown.delete(note); app.noteInput(pitch, 0, false, time, this.track()); }
  }

  private toggleStep(step: number) {
    const app = this.app, t = this.track();
    if (!t) return;
    const tick = this.stepTick(step), pitch = this.stepPitch();
    const c = ensureClip(app.song, t, this.sceneId());
    if (tick >= c.bars * TICKS_PER_BAR) return;
    const hit = c.notes.find((n) => n.start === tick && n.pitch === pitch);
    app.edit(hit ? "Delete note" : "Add note", () => {
      if (hit) c.notes = c.notes.filter((n) => n !== hit);
      else addNote(app.song, c, { pitch, start: tick, len: this.stepLen(), vel: 100 });
    });
    if (!hit) app.engine.preview(t.id, pitch, 100, 0.15);
  }

  private clearStep(step: number) {
    const app = this.app, c = this.track()?.clips[this.sceneId()];
    if (!c) return;
    const t0 = this.stepTick(step), t1 = t0 + this.stepLen();
    app.edit("Clear step", () => { c.notes = c.notes.filter((n) => n.start < t0 || n.start >= t1); });
  }

  private releaseAll() {
    for (const [note] of this.padsDown) this.padUp(note, performance.now());
    this.heldSteps.clear();
    this.stepUsed = false;
  }

  // ------------------------------------------------------------ output

  private led(kind: "n" | "c", num: number, value: number) {
    const k = kind + num;
    if (this.ledLast.get(k) === value) return;
    this.ledLast.set(k, value);
    this.send([kind === "n" ? 0x90 : 0xb0, num, value]);
  }

  render() {
    this.ensureSelection();
    this.renderPads();
    this.renderButtons();
    this.renderLcd();
  }

  private renderPads() {
    const app = this.app, song = app.song, pos = app.engine.position();
    for (let idx = 0; idx < 64; idx++) {
      let c = RGB.off;
      if (this.mode === "session") {
        const t = song.tracks[this.col(idx)], s = song.scenes[this.sceneOffset + (7 - this.rowFromBottom(idx))];
        const clip = t && s ? t.clips[s.id] : undefined;
        if (t && s && clip?.notes.length) {
          const playing = pos?.sceneId === s.id;
          c = clip.muted ? RGB.dark : pushColor(trackColor(t), playing ? 0 : 2);
        } else if (clip) c = RGB.dark; // an empty clip: there, but nothing in it
        if (t && s && t.id === app.ed.trackId && s.id === app.ed.sceneId) c = RGB.white;
      } else {
        const t = this.track(), clip = t?.clips[this.sceneId()];
        const step = this.stepOf(idx);
        if (step >= 0 && t) {
          const tick = this.stepTick(step), len = this.stepLen();
          const inClip = tick < (clip?.bars ?? 1) * TICKS_PER_BAR;
          const notes = clip?.notes.filter((n) => n.start >= tick && n.start < tick + len) ?? [];
          const playTick = pos && pos.sceneId === this.sceneId() && clip ? pos.tick % (clip.bars * TICKS_PER_BAR) : -1;
          if (!inClip) c = RGB.off;
          else if (this.heldSteps.has(step)) c = RGB.magenta;
          else if (playTick >= tick && playTick < tick + len) c = RGB.white;
          else if (notes.some((n) => n.pitch === this.stepPitch())) c = pushColor(trackColor(t), 0);
          else if (notes.length) c = pushColor(trackColor(t), 2);
          else c = RGB.dark;
        } else {
          const p = this.keyPitch(idx);
          if (p !== null && t) {
            const held = [...this.padsDown.values()].includes(p);
            if (held) c = RGB.green;
            else if (isDrumKind(t.kind)) c = p - DRUM_BASE_NOTE === app.ed.drumPart ? RGB.white : pushColor(trackColor(t), 2);
            else if ((((p - song.key) % 12) + 12) % 12 === 0) c = pushColor(trackColor(t), 0);
            else if (p === this.stepPitch()) c = RGB.white;
            else c = inScale(p, song.key, song.scale) ? RGB.grey : RGB.dark;
          }
        }
      }
      this.led("n", 36 + idx, c);
    }
  }

  private renderButtons() {
    const app = this.app, pos = app.engine.position();
    // Row 1 (CC 20..27): parameter pages, or tracks on the Mixer page. Upper-row LEDs are red/amber/yellow/green.
    if (this.page === "Macros") {
      const n = this.devPages().length;
      for (let i = 0; i < 8; i++) this.led("c", 20 + i, i >= n ? 0 : i === this.devPage ? 16 : 13); // yellow / dim yellow
    } else if (this.page === "Mixer") {
      for (let i = 0; i < 8; i++) { const t = app.song.tracks[i]; this.led("c", 20 + i, !t ? 0 : t.id === app.ed.trackId ? 22 : 19); } // green / dim green
    } else for (let i = 0; i < 8; i++) this.led("c", 20 + i, 0);
    // Row 2 (CC 102..109): Device / Mixer / FX.
    for (let i = 0; i < 8; i++) this.led("c", 102 + i, i >= PAGES.length ? 0 : PAGES[i] === this.page ? pushColor("#4fd8ff", 0) : pushColor("#4fd8ff", 2));
    for (let k = 0; k < 8; k++) {
      const s = app.song.scenes[this.sceneOffset + k];
      if (!s) { this.led("c", 43 - k, this.sceneOffset + k === app.song.scenes.length ? 19 : 0); continue; } // dim green: "add a scene"
      this.led("c", 43 - k, pos?.sceneId === s.id ? 22 : s.id === app.ed.sceneId ? 16 : 13); // green playing, yellow selected
    }
    const single = (cc: number, on: boolean) => this.led("c", cc, on ? 4 : 1);
    single(BTN.play, app.engine.playing);
    single(BTN.record, app.recording);
    single(BTN.metronome, app.song.metronome);
    single(BTN.note, this.mode === "note");
    single(BTN.session, this.mode === "session");
    single(BTN.scale, app.settings.scaleLock);
    single(BTN.shift, this.shift);
    single(BTN.del, this.del);
    single(BTN.mute, !!this.track()?.mute);
    single(BTN.solo, !!this.track()?.solo);
    for (const cc of [BTN.tap, BTN.undo, BTN.double, BTN.quantize, BTN.octDown, BTN.octUp, BTN.left, BTN.right, BTN.up, BTN.down, BTN.stop]) single(cc, false);
  }

  private lcdLine(n: number, text: string) {
    if (!this.sysex || this.lcdLast[n] === text) return;
    this.lcdLast[n] = text;
    const chars: number[] = [];
    for (let i = 0; i < LCD_W; i++) { const c = text.charCodeAt(i); chars.push(Number.isNaN(c) ? 32 : c < 127 ? c : 63); }
    this.send([...SYSEX, 0x18 + n, 0x00, 0x45, 0x00, ...chars, 0xf7]);
  }

  private lcdClear() {
    if (!this.sysex) return;
    for (let n = 0; n < 4; n++) { this.send([...SYSEX, 0x1c + n, 0x00, 0x00, 0xf7]); this.lcdLast[n] = ""; }
  }

  private fit(s: string, w: number) {
    s = s.length > w ? s.slice(0, w) : s;
    const pad = w - s.length;
    return " ".repeat(Math.floor(pad / 2)) + s + " ".repeat(Math.ceil(pad / 2));
  }

  private columns(cells: string[]) {
    let line = "";
    for (let i = 0; i < 8; i++) line += this.fit(cells[i] ?? "", COLS[i + 1] - COLS[i]);
    return line;
  }

  /** The current lines as plain text (for tests and the on-screen mirror). */
  lcdText(): string[] { return this.buildLcd(); }

  private buildLcd(): string[] {
    const app = this.app, slots = this.slots();
    const label = (s: [Track, string] | null) => {
      if (!s) return "";
      const [t, k] = s, p = paramInfo(t, k);
      if (this.page === "Mixer") return `${app.song.tracks.indexOf(t) + 1} ${INSTRUMENTS[t.kind].name}`.slice(0, 8);
      return (p?.label ?? k).replace(/^(EQ|Low-pass|High-pass|Band-pass|Compressor|Drive|Decimator|Chorus|Phaser|Tremolo|Pump|Slicer|BPM delay|Room reverb|Hall reverb) /, "");
    };
    const value = (s: [Track, string] | null) => {
      if (!s) return "";
      const p = paramInfo(s[0], s[1]);
      return p ? formatParam(p, getParam(s[0], s[1])) : "";
    };
    const bar = (s: [Track, string] | null, w: number) => {
      if (!s) return " ".repeat(w);
      const p = paramInfo(s[0], s[1]);
      if (!p || p.options) return " ".repeat(w);
      const halves = Math.round(Math.max(0, Math.min(1, toUnit(p, getParam(s[0], s[1])))) * 15) + 1;
      let b = "";
      for (let i = 0; i < 8; i++) { const h = halves - i * 2; b += h >= 2 ? "\x05" : h === 1 ? "\x03" : "\x06"; }
      return (b + " ").slice(0, w);
    };
    const t = this.track();
    const scene = app.song.scenes.find((s) => s.id === this.sceneId());
    const timer = app.timer.running ? `T ${fmtTime(app.timeLeft())}` : app.timer.done ? "TIME UP" : "no timer";
    const state = app.recording ? "REC" : app.engine.playing ? "PLAY" : "STOP";
    const head = this.page === "Mixer" ? "MIXER" : t ? `${INSTRUMENTS[t.kind].name}` : "";
    const bars = t?.clips[this.sceneId()]?.bars ?? 1;
    const barsTxt = `${bars} bar${bars > 1 ? "s" : ""}${this.mode === "note" && this.stepPages() > 1 ? ` p${this.stepPage + 1}` : ""}`;
    const bpm = `${app.engine.externalTempo ?? app.song.tempo} bpm`;
    let bottom: string[];
    if (this.page === "Macros") {
      // The page tabs sit over the buttons that pick them; spare columns keep the essentials.
      const tabs = this.devPages().map((p) => p.name); // the lit button marks the current one
      const extra = [timer, t ? t.preset : "", barsTxt, bpm, state].slice(0, 8 - tabs.length);
      bottom = [...tabs, ...extra.reverse()];
    } else {
      bottom = [
        head, t ? t.preset : "", scene ? scene.name : "", barsTxt,
        `${NOTE_NAMES[app.song.key]} ${scaleById(app.song.scale).name}`.slice(0, 9), bpm, state, timer,
      ];
    }
    return [
      this.columns(slots.map(label)),
      this.columns(slots.map(value)),
      slots.map((s, i) => bar(s, COLS[i + 1] - COLS[i])).join(""),
      this.columns(bottom),
    ];
  }

  private renderLcd() {
    this.buildLcd().forEach((l, i) => this.lcdLine(i, l));
  }
}
