// The app: state, the edit/undo pipeline, input routing, recording, step
// input, timer and persistence. Screens render from this state.

import { AudioEngine } from "../engine/audio";
import { History } from "../engine/history";
import { Ownership, applyPatches, invert, scopeOf, type Patch } from "../engine/patches";
import { INSTRUMENTS, drumCount, fromUnit, isDrumKind, paramDef, toUnit } from "../engine/instruments";
import { getParam, paramInfo, setParamValue } from "../engine/params";
import { AUTO_STEP } from "../engine/timeline";
import { DRUM_BASE_NOTE } from "../engine/instruments";
import { PPQ, TICKS_PER_BAR, assignShades, idLanes, normalizeSong, type Song, type Track, songChain, chainIndexOf } from "../engine/model";
import { scaleById, snapToScale } from "../engine/music";
import { addNote, addTrack, clearAutoRange, ensureClip, quantizeNotes, setAutoPoint, stepLength, lengthLabel, splitLength, makeLength } from "../engine/songops";
import { NO_HOLDS, defaultSpec, nudgeSetup, type Holds, type LineupSpec, type Setup } from "../engine/dice";
import { mods, type Action } from "./actions";
import { h } from "./dom";
import { GamepadInput, bindKeyboard, connectedPads, type MusicKey } from "./input";
import { Couch, type Device, type Seat } from "./seats";
import { Online, type RosterSeat } from "./online";
import { Midi } from "./midi";
import { MidiClock, type SyncMode } from "./clock";
import { Push1Surface } from "./push1";
import { OverlayHost } from "./overlay";

export type ScreenName = "dice" | "song" | "edit" | "mix" | "couch";

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

/** Desktop editor: the piano roll only, roll + instrument panel, or the panel only. */
export type EditorLayout = "roll" | "split" | "panel";

export interface EditorState {
  trackId: number;
  sceneId: number;
  focus: "roll" | "panel" | "mix"; // mix: couch mode's per-player volume / FX view
  tick: number;
  pitch: number;
  grid: number; // 24 = 16th, 48 = 8th (before triplet)
  triplet: boolean;
  velView: boolean;
  autoKey: string | null; // automation lane shown under the roll
  viewBars: number; // piano-roll zoom: bars visible (0 = the whole clip)
  scrollTick: number; // piano-roll horizontal scroll (first visible tick)
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
  layout?: EditorLayout; // desktop editor layout (default split)
}

/** Per-player input state that isn't editor state: notes being recorded, held step chords, held keys. */
export interface Scratch {
  recPending: Map<number, { sceneId: number; tick: number; vel: number }>;
  stepHeld: number;
  stepChordTick: number;
  musicKeyPitch: Map<string, number>;
  midiHeld: Map<number, number>;
}

export const newScratch = (): Scratch => ({ recPending: new Map(), stepHeld: 0, stepChordTick: 0, musicKeyPitch: new Map(), midiHeld: new Map() });

export interface Settings {
  notePreview: boolean;
  scaleLock: boolean;
  fold: boolean; // hide out-of-key rows in the piano roll
  countIn: boolean; // one bar of clicks before recording starts from stopped
  gridAtStart: boolean; // open the phrase grid right after START (else it waits behind 💡 Stuck?)
  recQuantize: boolean;
  padLayout: "auto" | "xbox" | "nintendo";
  transport: { play?: { ch: number; cc: number }; record?: { ch: number; cc: number } };
  midiSync: SyncMode; // internal clock, follow external, or auto (follow when clock arrives)
  netName: string; // your name in online games
  /** Game mode: challenge cards, editing locks at zero, extra ball, the TILT flash. Off: TILT is a quick-start DAW. */
  gameMode: boolean;
  /** Share of dice / NUDGE sounds that are generated from recipes, 0..1 (the rest are curated). */
  genShare: number;
  relayUrl: string; // the online server ("" = this computer, port 8787)
  clockOut: string; // MIDI output id to send clock to ("" = off)
  outputDevice: string;
}

import { STORE_PREFIX } from "./storage";
import { saveToLibrary } from "./library";
export { STORE_PREFIX };
const SONG_KEY = STORE_PREFIX + "song.v1";
const SETTINGS_KEY = STORE_PREFIX + "settings.v1";
const DICE_KEY = STORE_PREFIX + "dice.v1";

export interface DiceState { setup: Setup; holds: Holds; spec: LineupSpec; minutes: number; cards: number; v?: number }

/** The setup screen's timer choices (0 = off) and the one a new player starts with. */
export const TIMER_CHOICES = [0, 5, 10, 15, 20];
const DEFAULT_MINUTES = 10;

/** The last setup screen (holds and lineup choices included), or a fresh one: timer off, nothing held. */
function loadDice(): DiceState {
  const fresh = (): DiceState => ({ setup: nudgeSetup(null, NO_HOLDS, defaultSpec()), holds: { ...NO_HOLDS }, spec: defaultSpec(), minutes: DEFAULT_MINUTES, cards: 0, v: 2 });
  try {
    const raw = localStorage.getItem(DICE_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw) as Partial<DiceState>;
    const f = fresh();
    if (!d.setup?.lineup?.length) return f;
    const spec = { ...f.spec, ...(d.spec ?? {}) };
    spec.slots = [...(spec.slots ?? []), ...f.spec.slots].slice(0, f.spec.slots.length);
    spec.presets = [...(spec.presets ?? []), ...f.spec.presets].slice(0, f.spec.presets.length);
    // Before v2 the timer was off by default and offered 10 / 20 / 30: start those at the new default.
    const minutes = d.v === 2 && TIMER_CHOICES.includes(d.minutes ?? -1) ? d.minutes! : DEFAULT_MINUTES;
    return { setup: d.setup, holds: { ...f.holds, ...(d.holds ?? {}) }, spec, minutes, cards: d.cards ?? 0, v: 2 };
  } catch { return fresh(); }
}

export class App {
  engine = new AudioEngine();
  song!: Song;
  history = new History();
  /** Who may edit which track / the shared song (couch and online modes; empty = everyone). */
  owners = new Ownership();
  /** Every accepted local change, as patches (the hook online mode sends from). */
  onLocalPatches: ((patches: Patch[], player: string) => void) | null = null;
  overlays: OverlayHost;
  midi: Midi;
  pad: GamepadInput;
  clock: MidiClock;
  push: Push1Surface | null = null;
  private taps: number[] = [];

  /** Tap tempo (Push button, dialogs): the last few taps set the song tempo. */
  tapTempo() {
    const now = performance.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(now);
    if (this.taps.length >= 3) {
      const iv = this.taps.slice(-6).map((t, i, a) => (i ? t - a[i - 1] : 0)).slice(1);
      const bpm = Math.round(60000 / (iv.reduce((x, y) => x + y, 0) / iv.length));
      this.edit("Tap tempo", () => (this.song.tempo = Math.max(40, Math.min(250, bpm))), { render: false });
      this.renderHeader();
    }
  }
  screens = {} as Record<ScreenName, Screen>;
  screenName: ScreenName = "dice";
  songCur = { row: 0, col: 0 }; // row -1 = track headers, col -1 = scene names
  ed: EditorState = {
    trackId: 0, sceneId: 0, focus: "roll", tick: 0, pitch: 48, grid: 24, triplet: false, velView: false, autoKey: null, viewBars: 0, scrollTick: 0,
    stepInput: false, stepTick: 0, sel: new Set(), selAnchor: null, placing: null, grabbing: false, clipboard: [],
    octave: 3, drumPart: 0, topPitch: 72,
  };
  settings: Settings = { notePreview: true, scaleLock: true, fold: false, countIn: true, gridAtStart: false, recQuantize: true, padLayout: "auto", outputDevice: "", transport: {}, midiSync: "auto", clockOut: "", netName: "", relayUrl: "", gameMode: false, genShare: 0.4 };
  /** The setup screen: the current result, what's held, the lineup spec, the timer (remembered between sessions). */
  dice: DiceState = loadDice();
  timer = { total: 0, endsAt: 0, running: false, done: false };
  locked = false;
  recording = false;
  shortcutOpen = false;
  scratch: Scratch = newScratch();
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
      onKey: (p, v, on, t) => this.input(this.midiDevice(), () => this.midiKey(p, v, on, t)),
      onPad: (i, v, on, t) => this.input(this.midiDevice(), () => this.midiPad(i, v, on, t)),
      onMacro: (i, v) => this.input(this.midiDevice(), () => this.macro(i, v)),
      onTrackVolume: (i, v) => this.input(this.midiDevice(), () => this.trackVolume(i, v)),
      onTransport: () => this.togglePlay(),
      onDevicesChanged: () => this.renderHeader(),
      onCC: (ch, cc, raw, v) => this.input(this.midiDevice(), () => this.onCC(ch, cc, raw, v)) ?? false,
      onRealtime: (b, t) => this.clock.onRealtime(b, t),
      onPush: (port) => {
        this.push?.destroy();
        this.push = port ? new Push1Surface(this, port.out, port.sysex, (fn) => this.input({ kind: "push" }, fn, false)) : null;
        if (port) this.overlays.toast(port.sysex ? "Push 1 connected" : "Push 1 connected (no SysEx permission: its display stays blank)");
        return this.push ? (d, t) => this.input({ kind: "push" }, () => this.push!.onMessage(d, t)) : null;
      },
    });
    this.clock = new MidiClock(this);
    this.pad = new GamepadInput({ action: (a) => this.dispatch(a), musicKey: () => {} });
    const keys: Device = { kind: "keys" };
    bindKeyboard({ action: (a) => this.input(keys, () => this.dispatch(a)), musicKey: (k, on) => this.input(keys, () => this.musicKey(k, on)) }, () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    });
    this.loadSettings();
  }

  get headerEl() { return this.header; }
  get mainEl() { return this.main; }

  async boot(song: Song) {
    this.song = normalizeSong(song);
    this.history.reset(this.song);
    await this.engine.init(song);
    if (this.settings.outputDevice) await this.engine.setOutputDevice(this.settings.outputDevice).catch(() => {});
    this.engine.onEnded = () => { this.recording = false; this.renderHeader(); };
    this.clock.bindOutput();
    // Browsers start audio suspended until the first click or key.
    const resume = () => { if (this.engine.ctx.state !== "running") void this.engine.ctx.resume(); };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    void this.midi.enable();
    const loop = (now: number) => {
      const nin = this.settings.padLayout === "auto" ? null : this.settings.padLayout === "nintendo";
      if (this.couch) {
        // Every gamepad is its own player (or a player waiting to join).
        for (const i of connectedPads()) {
          let gp = this.pads.get(i);
          if (!gp) this.pads.set(i, (gp = new GamepadInput({ action: (a) => this.dispatch(a), musicKey: () => {} }, i)));
          gp.nintendoLayout = nin;
          this.input({ kind: "pad", index: i }, () => gp!.poll(now));
        }
      } else {
        this.pad.nintendoLayout = nin;
        this.pad.poll(now);
      }
      for (const f of this.frameHooks) f(now);
      this.clock.tick();
      this.screens[this.screenName]?.frame?.(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // The countdown runs on its own timer: animation frames pause when the window is hidden.
    setInterval(() => this.tickTimer(), 250);
  }

  // ------------------------------------------------------------ couch mode / seats

  couch: Couch | null = null;
  private pads = new Map<number, GamepadInput>();
  /** The seat whose controller is acting right now (couch mode), or null (solo). */
  actor: Seat | null = null;
  /** The device whose input is being handled. */
  inputDevice: Device = { kind: "keys" };
  private ownersOff = false;

  /** Load a seat's editor, input state and held buttons, saving the current one's. */
  private switchTo(seat: Seat | null) {
    if (seat === this.actor) return;
    if (this.actor) Object.assign(this.actor.mods, mods);
    this.actor = seat;
    if (!seat) return;
    this.ed = seat.ed;
    this.scratch = seat.scratch;
    Object.assign(mods, seat.mods);
    if (seat.id !== "lobby") this.history.player = seat.id;
  }

  /** Run `fn` as this seat, then go back to whoever was acting. */
  as<T>(seat: Seat | null, fn: () => T): T {
    if (!seat || seat === this.actor) return fn();
    const prev = this.actor;
    this.switchTo(seat);
    try { return fn(); } finally { this.switchTo(prev); }
  }

  /** Mouse and touch: stay with this seat until another controller does something. */
  focusSeat(seat: Seat) { this.switchTo(seat); }

  /** Input from a device: in couch mode, handled as the seat that device belongs to. */
  input<T>(device: Device, fn: () => T, interactive = true): T | undefined {
    if (interactive) this.inputDevice = device;
    if (!this.couch) return fn();
    if (this.couch.online) return this.couch.localSeat ? this.as(this.couch.localSeat, fn) : undefined; // every controller here plays your seat
    const seat = this.couch.seatFor(device) ?? this.couch.lobby;
    if (seat === this.couch.lobby) this.couch.lobby.device = device;
    return this.as(seat, fn);
  }

  private midiDevice(): Device { return { kind: "midi", name: this.midi.lastInput }; }

  /** In the lobby (a device nobody has claimed): a press joins the game. */
  private get inLobby() { return !!this.couch && this.actor === this.couch.lobby; }

  private lobbyJoin() {
    const c = this.couch!, d = c.lobby.device;
    const seat = c.join(d);
    if (!seat) return;
    this.overlays.toast(`${seat.id.toUpperCase()} joined (${INSTRUMENTS[this.song.tracks.find((t) => t.id === seat.trackId)!.kind].name})`);
    this.refresh();
  }

  /** A change the app makes for the room (not any one player's): skips ownership, in nobody's undo. */
  systemEdit(label: string, fn: () => void) {
    const p = this.history.player;
    this.ownersOff = true;
    this.history.player = "system";
    try { this.edit(label, fn); } finally { this.ownersOff = false; this.history.player = p; }
  }

  /** Couch mode: the person who started it is P1 (keeping their undo history); others join with a press. */
  startCouch() {
    if (!this.song.tracks.length) { this.overlays.toast("Roll a jam first: couch mode needs instruments"); return; }
    if (this.couch) { this.show("couch"); return; }
    this.overlays.closeAll();
    const c = (this.couch = new Couch(this));
    this.actor = null;
    c.join(this.inputDevice, true);
    this.switchTo(c.seats[0]);
    document.body.classList.add("couch-mode");
    this.show("couch");
  }

  endCouch() {
    const c = this.couch;
    if (!c) return;
    if (c.online && !c.online.closed) { this.onlineEnded(null); return; } // leaving an online game closes the connection too
    const p1 = c.seat("p1") ?? c.seats[0];
    this.switchTo(null);
    if (p1) { this.ed = p1.ed; this.scratch = p1.scratch; }
    this.ed.focus = "roll";
    this.couch = null;
    this.owners.tracks.clear();
    this.owners.conductor = null;
    this.history.player = "p1";
    document.body.classList.remove("couch-mode");
    this.show("song");
  }

  // ------------------------------------------------------------ online games

  /** Players you've muted on this computer only (seat ids): the song isn't changed. */
  localMutes = new Set<string>();

  /** The song as this computer should hear it: muted players' tracks silenced. */
  private soundSong(): Song {
    const c = this.couch;
    if (!c || !this.localMutes.size) return this.song;
    const off = new Set(c.seats.filter((s) => this.localMutes.has(s.id)).map((s) => s.trackId));
    return { ...this.song, tracks: this.song.tracks.map((t) => (off.has(t.id) ? { ...t, mute: true } : t)) };
  }

  toggleListen(seatId: string) {
    if (this.localMutes.has(seatId)) { this.localMutes.delete(seatId); this.couch?.online?.unheard.delete(seatId); }
    else this.localMutes.add(seatId);
    this.engine.sync(this.soundSong());
    this.refresh();
  }

  /** Hear only yourself (or everyone again). */
  soloListen() {
    const c = this.couch;
    if (!c) return;
    const others = c.seats.filter((s) => !c.isLocal(s)).map((s) => s.id);
    const allMuted = others.every((id) => this.localMutes.has(id));
    this.localMutes.clear();
    if (!allMuted) for (const id of others) this.localMutes.add(id);
    if (allMuted) this.couch?.online?.unheard.clear();
    this.engine.sync(this.soundSong());
    this.refresh();
  }

  private relayUrl() { return this.settings.relayUrl || defaultRelayUrl(); }

  /** Host an online game with this song: you are P1 and the conductor. Resolves with the room code. */
  async hostOnline(): Promise<string> {
    if (!this.song.tracks.length) throw "Roll a jam first: an online game needs instruments";
    if (this.couch) this.endCouch();
    const net = new Online(this, this.settings.netName || "Host");
    await net.connect(this.relayUrl(), { create: true });
    const c = (this.couch = new Couch(this));
    c.online = net;
    this.actor = null;
    const me = c.join({ kind: "net", peer: net.myId, name: net.name }, true)!;
    c.localId = me.id;
    idLanes.lanes = 8;
    idLanes.lane = me.slot;
    this.switchTo(me);
    this.onLocalPatches = (patches) => net.send({ t: "patches", patches });
    document.body.classList.add("couch-mode");
    this.show("couch");
    return net.room;
  }

  /** Join a friend's game: their song replaces the one open here (yours is in the library). */
  async joinOnline(code: string): Promise<void> {
    if (this.couch) this.endCouch();
    const net = new Online(this, this.settings.netName || "Guest");
    await net.connect(this.relayUrl(), { room: code });
    // The song arrives as a snapshot (joinedOnline).
    this.pendingNet = net;
    setTimeout(() => { if (this.pendingNet === net) { net.close(); this.pendingNet = null; this.overlays.toast("The host didn't answer", 4000, { error: true }); } }, 8000);
  }
  private pendingNet: Online | null = null;

  /** Guest: the host's song and seating arrived. */
  joinedOnline(net: Online, song: Song, seats: RosterSeat[], conductor: string, sceneId: number) {
    this.pendingNet = null;
    this.engine.stop();
    delete song.libId; // your own copy, saved in your library as its own song
    this.replaceSong(song);
    const c = (this.couch = new Couch(this));
    c.online = net;
    c.sceneId = sceneId;
    this.actor = null;
    net.applyRoster(seats, conductor);
    const me = c.localSeat;
    if (me) { this.ed = me.ed; this.switchTo(me); }
    this.onLocalPatches = (patches) => net.send({ t: "patches", patches });
    document.body.classList.add("couch-mode");
    this.show("couch");
    this.overlays.toast(`Joined game ${net.room}`);
  }

  /** Apply another player's change: into the song and the audio, in nobody's undo here. */
  applyRemote(patches: Patch[], from: Seat | null) {
    this.history.remote(this.song, patches);
    assignShades(this.song);
    this.fixCursors();
    this.engine.sync(this.soundSong());
    this.scheduleSave();
    (this.screens.couch as Screen & { remoteChanged?(p: Patch[], s: Seat | null): void }).remoteChanged?.(patches, from);
    this.renderHeader();
  }

  remoteCursor(seat: Seat, viewChanged: boolean) {
    (this.screens.couch as Screen & { remoteCursor?(s: Seat, v: boolean): void }).remoteCursor?.(seat, viewChanged);
  }

  /** Leave (or, as host, end) the online game. The song stays on this computer. */
  leaveOnline() {
    this.couch?.online?.close();
    this.onlineEnded(null);
  }

  onlineEnded(why: string | null) {
    if (!this.couch?.online) return;
    this.couch.online.close();
    this.couch.online.closed = true;
    this.onLocalPatches = null;
    idLanes.lanes = 1;
    idLanes.lane = 0;
    this.localMutes.clear();
    this.stopLocal();
    this.endCouch();
    if (why) this.overlays.toast(why, 4000, { error: true });
  }

  /** On a screen where notes go into a clip (the editor, or couch mode's quarters). */
  get editing() { return this.screenName === "edit" || this.screenName === "couch"; }

  // ------------------------------------------------------------ screens

  show(name: ScreenName) {
    if (this.couch && name !== "couch") {
      // A new jam ends the session; Song / Edit / Mix from inside it (menus, shortcuts, the Push) stay in the quarters.
      if (name === "dice") this.endCouch();
      else name = "couch";
    }
    if (name !== "dice" && !this.song.tracks.length && name === "edit") name = "song";
    this.fixCursors(); // a valid track and scene to show, whatever led here
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
    assignShades(this.song);
    this.commit();
    this.engine.sync(this.soundSong());
    this.scheduleSave();
    if (render) this.refresh();
  }

  /**
   * Turn what just changed into patches and file them under the acting player.
   * A change that touches something the player doesn't own is rolled back whole.
   */
  private commit() {
    const player = this.history.player, patches = this.history.pending(this.song);
    if (!patches.length) return;
    const refused = this.ownersOff ? [] : this.owners.refused(player, patches);
    if (refused.length) {
      applyPatches(this.song, invert(patches));
      assignShades(this.song);
      const shared = refused.some((p) => scopeOf(p, patches) === "shared");
      this.overlays.toast(shared ? `Only ${String(this.owners.conductor).toUpperCase()} (the conductor) can change that` : "That's another player's instrument", 1400);
      return;
    }
    this.history.accept(patches, player);
    this.onLocalPatches?.(patches, player);
  }

  undo() { this.travel("undo"); }
  redo() { this.travel("redo"); }

  private travel(dir: "undo" | "redo") {
    const r = dir === "undo" ? this.history.undo(this.song) : this.history.redo(this.song);
    if (!r) { if (dir === "undo") this.overlays.toast("Nothing to undo"); return; }
    if (r.patches.length) this.onLocalPatches?.(r.patches, this.history.player);
    this.ed.sel.clear();
    this.fixCursors();
    this.changed();
    this.overlays.toast(`${dir === "undo" ? "Undo" : "Redo"}: ${r.label}${r.patches.length ? "" : " (already changed by someone else)"}`);
  }

  replaceSong(song: Song) {
    if (this.couch) this.endCouch(); // a different song: the seats belonged to the old one
    this.song = normalizeSong(song);
    this.history.reset(this.song);
    this.ed.sel.clear();
    this.fixCursors();
    this.changed();
  }

  fixCursors() {
    const s = this.song;
    if (!s.tracks.find((t) => t.id === this.ed.trackId)) this.ed.trackId = s.tracks[0]?.id ?? 0;
    if (!s.scenes.find((x) => x.id === this.ed.sceneId)) this.ed.sceneId = s.scenes[0]?.id ?? 0;
    this.songCur.row = Math.max(-2, Math.min(this.songCur.row, s.scenes.length));
    this.songCur.col = Math.min(this.songCur.col, this.songCur.row === -2 ? songChain(s).length : s.tracks.length);
  }

  track(id = this.ed.trackId): Track | undefined {
    return this.song.tracks.find((t) => t.id === id);
  }

  /** The track that MIDI and the musical keyboard play. */
  selectedTrack(): Track | undefined {
    if (this.screenName === "couch") return this.track();
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
    if (gesture && this.learning) this.noteLearnTarget(track.id, id);
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
    if (p.options || p.unit === "st" || p.unit === "int") v = Math.max(p.min, Math.min(p.max, Math.round(cur) + Math.sign(steps)));
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
    if (this.couch?.online) { this.couch.online.transport(!this.engine.playing); return; } // everyone starts and stops together
    if (this.engine.playing) this.stopLocal();
    else this.playLocal();
  }

  /** Start / stop on this machine only (online games call these at the agreed moment). */
  playLocal() {
    if (this.engine.playing) return;
    this.engine.play(this.playMode());
    this.renderHeader();
  }

  stopLocal() {
    if (!this.engine.playing) return;
    this.engine.stop();
    this.finishRecording();
    this.recording = false;
    this.renderHeader();
  }

  /** On the editor: loop the clip's scene. On the song screen: loop the scene under the cursor, or play the song. */
  songMode: "scene" | "song" = "scene";
  playMode() {
    if (this.songMode === "song") {
      // From the chip under the cursor, or the first step that plays the scene you're on.
      if (this.screenName === "song" && this.songCur.row === -2 && this.songCur.col >= 0) return { kind: "song" as const, fromIndex: Math.min(this.songCur.col, songChain(this.song).length - 1) };
      return { kind: "song" as const, fromIndex: chainIndexOf(this.song, this.currentSceneId()) };
    }
    return { kind: "scene" as const, sceneId: this.currentSceneId(), once: this.song.sceneLoop === false };
  }

  /** Loop: on for the mode in use? SCENE: the scene loops (off: once). SONG: back to the start at the end. */
  loopOn(): boolean { return this.songMode === "song" ? this.song.songLoop : this.song.sceneLoop !== false; }

  toggleLoop() {
    const song = this.song, on = !this.loopOn();
    this.edit(this.songMode === "song" ? "Song loop" : "Scene loop", () => { if (this.songMode === "song") song.songLoop = on; else song.sceneLoop = on; });
    // A scene that's playing picks up the change at its end.
    const pos = this.engine.position();
    if (pos && this.songMode === "scene") this.engine.queue({ kind: "scene", sceneId: pos.sceneId, once: !on });
    this.overlays.toast(this.songMode === "song" ? (on ? "SONG LOOPS" : "SONG PLAYS ONCE") : (on ? "SCENE LOOPS" : "SCENE PLAYS ONCE"), 1200);
  }

  /**
   * SCENE (loop the current scene) or SONG (play the scenes in order). While playing, the
   * switch takes effect at the end of the scene that's playing: SCENE keeps looping it,
   * SONG carries on to the next one.
   */
  setSongMode(m: "scene" | "song") {
    if (this.songMode === m) return;
    this.songMode = m;
    const pos = this.engine.position();
    if (pos) {
      const i = Math.max(0, this.song.scenes.findIndex((s) => s.id === pos.sceneId));
      this.engine.queue(m === "scene" ? { kind: "scene", sceneId: pos.sceneId, once: this.song.sceneLoop === false } : { kind: "song", fromIndex: chainIndexOf(this.song, this.song.scenes[i]?.id ?? pos.sceneId) });
    }
    this.overlays.toast(m === "scene" ? (this.loopOn() ? "SCENE: loops the scene" : "SCENE: plays the scene once") : this.loopOn() ? "SONG: all the scenes, then again" : "SONG: all the scenes, once", 1400);
    this.refresh();
  }

  /** What play does / is doing, for the display: LOOP SCENE 2, SONG 3/6. */
  playState(narrow = false): string {
    const song = this.song, pos = this.engine.position();
    if (this.songMode === "song") {
      const n = songChain(song).length;
      const i = pos && this.engine.playMode.kind === "song" ? pos.index : (this.playMode() as { fromIndex: number }).fromIndex;
      return `SONG ${Math.max(0, i) + 1}/${n}${song.songLoop ? (narrow ? " LP" : " LOOP") : ""}`;
    }
    const id = pos ? pos.sceneId : this.currentSceneId();
    const i = song.scenes.findIndex((s) => s.id === id);
    const loop = song.sceneLoop !== false;
    return narrow ? `SC ${i + 1}${loop ? " LP" : ""}` : loop ? `LOOP SCENE ${i + 1}` : `SCENE ${i + 1} ONCE`;
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
    if (!this.editing && this.screenName !== "mix") { this.overlays.toast("Open a clip (or the mixer) to record"); return; }
    this.history.push(this.song, "Record");
    this.recording = true;
    if (this.couch?.online && !this.engine.playing) {
      // Online: everyone's loop starts together (no count-in); your playing records into your clip.
      this.couch.online.transport(true);
      this.renderHeader();
      return;
    }
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
    if (on) { this.scratch.recPending.set(pitch, { sceneId: pos.sceneId, tick: pos.tick, vel }); return; }
    const start = this.scratch.recPending.get(pitch);
    if (!start) return;
    this.scratch.recPending.delete(pitch);
    const clip = ensureClip(this.song, track, start.sceneId);
    const clipTicks = clip.bars * TICKS_PER_BAR;
    let len = pos.tick - start.tick;
    if (pos.sceneId !== start.sceneId || len <= 0) len = this.grid();
    const note = { pitch, start: ((Math.round(start.tick) % clipTicks) + clipTicks) % clipTicks, len: Math.max(6, Math.round(len)), vel: start.vel };
    if (isDrumKind(track.kind)) note.len = this.grid();
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
    for (const [pitch] of this.scratch.recPending) this.recordNote(pitch, 0, false, performance.now());
    this.scratch.recPending.clear();
  }

  grid(): number {
    return this.ed.triplet ? (this.ed.grid * 2) / 3 : this.ed.grid;
  }

  /** How long a new note is on this track: the picker's length, remembered per track (else the grid step). */
  noteLength(track = this.track()): number {
    return track?.noteLen ?? this.grid();
  }

  /** The note-length picker: set this track's length for new notes (a preference: saved, not an undo step). */
  setNoteLength(ticks: number | undefined, track = this.track()) {
    if (!track) return;
    if (ticks === undefined) delete track.noteLen; else track.noteLen = ticks;
    // Shorter than the grid, or a triplet on a straight grid: the grid follows, so the notes fit side by side.
    const parts = ticks === undefined ? null : splitLength(ticks);
    if (parts && parts.mod !== "dot") {
      const step = Math.max(PPQ / 8, Math.min(PPQ / 2, parts.base));
      const tri = parts.mod === "tri";
      if (makeLength(parts.base, parts.mod) < this.grid() || (tri && !this.ed.triplet)) {
        this.ed.grid = step;
        this.ed.triplet = tri;
        this.ed.tick = Math.floor(this.ed.tick / this.grid()) * this.grid();
        this.overlays.toast(`Grid ${lengthLabel(this.grid())} to match`, 1000);
      }
    }
    this.changed();
  }

  // ------------------------------------------------------------ note input

  /** All live notes (computer keys, on-screen keys/pads, MIDI) go through here. */
  noteInput(pitch: number, vel: number, on: boolean, perfMs = performance.now(), trackOverride?: Track) {
    const track = trackOverride ?? this.selectedTrack();
    if (!track) return;
    if (on) { this.engine.noteOn(track.id, pitch, vel); this.flashPad(track, pitch); }
    else this.engine.noteOff(track.id, pitch);
    this.lightKey(track, pitch, on);
    if (!this.editing || track.id !== this.ed.trackId || this.locked) return;
    if (this.recording && this.engine.playing) this.recordNote(pitch, vel, on, perfMs);
    else if (this.ed.stepInput && !this.engine.playing) this.stepNote(track, pitch, vel, on);
  }

  /**
   * Keyboard / MIDI / Push / gamepad notes light the matching key or pad on the open
   * instrument panel while they're held, like playing it with the mouse.
   */
  private lightKey(track: Track, pitch: number, on: boolean) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-panel-track="${track.id}"] [data-note="${pitch}"]`)) el.classList.toggle("lit", on);
  }

  /** Light the matching pad on the open drum panel for a moment. */
  private flashPad(track: Track, pitch: number) {
    if (!this.editing || track.id !== this.ed.trackId || !isDrumKind(track.kind)) return;
    const el = document.querySelector<HTMLElement>(`[data-panel-track="${track.id}"] .pad[data-note="${pitch}"]`);
    if (!el) return;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 120);
  }

  private stepNote(track: Track, pitch: number, vel: number, on: boolean) {
    const clip = this.song.tracks.find((t) => t.id === track.id)!.clips[this.ed.sceneId];
    if (on) {
      if (this.scratch.stepHeld === 0) { this.history.push(this.song, "Step input"); this.scratch.stepChordTick = this.ed.stepTick; }
      this.scratch.stepHeld++;
      const c = clip ?? ensureClip(this.song, track, this.ed.sceneId);
      addNote(this.song, c, { pitch, start: this.scratch.stepChordTick, len: this.noteLength(track), vel });
      this.changed(false);
    } else if (this.scratch.stepHeld > 0) {
      this.scratch.stepHeld--;
      if (this.scratch.stepHeld === 0) {
        const c = ensureClip(this.song, track, this.ed.sceneId);
        this.ed.stepTick = (this.scratch.stepChordTick + this.grid()) % (c.bars * TICKS_PER_BAR);
        this.ed.tick = this.ed.stepTick;
      }
    }
    this.screens[this.screenName]?.render();
  }


  musicKey(k: MusicKey, on: boolean) {
    if (this.inLobby) { if (on) this.lobbyJoin(); return; }
    const id = `${k.row}${k.index}`;
    if (!on) {
      const p = this.scratch.musicKeyPitch.get(id);
      if (p !== undefined) { this.scratch.musicKeyPitch.delete(id); this.noteInput(p, 0, false); }
      return;
    }
    const track = this.selectedTrack();
    if (!track) return;
    let pitch: number;
    if (isDrumKind(track.kind)) {
      if (k.row !== "low" || k.index >= drumCount(track.kind)) return;
      pitch = DRUM_BASE_NOTE + k.index;
    } else if (this.settings.scaleLock) {
      const steps = scaleById(this.song.scale).steps;
      const deg = k.index + (k.row === "high" ? steps.length : 0);
      pitch = (this.ed.octave + 1) * 12 + this.song.key + steps[deg % steps.length] + 12 * Math.floor(deg / steps.length);
    } else {
      if (k.chromatic < 0) return;
      pitch = (this.ed.octave + 1) * 12 + k.chromatic;
    }
    this.scratch.musicKeyPitch.set(id, pitch);
    this.noteInput(pitch, 100, true);
  }


  private midiKey(pitch: number, vel: number, on: boolean, t: number) {
    if (this.inLobby) { if (on) this.lobbyJoin(); return; }
    const track = this.selectedTrack();
    if (!track) return;
    // Remember what each key played, so note-off matches even if lock changes mid-hold.
    let p = pitch;
    if (on) {
      if (isDrumKind(track.kind)) { const n = drumCount(track.kind); p = DRUM_BASE_NOTE + ((((pitch - DRUM_BASE_NOTE) % n) + n) % n); }
      else if (this.settings.scaleLock) p = snapToScale(pitch, this.song.key, this.song.scale);
      this.scratch.midiHeld.set(pitch, p);
    } else {
      p = this.scratch.midiHeld.get(pitch) ?? pitch;
      this.scratch.midiHeld.delete(pitch);
    }
    this.noteInput(p, vel, on, t);
  }

  private midiPad(index: number, vel: number, on: boolean, t: number) {
    if (this.inLobby) { if (on) this.lobbyJoin(); return; }
    const track = this.selectedTrack();
    if (track && isDrumKind(track.kind)) {
      this.noteInput(DRUM_BASE_NOTE + (index % drumCount(track.kind)), vel, on, t);
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

  // ------------------------------------------------------------ MIDI learn

  learning = false;
  learnTarget: { trackId: number; key: string } | null = null;
  learnTransport: "play" | "record" | null = null;
  private learnBanner: HTMLElement | null = null;

  setLearning(on: boolean) {
    this.learning = on;
    this.learnTarget = null;
    this.learnBanner?.remove();
    this.learnBanner = null;
    if (on) {
      this.learnBanner = h("div", { class: "learn-banner" });
      document.body.appendChild(this.learnBanner);
      this.updateLearnBanner();
    }
    this.screens[this.screenName]?.render();
  }

  /** The knob the user just touched (mouse grab, or gamepad focus) becomes the learn target. */
  noteLearnTarget(trackId: number, key: string) {
    if (!this.learning) return;
    this.learnTarget = { trackId, key };
    this.updateLearnBanner();
    for (const el of document.querySelectorAll(".learn-target")) el.classList.remove("learn-target");
    document.querySelector(`[data-track="${trackId}"] [data-param="${key}"], .panel [data-param="${key}"]`)?.classList.add("learn-target");
  }

  private updateLearnBanner() {
    if (!this.learnBanner) return;
    const t = this.learnTarget ? this.song.tracks.find((x) => x.id === this.learnTarget!.trackId) : undefined;
    const label = t ? `${INSTRUMENTS[t.kind].name}: ${paramInfo(t, this.learnTarget!.key)?.label ?? this.learnTarget!.key}` : null;
    this.learnBanner.replaceChildren(
      h("b", null, "MIDI learn"),
      h("span", null, label ? ` → move a control on your MIDI device to bind it to ${label}` : " → touch a knob or fader (mouse, or move the gamepad focus onto it), then move a MIDI control"),
      h("span", { class: "learn-count" }, ` · ${this.song.midiMap?.length ?? 0} binding${this.song.midiMap?.length === 1 ? "" : "s"} in this song`),
      h("button", { class: "mini", onclick: () => { this.edit("Clear MIDI learn", () => (this.song.midiMap = [])); this.updateLearnBanner(); } }, "Clear all"),
      h("button", { class: "mini on", onclick: () => this.setLearning(false) }, "Done"),
    );
  }

  private onCC(ch: number, cc: number, raw: number, v: { abs?: number; delta?: number }): boolean {
    if (this.learnTransport) {
      this.settings.transport[this.learnTransport] = { ch, cc };
      this.saveSettings();
      this.overlays.toast(`CC ${cc} (ch ${ch + 1}) now triggers ${this.learnTransport === "play" ? "play / stop" : "record"}`);
      this.learnTransport = null;
      return true;
    }
    if (this.learning && this.learnTarget) {
      const map = (this.song.midiMap ??= []);
      const b = { ch, cc, ...this.learnTarget };
      this.song.midiMap = map.filter((m) => !(m.ch === ch && m.cc === cc) && !(m.trackId === b.trackId && m.key === b.key));
      this.song.midiMap.push(b);
      this.changed(false);
      const t = this.song.tracks.find((x) => x.id === b.trackId);
      this.overlays.toast(`CC ${cc} → ${t ? INSTRUMENTS[t.kind].name : "?"} ${t ? paramInfo(t, b.key)?.label ?? b.key : b.key}`, 1500);
      this.learnTarget = null;
      this.updateLearnBanner();
      this.screens[this.screenName]?.render();
      return true;
    }
    const tp = this.settings.transport;
    if (tp.play && tp.play.cc === cc && tp.play.ch === ch) { if (raw > 0) this.togglePlay(); return true; }
    if (tp.record && tp.record.cc === cc && tp.record.ch === ch) { if (raw > 0) this.toggleRecord(); return true; }
    const bind = this.song.midiMap?.find((m) => m.ch === ch && m.cc === cc);
    if (!bind) return false;
    const track = this.song.tracks.find((t) => t.id === bind.trackId);
    const def = track && paramInfo(track, bind.key);
    if (!track || !def) return true;
    if (v.abs !== undefined) this.setParam(track, bind.key, fromUnit(def, v.abs));
    else this.nudgeParam(track, bind.key, v.delta ?? 0);
    return true;
  }

  /** Mark knobs that have a MIDI binding (and the current learn target) inside `root`. */
  markLearned(root: HTMLElement, trackId: number) {
    for (const m of this.song.midiMap ?? []) {
      if (m.trackId !== trackId) continue;
      root.querySelector(`[data-param="${m.key}"]`)?.classList.add("learned");
    }
    if (this.learnTarget?.trackId === trackId) root.querySelector(`[data-param="${this.learnTarget.key}"]`)?.classList.add("learn-target");
    root.classList.toggle("learning", this.learning);
  }

  // ------------------------------------------------------------ dispatch

  /** The tutorial gets a look at every action first ("I'm ready" on Enter / A, Ctrl+Enter, R3). */
  actionHook?: (a: Action) => boolean;

  dispatch(a: Action) {
    if (this.inLobby) { if (a.type === "confirm") this.lobbyJoin(); return; }
    if (this.actionHook?.(a)) return;
    if (this.overlays.handle(a)) return;
    if (this.couch && this.screenName === "couch") {
      // F2-F4 would leave the quarters; the system button is the conductor's way into the shared strip.
      if (a.type === "screen") return;
      if (a.type === "system") { this.screens.couch.handle(a); return; }
    }
    switch (a.type) {
      case "play": if (this.screenName !== "dice") { this.togglePlay(); return; } break;
      case "record": if (this.screenName !== "dice") { this.toggleRecord(); return; } break;
      case "undo": this.undo(); return;
      case "redo": this.redo(); return;
      case "octave": this.ed.octave = Math.max(0, Math.min(7, this.ed.octave + a.d)); this.overlays.toast(`Octave ${this.ed.octave}`, 700); this.screens[this.screenName]?.render(); return;
      case "screen": if (this.screenName !== "dice") this.show(a.to); return;
      case "system": this.openSystemMenu?.(); return;
      case "playMode": if (this.screenName !== "dice") this.setSongMode(this.songMode === "scene" ? "song" : "scene"); return;
      case "noteLen": { const t = this.track(); if (t && this.screenName !== "dice") { this.setNoteLength(stepLength(this.noteLength(t), a.d), t); this.overlays.toast(`Note length ${lengthLabel(this.noteLength(t))}`, 800); } return; }
      case "help": this.openHelp?.(); return;
      case "shortcut": if (a.down) this.openShortcut?.(); return;
    }
    this.screens[this.screenName]?.handle(a);
  }

  openSystemMenu?: () => void;
  openHelp?: () => void;
  /** The tutorial: picks up where you left off, or `fresh` starts over. */
  openTutorial?: (fresh?: boolean) => void;
  /** The tutorial's current instruction (the dot-matrix display shows it), or null. */
  coach: { step: number; total: number; text: string } | null = null;
  /** Outlines the piano roll draws where notes should go (the tutorial's kicks), or null. */
  rollGhosts: { trackId: number; sceneId: number; notes: { pitch: number; start: number; len: number }[] } | null = null;
  /** The DICE screen (a new jam): the rail's Dice button and the menu's "New jam". */
  openDice?: () => void;
  openShortcut?: () => void;
  stuck?: () => void;
  toggleScope?: () => void;
  songSettings?: () => void;

  addTrackOf(kind: Track["kind"], preset: number): Track | null {
    const t = addTrack(this.song, kind, preset);
    if (t) ensureClip(this.song, t, this.currentSceneId());
    return t;
  }

  // ------------------------------------------------------------ timer

  /** EXTRA BALL (once per session, from the song-complete screen): two more minutes, unlocked. */
  extraBallUsed = false;
  extraBall() {
    if (this.extraBallUsed) return;
    this.extraBallUsed = true;
    this.startTimer(2);
    this.renderHeader();
    this.overlays.toast("EXTRA BALL: 2 more minutes", 1500);
  }

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
      if (this.recording) { this.finishRecording(); this.recording = false; }
      if (this.settings.gameMode) {
        this.locked = true;
        this.renderHeader();
        this.onTimeUp?.();
        return;
      }
      // Plain timer: playback stops and the display says TIME; you keep working.
      this.stopLocal();
      this.renderHeader();
      this.overlays.toast("TIME", 3000);
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
      // Songs with content also live in the library (assigned an id on first save).
      if (this.song.tracks.length) saveToLibrary(this.song).catch((e) => console.warn("library save failed", e));
    }, 600) as unknown as number;
  }

  static savedSong(): Song | null {
    try {
      const s = localStorage.getItem(SONG_KEY);
      return s ? normalizeSong(JSON.parse(s) as Song) : null;
    } catch { return null; }
  }

  /** Remember the setup screen (holds, lineup spec, timer) for next time. */
  saveDice() {
    try { localStorage.setItem(DICE_KEY, JSON.stringify(this.dice)); } catch { /* storage full or blocked */ }
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

/**
 * Where the online server is when the player hasn't set one: next to the app
 * (wss://<site>/relay, as on Cloudflare Pages), or, on the dev server,
 * the separate relay on port 8787.
 */
export function defaultRelayUrl(): string {
  if (import.meta.env.DEV) return `ws://${location.hostname || "localhost"}:8787`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/relay`;
}
