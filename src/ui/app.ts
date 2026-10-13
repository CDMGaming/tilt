// The app: state, the edit/undo pipeline, input routing, recording, step
// input, timer and persistence. Screens render from this state.

import { AudioEngine } from "../engine/audio";
import { History } from "../engine/history";
import { INSTRUMENTS, fromUnit, toUnit, paramDef } from "../engine/instruments";
import { getParam, paramInfo, setParamValue } from "../engine/params";
import { AUTO_STEP } from "../engine/timeline";
import { DRUM_BASE_NOTE } from "../engine/instruments";
import { PPQ, TICKS_PER_BAR, normalizeSong, type Song, type Track } from "../engine/model";
import { scaleById, snapToScale } from "../engine/music";
import { addNote, addTrack, clearAutoRange, ensureClip, quantizeNotes, setAutoPoint } from "../engine/songops";
import { NO_LOCKS, roll, type Locks, type Setup } from "../engine/dice";
import { mods, type Action } from "./actions";
import { h } from "./dom";
import { GamepadInput, bindKeyboard, type MusicKey } from "./input";
import { Midi } from "./midi";
import { OverlayHost } from "./overlay";

export type ScreenName = "dice" | "song" | "edit" | "mix";

export interface Screen {
  el: HTMLElement;
  render(): void;
  handle(a: Action): boolean;
  frame?(now: number): void;
  /** Called when the screen is shown. */
  enter?(): void;
  /** A parameter changed outside the screen (MIDI knob, gamepad). */
  paramChanged?(trackId: number, id: string): void;
}

export interface EditorState {
  trackId: number;
  sceneId: number;
  focus: "roll" | "panel";
  tick: number;
  pitch: number;
  grid: number; // 24 = 16th, 48 = 8th (before triplet)
  triplet: boolean;
  velView: boolean;
  autoKey: string | null; // automation lane shown under the roll
  stepInput: boolean;
  stepTick: number;
  sel: Set<number>;
  selAnchor: { tick: number; pitch: number } | null;
  placing: number | null; // note being sized while A is held
  grabbing: boolean; // moving the selection while A is held
  clipboard: { pitch: number; start: number; len: number; vel: number }[];
  octave: number; // computer/on-screen keyboard octave (MIDI octave number)
  drumPart: number;
  topPitch: number; // highest visible row
}

export interface Settings {
  notePreview: boolean;
  scaleLock: boolean;
  fold: boolean; // hide out-of-key rows in the piano roll
  countIn: boolean; // one bar of clicks before recording starts from stopped
  recQuantize: boolean;
  padLayout: "auto" | "xbox" | "nintendo";
  outputDevice: string;
}

const SONG_KEY = "rollbox.song.v1";
const SETTINGS_KEY = "rollbox.settings.v1";

export class App {
  engine = new AudioEngine();
  song!: Song;
  history = new History();
  overlays: OverlayHost;
  midi: Midi;
  pad: GamepadInput;
  screens = {} as Record<ScreenName, Screen>;
  screenName: ScreenName = "dice";
  songCur = { row: 0, col: 0 }; // row -1 = track headers, col -1 = scene names
  ed: EditorState = {
    trackId: 0, sceneId: 0, focus: "roll", tick: 0, pitch: 48, grid: 24, triplet: false, velView: false, autoKey: null,
    stepInput: false, stepTick: 0, sel: new Set(), selAnchor: null, placing: null, grabbing: false, clipboard: [],
    octave: 3, drumPart: 0, topPitch: 72,
  };
  settings: Settings = { notePreview: true, scaleLock: true, fold: false, countIn: true, recQuantize: true, padLayout: "auto", outputDevice: "" };
  dice: { setup: Setup; locks: Locks; minutes: number } = { setup: roll(null, NO_LOCKS), locks: { ...NO_LOCKS }, minutes: 20 };
  timer = { total: 0, endsAt: 0, running: false, done: false };
  locked = false;
  recording = false;
  shortcutOpen = false;
  private recPending = new Map<number, { sceneId: number; tick: number; vel: number }>();
  private stepHeld = 0;
  private stepChordTick = 0;
  private saveTimer: number | undefined;
  private lastParam = { key: "", time: 0 };
  private header: HTMLElement;
  private main: HTMLElement;
  renderHeader: () => void = () => {};
  frameHooks: ((now: number) => void)[] = [];

  constructor(root: HTMLElement) {
    this.header = h("header", { class: "topbar" });
    this.main = h("main", { class: "screen-host" });
    const layer = h("div", { class: "overlay-host" });
    root.append(this.header, this.main, layer);
    this.overlays = new OverlayHost(layer);
    this.midi = new Midi({
      onKey: (p, v, on, t) => this.midiKey(p, v, on, t),
      onPad: (i, v, on, t) => this.midiPad(i, v, on, t),
      onMacro: (i, v) => this.macro(i, v),
      onTrackVolume: (i, v) => this.trackVolume(i, v),
      onTransport: () => this.togglePlay(),
      onDevicesChanged: () => this.renderHeader(),
    });
    this.pad = new GamepadInput({ action: (a) => this.dispatch(a), musicKey: () => {} });
    bindKeyboard({ action: (a) => this.dispatch(a), musicKey: (k, on) => this.musicKey(k, on) }, () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    });
    this.loadSettings();
  }

  get headerEl() { return this.header; }
  get mainEl() { return this.main; }

  async boot(song: Song) {
    this.song = normalizeSong(song);
    await this.engine.init(song);
    if (this.settings.outputDevice) await this.engine.setOutputDevice(this.settings.outputDevice).catch(() => {});
    this.engine.onEnded = () => { this.recording = false; this.renderHeader(); };
    // Browsers start audio suspended until the first click or key.
    const resume = () => { if (this.engine.ctx.state !== "running") void this.engine.ctx.resume(); };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    void this.midi.enable();
    const loop = (now: number) => {
      this.pad.nintendoLayout = this.settings.padLayout === "auto" ? null : this.settings.padLayout === "nintendo";
      this.pad.poll(now);
      for (const f of this.frameHooks) f(now);
      this.screens[this.screenName]?.frame?.(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // The countdown runs on its own timer: animation frames pause when the window is hidden.
    setInterval(() => this.tickTimer(), 250);
  }

  // ------------------------------------------------------------ screens

  show(name: ScreenName) {
    if (name !== "dice" && !this.song.tracks.length && name === "edit") name = "song";
    this.screenName = name;
    const s = this.screens[name];
    this.main.replaceChildren(s.el);
    s.enter?.();
    s.render();
    this.renderHeader();
  }

  refresh() {
    this.renderHeader();
    this.screens[this.screenName]?.render();
  }

  // ------------------------------------------------------------ editing

  /** Every song change goes through here: undo snapshot, mutate, sync audio, save, re-render. */
  edit(label: string, fn: () => void, opts: { render?: boolean; snapshot?: boolean } = {}): boolean {
    if (this.locked) { this.overlays.toast("Time's up. Editing is locked."); return false; }
    if (opts.snapshot !== false) this.history.push(this.song, label);
    fn();
    this.changed(opts.render !== false);
    return true;
  }

  changed(render = true) {
    this.engine.sync(this.song);
    this.scheduleSave();
    if (render) this.refresh();
  }

  undo() {
    const s = this.history.undo(this.song);
    if (!s) { this.overlays.toast("Nothing to undo"); return; }
    this.replaceSong(s, false);
    this.overlays.toast("Undo");
  }

  redo() {
    const s = this.history.redo(this.song);
    if (!s) return;
    this.replaceSong(s, false);
    this.overlays.toast("Redo");
  }

  replaceSong(song: Song, clearHistory = true) {
    this.song = normalizeSong(song);
    if (clearHistory) this.history.clear();
    this.ed.sel.clear();
    this.fixCursors();
    this.changed();
  }

  fixCursors() {
    const s = this.song;
    if (!s.tracks.find((t) => t.id === this.ed.trackId)) this.ed.trackId = s.tracks[0]?.id ?? 0;
    if (!s.scenes.find((x) => x.id === this.ed.sceneId)) this.ed.sceneId = s.scenes[0]?.id ?? 0;
    this.songCur.row = Math.min(this.songCur.row, s.scenes.length);
    this.songCur.col = Math.min(this.songCur.col, s.tracks.length);
  }

  track(id = this.ed.trackId): Track | undefined {
    return this.song.tracks.find((t) => t.id === id);
  }

  /** The track that MIDI and the musical keyboard play. */
  selectedTrack(): Track | undefined {
    if (this.screenName === "mix") return (this.screens.mix as Screen & { focusedTrack(): Track | undefined }).focusedTrack() ?? this.track();
    if (this.screenName === "song") {
      const c = this.songCur.col;
      return this.song.tracks[Math.max(0, Math.min(c, this.song.tracks.length - 1))];
    }
    return this.track();
  }

  /**
   * Change one parameter (instrument knob, mixer "mix:*", or FX "fx0:a"...). One undo step
   * per gesture. While recording, the move is also written into the clip's automation lane.
   */
  setParam(track: Track, id: string, v: number, gesture = false) {
    if (this.locked) return;
    const key = `${track.id}:${id}`;
    const now = performance.now();
    if (!this.recording && (gesture || this.lastParam.key !== key || now - this.lastParam.time > 1500)) {
      this.history.push(this.song, `${INSTRUMENTS[track.kind].name}: ${paramInfo(track, id)?.label ?? id}`);
    }
    this.lastParam = { key, time: now };
    setParamValue(track, id, v);
    if (this.recording && this.engine.playing) this.recordAuto(track, id, v);
    this.changed(false);
    this.screens[this.screenName]?.paramChanged?.(track.id, id);
  }

  /** Master section values (not automatable). */
  setMaster<K extends keyof Song["master"]>(key: K, v: Song["master"][K], gesture = false) {
    if (this.locked) return;
    const now = performance.now();
    const lk = `master:${String(key)}`;
    if (gesture || this.lastParam.key !== lk || now - this.lastParam.time > 1500) this.history.push(this.song, `Master ${String(key)}`);
    this.lastParam = { key: lk, time: now };
    this.song.master[key] = v;
    this.changed(false);
  }

  /** Nudge a parameter by knob steps (gamepad right stick, relative encoders). */
  nudgeParam(track: Track, id: string, steps: number) {
    const p = paramInfo(track, id);
    if (!p) return;
    const cur = getParam(track, id);
    let v: number;
    if (p.options || p.unit === "st") v = Math.max(p.min, Math.min(p.max, Math.round(cur) + Math.sign(steps)));
    else v = fromUnit(p, toUnit(p, cur) + steps * (mods.fine ? 0.002 : 0.01));
    this.setParam(track, id, v);
  }

  private autoLast = new Map<string, { sceneId: number; tick: number; time: number }>();

  /** Write a knob move into the playing clip's lane, overwriting what was there since the last write. */
  private recordAuto(track: Track, key: string, v: number) {
    const def = paramInfo(track, key);
    const pos = this.engine.tickAtHeard(this.engine.heardTime(performance.now()));
    if (!def || !pos) return;
    const clip = ensureClip(this.song, track, pos.sceneId);
    const clipTicks = clip.bars * TICKS_PER_BAR;
    const tick = Math.floor((pos.tick % clipTicks) / AUTO_STEP) * AUTO_STEP;
    const lk = `${track.id}:${key}`;
    const last = this.autoLast.get(lk);
    const now = performance.now();
    if (last && last.sceneId === pos.sceneId && now - last.time < 400) clearAutoRange(clip, key, last.tick, tick);
    setAutoPoint(clip, key, tick, toUnit(def, v));
    this.autoLast.set(lk, { sceneId: pos.sceneId, tick, time: now });
  }

  // ------------------------------------------------------------ transport

  togglePlay() {
    if (this.engine.playing) {
      this.engine.stop();
      this.finishRecording();
      this.recording = false;
    } else {
      this.engine.play(this.playMode());
    }
    this.renderHeader();
  }

  /** On the editor: loop the clip's scene. On the song screen: loop the scene under the cursor, or play the song. */
  songMode: "scene" | "song" = "scene";
  playMode() {
    if (this.songMode === "song") {
      const row = this.screenName === "song" ? Math.max(0, this.songCur.row) : this.song.scenes.findIndex((s) => s.id === this.ed.sceneId);
      return { kind: "song" as const, fromIndex: Math.max(0, Math.min(row, this.song.scenes.length - 1)) };
    }
    return { kind: "scene" as const, sceneId: this.currentSceneId() };
  }

  currentSceneId(): number {
    if (this.screenName === "song") {
      const row = Math.max(0, Math.min(this.songCur.row, this.song.scenes.length - 1));
      return this.song.scenes[row]?.id ?? this.ed.sceneId;
    }
    return this.ed.sceneId;
  }

  toggleRecord() {
    if (this.recording) {
      this.finishRecording();
      this.recording = false;
      this.renderHeader();
      return;
    }
    if (this.locked) { this.overlays.toast("Time's up. Recording is locked."); return; }
    if (this.screenName !== "edit" && this.screenName !== "mix") { this.overlays.toast("Open a clip (or the mixer) to record"); return; }
    this.history.push(this.song, "Record");
    this.recording = true;
    if (!this.engine.playing) {
      const beats = this.settings.countIn ? 4 : 0;
      const start = this.engine.play(this.screenName === "mix" ? this.playMode() : { kind: "scene", sceneId: this.ed.sceneId }, beats);
      if (beats) this.showCountIn(start, beats);
    }
    if (this.screenName === "mix") this.overlays.toast("Recording: knob and fader moves become automation", 1800);
    this.renderHeader();
  }

  /** Big 4-3-2-1 on screen, timed to the clicks. */
  private showCountIn(start: number, beats: number) {
    const el = h("div", { class: "count-in" });
    document.body.appendChild(el);
    const beat = (start - this.engine.ctx.currentTime - 0.0) / beats;
    const t0 = this.engine.ctx.currentTime;
    const tick = () => {
      const left = start - this.engine.ctx.currentTime;
      if (left <= 0 || !this.engine.playing) { el.remove(); return; }
      const n = Math.min(beats, Math.ceil(left / beat));
      if (el.textContent !== String(n)) { el.textContent = String(n); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
      requestAnimationFrame(tick);
    };
    void t0;
    tick();
  }

  private recordNote(pitch: number, vel: number, on: boolean, perfMs: number) {
    const track = this.track();
    if (!track) return;
    const heard = this.engine.heardTime(perfMs);
    const pos = this.engine.tickAtHeard(heard);
    if (!pos) return;
    if (on) { this.recPending.set(pitch, { sceneId: pos.sceneId, tick: pos.tick, vel }); return; }
    const start = this.recPending.get(pitch);
    if (!start) return;
    this.recPending.delete(pitch);
    const clip = ensureClip(this.song, track, start.sceneId);
    const clipTicks = clip.bars * TICKS_PER_BAR;
    let len = pos.tick - start.tick;
    if (pos.sceneId !== start.sceneId || len <= 0) len = this.grid();
    const note = { pitch, start: ((Math.round(start.tick) % clipTicks) + clipTicks) % clipTicks, len: Math.max(6, Math.round(len)), vel: start.vel };
    if (track.kind === "drums") note.len = this.grid();
    if (this.settings.recQuantize) {
      quantizeNotes([note as never], this.grid());
      note.start %= clipTicks;
    }
    addNote(this.song, clip, note);
    this.changed(false);
    this.screens[this.screenName]?.render();
  }

  private finishRecording() {
    // Notes still held when recording stops get one grid step.
    for (const [pitch] of this.recPending) this.recordNote(pitch, 0, false, performance.now());
    this.recPending.clear();
  }

  grid(): number {
    return this.ed.triplet ? (this.ed.grid * 2) / 3 : this.ed.grid;
  }

  // ------------------------------------------------------------ note input

  /** All live notes (computer keys, on-screen keys/pads, MIDI) go through here. */
  noteInput(pitch: number, vel: number, on: boolean, perfMs = performance.now(), trackOverride?: Track) {
    const track = trackOverride ?? this.selectedTrack();
    if (!track) return;
    if (on) this.engine.noteOn(track.id, pitch, vel);
    else this.engine.noteOff(track.id, pitch);
    if (this.screenName !== "edit" || track.id !== this.ed.trackId || this.locked) return;
    if (this.recording && this.engine.playing) this.recordNote(pitch, vel, on, perfMs);
    else if (this.ed.stepInput && !this.engine.playing) this.stepNote(track, pitch, vel, on);
  }

  private stepNote(track: Track, pitch: number, vel: number, on: boolean) {
    const clip = this.song.tracks.find((t) => t.id === track.id)!.clips[this.ed.sceneId];
    if (on) {
      if (this.stepHeld === 0) { this.history.push(this.song, "Step input"); this.stepChordTick = this.ed.stepTick; }
      this.stepHeld++;
      const c = clip ?? ensureClip(this.song, track, this.ed.sceneId);
      addNote(this.song, c, { pitch, start: this.stepChordTick, len: this.grid(), vel });
      this.changed(false);
    } else if (this.stepHeld > 0) {
      this.stepHeld--;
      if (this.stepHeld === 0) {
        const c = ensureClip(this.song, track, this.ed.sceneId);
        this.ed.stepTick = (this.stepChordTick + this.grid()) % (c.bars * TICKS_PER_BAR);
        this.ed.tick = this.ed.stepTick;
      }
    }
    this.screens.edit.render();
  }

  private musicKeyPitch: Map<string, number> = new Map();

  musicKey(k: MusicKey, on: boolean) {
    const id = `${k.row}${k.index}`;
    if (!on) {
      const p = this.musicKeyPitch.get(id);
      if (p !== undefined) { this.musicKeyPitch.delete(id); this.noteInput(p, 0, false); }
      return;
    }
    const track = this.selectedTrack();
    if (!track) return;
    let pitch: number;
    if (track.kind === "drums") {
      if (k.row !== "low" || k.index > 7) return;
      pitch = DRUM_BASE_NOTE + k.index;
    } else if (this.settings.scaleLock) {
      const steps = scaleById(this.song.scale).steps;
      const deg = k.index + (k.row === "high" ? steps.length : 0);
      pitch = (this.ed.octave + 1) * 12 + this.song.key + steps[deg % steps.length] + 12 * Math.floor(deg / steps.length);
    } else {
      if (k.chromatic < 0) return;
      pitch = (this.ed.octave + 1) * 12 + k.chromatic;
    }
    this.musicKeyPitch.set(id, pitch);
    this.noteInput(pitch, 100, true);
  }

  private midiHeld = new Map<number, number>();

  private midiKey(pitch: number, vel: number, on: boolean, t: number) {
    const track = this.selectedTrack();
    if (!track) return;
    // Remember what each key played, so note-off matches even if lock changes mid-hold.
    let p = pitch;
    if (on) {
      if (track.kind === "drums") p = DRUM_BASE_NOTE + ((((pitch - DRUM_BASE_NOTE) % 8) + 8) % 8);
      else if (this.settings.scaleLock) p = snapToScale(pitch, this.song.key, this.song.scale);
      this.midiHeld.set(pitch, p);
    } else {
      p = this.midiHeld.get(pitch) ?? pitch;
      this.midiHeld.delete(pitch);
    }
    this.noteInput(p, vel, on, t);
  }

  private midiPad(index: number, vel: number, on: boolean, t: number) {
    const track = this.selectedTrack();
    if (track?.kind === "drums") {
      this.noteInput(DRUM_BASE_NOTE + (index % 8), vel, on, t);
      return;
    }
    // Other tracks: pads launch scenes.
    if (!on) return;
    const scene = this.song.scenes[index];
    if (!scene) return;
    if (this.screenName === "song") this.songCur.row = index;
    else this.ed.sceneId = scene.id;
    if (this.engine.playing && this.songMode === "scene") this.engine.queue({ kind: "scene", sceneId: scene.id });
    else if (!this.engine.playing) this.engine.play({ kind: "scene", sceneId: scene.id });
    this.refresh();
  }

  private macro(i: number, v: { abs?: number; delta?: number }) {
    const track = this.selectedTrack();
    if (!track) return;
    const id = INSTRUMENTS[track.kind].macros[i];
    const p = paramDef(track.kind, id);
    if (!p) return;
    if (v.abs !== undefined) this.setParam(track, id, fromUnit(p, v.abs));
    else this.nudgeParam(track, id, v.delta ?? 0);
  }

  private trackVolume(i: number, v: { abs?: number; delta?: number }) {
    const t = this.song.tracks[i];
    if (!t || this.locked) return;
    // Through setParam, so the move is recorded as volume automation while recording.
    this.setParam(t, "mix:vol", Math.max(0, Math.min(1, v.abs ?? t.volume + (v.delta ?? 0) * 0.01)));
    this.overlays.toast(`${t.name} ${i + 1} volume ${Math.round(t.volume * 100)}`, 700);
  }

  // ------------------------------------------------------------ dispatch

  dispatch(a: Action) {
    if (this.overlays.handle(a)) return;
    switch (a.type) {
      case "play": if (this.screenName !== "dice") { this.togglePlay(); return; } break;
      case "record": if (this.screenName !== "dice") { this.toggleRecord(); return; } break;
      case "undo": this.undo(); return;
      case "redo": this.redo(); return;
      case "octave": this.ed.octave = Math.max(0, Math.min(7, this.ed.octave + a.d)); this.overlays.toast(`Octave ${this.ed.octave}`, 700); this.screens[this.screenName]?.render(); return;
      case "screen": if (this.screenName !== "dice") this.show(a.to); return;
      case "system": this.openSystemMenu?.(); return;
      case "shortcut": if (a.down) this.openShortcut?.(); return;
    }
    this.screens[this.screenName]?.handle(a);
  }

  openSystemMenu?: () => void;
  openShortcut?: () => void;
  songSettings?: () => void;

  addTrackOf(kind: Track["kind"], preset: number): Track | null {
    const t = addTrack(this.song, kind, preset);
    if (t) ensureClip(this.song, t, this.currentSceneId());
    return t;
  }

  // ------------------------------------------------------------ timer

  startTimer(minutes: number) {
    this.timer = { total: minutes * 60, endsAt: minutes ? performance.now() + minutes * 60000 : 0, running: minutes > 0, done: false };
    this.locked = false;
  }

  timeLeft(): number {
    return this.timer.running ? Math.max(0, (this.timer.endsAt - performance.now()) / 1000) : 0;
  }

  onTimeUp?: () => void;

  private tickTimer() {
    if (!this.timer.running) return;
    if (performance.now() >= this.timer.endsAt) {
      this.timer.running = false;
      this.timer.done = true;
      this.locked = true;
      if (this.recording) { this.finishRecording(); this.recording = false; }
      this.renderHeader();
      this.onTimeUp?.();
    }
  }

  unlock() {
    this.locked = false;
    this.renderHeader();
  }

  // ------------------------------------------------------------ persistence

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(SONG_KEY, JSON.stringify(this.song)); } catch { /* storage full or blocked */ }
    }, 400) as unknown as number;
  }

  static savedSong(): Song | null {
    try {
      const s = localStorage.getItem(SONG_KEY);
      return s ? normalizeSong(JSON.parse(s) as Song) : null;
    } catch { return null; }
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
  }

  private loadSettings() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) Object.assign(this.settings, JSON.parse(s));
    } catch { /* ignore */ }
  }
}

export const STEP_GRIDS = [
  { label: "1/8", grid: PPQ / 2 },
  { label: "1/16", grid: PPQ / 4 },
];
