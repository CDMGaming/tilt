// "First song in 5 minutes". Two kinds of step:
//  - do it: ends by itself when you do the thing (press play, place the kicks, ...);
//  - explore: never ends by itself; "I'm ready ▶" (or its key) moves on when you are.
// The instruction runs across the dot-matrix display (a card on phones), a soft spotlight
// sits on the target, and the hints follow the input you last used (mouse, keyboard,
// gamepad, touch). Skip does a step for you; Later keeps your place (TILT menu → Controls & tutorial picks it up).

import { songFromSetup } from "../engine/dice";
import { formatParam } from "../engine/instruments";
import { PPQ, chainIndexOf, songChain, type Song, type Track } from "../engine/model";
import { paramInfo } from "../engine/params";
import { wholeSong } from "../engine/timeline";
import { addNote, duplicateScene, ensureClip, loadPreset, presetIndex } from "../engine/songops";
import type { Action } from "./actions";
import type { App } from "./app";
import { h } from "./dom";
import { listLibrary, saveToLibrary } from "./library";
import { isPhone } from "./phone";
import { byInput, pollGamepad, watchInput } from "./lastinput";
import { STORE_PREFIX } from "./storage";

const KEY = STORE_PREFIX + "tutorial.v2";
const OLD_KEY = STORE_PREFIX + "tutorial.v1";
export const TUTORIAL_TITLE = "My first song";

interface Saved { step: number; libId?: string; finished?: boolean; dismissed?: boolean }

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
    // Progress from the 8-step version: the same place in the 9 steps (its cutoff step is now "open SOUND").
    const old = localStorage.getItem(OLD_KEY);
    if (!old) return null;
    const s = JSON.parse(old) as Saved;
    const map = [0, 1, 2, 3, 4, 6, 7, 8, 9];
    return { ...s, step: map[Math.min(s.step, map.length - 1)] };
  } catch { return null; }
}
function store(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

const by = byInput;

// ---------------------------------------------------------------- the steps

const KICK = 36;
const KICK_TICKS = [0, PPQ, PPQ * 2, PPQ * 3]; // steps 1, 5, 9, 13

interface Ctx {
  app: App; song: Song; drums: Track; bass: Track; lead: Track;
  /** The SONG step: which chain steps have played since play was pressed. */
  heard: Set<number>; passDone: boolean;
}
interface Step {
  kind: "do" | "explore";
  /** Short, for the dot-matrix display. */
  dmd: (c: Ctx) => string;
  /** The longer line on the card. */
  card: (c: Ctx) => string;
  target: (c: Ctx) => Element | DOMRect | null;
  enter?: (c: Ctx) => void;
  /** Do-it steps: done when this is true. */
  done?: (c: Ctx) => boolean;
  /** Explore steps: "I'm ready ▶" shows once this is true (always, when missing). */
  ready?: (c: Ctx) => boolean;
  /** Explore steps: does Enter / A mean "I'm ready"? (Not where they add notes.) */
  confirmIsReady?: boolean;
  /** Skip: do it for them, so the later steps still make sense. */
  auto?: (c: Ctx) => void;
  /** Where the card goes when the target is big (the piano roll): away from where you'll click. */
  cardAt?: "top" | "bottom";
  /** Extra links on the card. */
  links?: (c: Ctx) => HTMLElement[];
}

const q = (sel: string) => document.querySelector(sel);
const firstOf = (...sels: string[]) => { for (const s of sels) { const e = q(s); if (e && (e as HTMLElement).offsetParent !== null) return e; } return null; };
const clipNotes = (c: Ctx, t: Track, sceneIdx: number) => t.clips[c.song.scenes[sceneIdx]?.id]?.notes.length ?? 0;
const openClip = (c: Ctx, t: Track, sceneIdx: number, focus: "roll" | "panel" = "roll", layout: "roll" | "split" = "split") => {
  const s = c.song.scenes[sceneIdx];
  if (!s) return;
  ensureClip(c.song, t, s.id);
  c.app.ed.trackId = t.id;
  c.app.ed.sceneId = s.id;
  c.app.ed.focus = focus;
  c.app.ed.layout = layout;
  c.app.show("edit");
};
const kicksIn = (c: Ctx) => KICK_TICKS.every((tk) => c.drums.clips[c.song.scenes[0].id]?.notes.some((n) => n.pitch === KICK && n.start === tk));
/** The sound panel is showing: desktop, any layout but piano-roll-only; phone, the Sound tab. */
const soundOpen = (c: Ctx) => c.app.screenName === "edit" && (isPhone() ? c.app.ed.focus === "panel" : (c.app.ed.layout ?? "split") !== "roll");
/** A scene's whole row (its header and its cells), for the spotlight. */
function rowRect(sceneId: number | undefined): DOMRect | null {
  if (sceneId === undefined) return null;
  const els = [...document.querySelectorAll<HTMLElement>(`.song-grid [data-scene="${sceneId}"]`)].filter((e) => e.offsetParent !== null);
  if (!els.length) return null;
  const rs = els.map((e) => e.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), r = Math.max(...rs.map((x) => x.right)), b = Math.max(...rs.map((x) => x.bottom));
  return new DOMRect(l, t, r - l, b - t);
}
const playingIndex = (c: Ctx) => { const p = c.app.engine.position(); return p && c.app.engine.playMode.kind === "song" ? p.index : -1; };

const STEPS: Step[] = [
  {
    kind: "do",
    dmd: () => by("CLICK PLAY", "PRESS SPACE TO PLAY", "PRESS Y TO PLAY", "TAP PLAY"),
    card: () => "Start the loop. It stays running while you build the song.",
    target: () => firstOf("[data-coach=play]", ".rail-btn.play"),
    done: (c) => c.app.engine.playing,
    auto: (c) => c.app.playLocal(),
  },
  {
    kind: "do",
    dmd: () => by("CLICK THE 4 KICK OUTLINES", "ARROWS + ENTER ON THE 4 OUTLINES", "D-PAD + A ON THE 4 OUTLINES", "TAP THE 4 KICK OUTLINES"),
    card: () => "Four on the floor: a kick on steps 1, 5, 9 and 13. The outlines on the Kick row show where.",
    target: () => firstOf(".roll-canvas"),
    cardAt: "top", // the Kick row is the bottom row
    enter: (c) => { openClip(c, c.drums, 0, "roll", "roll"); c.app.ed.pitch = KICK; },
    done: kicksIn,
    auto: (c) => { const clip = ensureClip(c.song, c.drums, c.song.scenes[0].id); for (const tk of KICK_TICKS) addNote(c.song, clip, { pitch: KICK, start: tk, len: PPQ / 4, vel: 110 }); },
  },
  {
    kind: "do",
    dmd: () => by("CLICK > FOR THE BASS", "HOLD ` AND PICK SQUELCH", "HOLD LB AND PICK SQUELCH", "TAP > FOR THE BASS"),
    card: () => "Next instrument: Squelch, the bass. The arrows by the instrument's name switch tracks.",
    target: () => firstOf(".editor .tb-track"),
    done: (c) => c.app.screenName === "edit" && c.app.ed.trackId === c.bass.id,
    auto: (c) => openClip(c, c.bass, 0, "roll", "roll"),
  },
  {
    kind: "do",
    dmd: () => "ADD 3 BASS NOTES",
    card: () => `Scale lock keeps you in C minor: the short, striped rows are out of key, and the keyboard only plays notes in the scale. ${by("Click", "Arrow + Enter", "Press A", "Tap")} to add three notes, anywhere.`,
    target: () => firstOf(".roll-canvas"),
    enter: (c) => openClip(c, c.bass, 0, "roll", "roll"),
    done: (c) => clipNotes(c, c.bass, 0) >= 3,
    auto: (c) => { const clip = ensureClip(c.song, c.bass, c.song.scenes[0].id); [[36, 0], [39, PPQ * 1.5], [43, PPQ * 2.5]].forEach(([p, s]) => addNote(c.song, clip, { pitch: p, start: s, len: PPQ / 2, vel: 100 })); },
  },
  {
    kind: "do",
    dmd: () => by("CLICK SOUND", "PRESS \\ FOR SOUND", "HOLD RB FOR SOUND", "TAP SOUND"),
    card: () => `${by("Click", "Press \\ for", "Hold RB for", "Tap")} SOUND to open this instrument's own settings. Every instrument has a different set of knobs.`,
    target: () => firstOf("[data-coach=sound]"),
    enter: (c) => openClip(c, c.bass, 0, "roll", "roll"),
    done: soundOpen,
    auto: (c) => openClip(c, c.bass, 0, isPhone() ? "panel" : "roll", "split"),
  },
  {
    kind: "explore",
    confirmIsReady: true,
    dmd: () => by("TURN A FEW KNOBS", "ARROWS TO A KNOB, , . TURN IT", "D-PAD TO A KNOB, RIGHT STICK TURNS IT", "DRAG A FEW KNOBS"),
    card: () => `Turn a few knobs and listen to how the bass changes. The display shows what each knob is. When you're ready, ${by("click", "press Enter on", "press A on", "tap")} the button to move on.`,
    target: () => firstOf(".editor .panel"),
    // The panel gets the focus, on Cutoff, so a pad's right stick or , . turn something straight away.
    enter: (c) => {
      if (!soundOpen(c)) openClip(c, c.bass, 0, isPhone() ? "panel" : "roll", "split");
      c.app.ed.focus = "panel";
      c.app.refresh();
      requestAnimationFrame(() => (c.app.screens.edit as unknown as { focusControl?(p: string): void }).focusControl?.("cutoff"));
    },
    links: (c) => [h("button", { class: "link-btn", onclick: () => { c.app.edit("Reset sound", () => loadPreset(c.bass, presetIndex(c.bass))); c.app.overlays.toast("Sound reset", 900); } }, "Reset sound")],
  },
  {
    kind: "do",
    dmd: (c) => c.app.screenName !== "song" ? by("CLICK SONG", "PRESS F2 FOR SONG", "TAP LB, UP, A ON SONG", "TAP SONG")
      : by("RIGHT-CLICK SCENE 1: DUPLICATE SCENE", "M ON SCENE 1: DUPLICATE SCENE", "X ON SCENE 1: DUPLICATE SCENE", "HOLD SCENE 1: DUPLICATE SCENE"),
    card: (c) => c.app.screenName !== "song"
      ? "Now the whole song. Go to the Song screen."
      : "This is the Song screen. Each row is a scene (a section of your song), each column is an instrument. Scene 1 is what you just made. Duplicate it to get a copy you can change, like a second verse.",
    target: (c) => {
      if (c.app.screenName !== "song") return firstOf("[data-coach=tab-song]", ".rail-screens .rail-btn");
      // The scene menu is open: point at Duplicate. Otherwise: the whole row.
      const dup = [...document.querySelectorAll<HTMLElement>(".menu-item")].find((b) => b.textContent?.includes("Duplicate scene"));
      return dup ?? rowRect(c.song.scenes[0]?.id);
    },
    done: (c) => c.song.scenes.length >= 2 && c.song.tracks.some((t) => (t.clips[c.song.scenes[1].id]?.notes.length ?? 0) > 0),
    auto: (c) => { duplicateScene(c.song, 0); c.app.show("song"); },
  },
  {
    kind: "explore",
    dmd: () => "ADD A MELODY. TAKE YOUR TIME",
    card: () => `Scene 2, Razor: add a melody. Draw notes, or play them on your ${by("keyboard (A S D F…)", "keyboard (A S D F…)", "MIDI keyboard or the keys below", "the keys below")} and press record. Take your time.`,
    target: () => firstOf(".roll-canvas"),
    cardAt: "bottom",
    enter: (c) => openClip(c, c.lead, Math.min(1, c.song.scenes.length - 1), "roll", "split"),
    ready: (c) => clipNotes(c, c.lead, Math.min(1, c.song.scenes.length - 1)) >= 1,
    auto: (c) => { const s = c.song.scenes[1] ?? c.song.scenes[0]; const clip = ensureClip(c.song, c.lead, s.id); [[67, 0], [70, PPQ], [72, PPQ * 2], [70, PPQ * 3]].forEach(([p, st]) => addNote(c.song, clip, { pitch: p, start: st, len: PPQ / 2, vel: 100 })); },
  },
  {
    kind: "do",
    dmd: (c) => {
      const k = playingIndex(c);
      if (c.app.songMode === "song" && k >= 0) {
        const chain = songChain(c.song), row = (i: number) => c.song.scenes.findIndex((s) => s.id === chain[i]?.sceneId) + 1;
        return `SCENE ${row(k)} -> SCENE ${row((k + 1) % chain.length)}`;
      }
      return by("CLICK SONG BY PLAY, THEN PLAY", "PRESS C FOR SONG, SPACE TO PLAY", "L3 FOR SONG, Y TO PLAY", "TAP SCENE TO SWITCH, THEN PLAY");
    },
    card: (c) => c.app.songMode === "song" && c.app.engine.playing
      ? "Listen: SONG plays scene 1, then scene 2, and starts again. Each row lights up as it plays."
      : "SCENE loops one scene; SONG plays them all in order. Switch to SONG and play it from the top.",
    target: (c) => {
      const k = playingIndex(c);
      if (c.app.songMode === "song" && k >= 0) return rowRect(songChain(c.song)[k]?.sceneId);
      return c.app.songMode !== "song" ? firstOf("[data-coach=mode]", ".rail-btn.mode-rail") : firstOf("[data-coach=play]", ".rail-btn.play");
    },
    // Nothing mid-loop: stopped, on the Song screen, the cursor on scene 1, the song set to loop.
    enter: (c) => { c.app.stopLocal(); c.app.show("song"); c.app.songCur = { row: 0, col: -1 }; c.song.songLoop = true; c.heard.clear(); c.passDone = false; c.app.refresh(); },
    // Done once the song has played all the way through (it keeps looping).
    done: (c) => c.passDone,
    auto: (c) => { c.app.stopLocal(); c.song.songLoop = true; c.app.setSongMode("song"); c.app.engine.play({ kind: "song", fromIndex: 0 }); c.passDone = true; },
  },
];

// ---------------------------------------------------------------- the coach

export class Tutorial {
  private c: Ctx | null = null;
  private step = 0;
  private card: HTMLElement | null = null;
  private spot = h("div", { class: "coach-spot", "aria-hidden": "true" });
  private finale = false;
  /** Knob watching (the explore step): the last values, and a name/value line shown for a moment. */
  private knobs = new Map<string, number>();
  private knobLine: { text: string; until: number } | null = null;

  constructor(private app: App) {
    watchInput();
    app.frameHooks.push(() => this.tick());
    // "I'm ready" from the keyboard / pad: Ctrl+Enter or R3 on every explore step, Enter / A where they don't add notes.
    app.actionHook = (a: Action) => {
      if (!this.c || this.finale) return false;
      const st = STEPS[this.step];
      if (st.kind !== "explore" || !(st.ready?.(this.c) ?? true)) return false;
      if (a.type === "aux" || (a.type === "confirm" && st.confirmIsReady && !this.app.overlays.open)) { this.next(); return true; }
      return false;
    };
  }

  get active() { return !!this.c; }

  /** Start over with a fresh song, or pick up where you left off. */
  async start(resume = true) {
    const app = this.app, saved = load();
    let song: Song | null = null;
    if (resume && saved && !saved.finished && saved.libId) {
      song = app.song.libId === saved.libId ? app.song : (await listLibrary()).find((e) => e.id === saved.libId)?.song ?? null;
    }
    this.step = song ? Math.min(saved!.step, STEPS.length) : 0;
    if (!song) {
      song = songFromSetup({ key: 0, scale: "minor", tempo: 100, swing: 0, lineup: [{ kind: "drums", preset: 0 }, { kind: "acid", preset: 0 }, { kind: "lead", preset: 0 }] });
      song.title = TUTORIAL_TITLE;
    }
    app.engine.stop();
    if (song !== app.song) app.replaceSong(song);
    app.songMode = "scene";
    app.songCur = { row: 0, col: -1 };
    await saveToLibrary(app.song);
    const s = app.song, kind = (k: Track["kind"]) => s.tracks.find((t) => t.kind === k) ?? s.tracks[0];
    this.c = { app, song: s, drums: kind("drums"), bass: kind("acid"), lead: kind("lead"), heard: new Set(), passDone: false };
    store({ step: this.step, libId: s.libId });
    document.body.appendChild(this.spot);
    if (this.step === 0) app.show("song");
    this.enterStep();
  }

  /** Later: hide it all, keep the place. The music stops with it. */
  pause() {
    this.app.stopLocal();
    this.teardown();
    this.app.overlays.toast("Tutorial paused: TILT menu → Controls & tutorial picks it up", 3000);
  }

  private teardown() {
    this.c = null;
    this.finale = false;
    this.card?.remove();
    this.card = null;
    this.spot.remove();
    this.app.coach = null;
    this.app.rollGhosts = null;
    this.app.refresh();
  }

  private enterStep() {
    const c = this.c!;
    c.song = this.app.song;
    if (this.step >= STEPS.length) { this.showFinale(); return; }
    const st = STEPS[this.step];
    st.enter?.(c);
    this.app.rollGhosts = this.step === 1 ? { trackId: c.drums.id, sceneId: c.song.scenes[0].id, notes: KICK_TICKS.map((t) => ({ pitch: KICK, start: t, len: PPQ / 4 })) } : null;
    this.knobs = new Map(Object.entries(this.app.track()?.params ?? {}));
    this.knobLine = null;
    this.lastKey = "";
    store({ step: this.step, libId: c.song.libId });
    this.renderCard();
    this.app.refresh();
  }

  private next() {
    this.step++;
    navigator.vibrate?.(20);
    if (this.step < STEPS.length) this.app.overlays.toast("NICE!", 900);
    this.enterStep();
  }

  private skip() {
    const c = this.c!, st = STEPS[this.step];
    this.app.edit("Tutorial: skip", () => st.auto?.(c));
    this.next();
  }

  private renderCard() {
    const c = this.c!;
    const st = STEPS[this.step];
    const n = this.step + 1, total = STEPS.length;
    const text = this.knobLine && performance.now() < this.knobLine.until ? this.knobLine.text : st.dmd(c);
    this.app.coach = { step: n, total, text };
    const ready = st.kind === "explore" && (st.ready?.(c) ?? true);
    const readyKey = by("", st.confirmIsReady ? "Enter" : "Ctrl+Enter", st.confirmIsReady ? "A" : "R3", "");
    this.card?.remove();
    this.card = h("div", { class: "coach-card" + (st.kind === "explore" ? " explore" : ""), role: "status" },
      h("div", { class: "coach-head" }, h("span", { class: "coach-badge" }, `FIRST SONG ${n}/${total}`),
        h("div", { class: "coach-dots" }, STEPS.map((_, i) => h("span", { class: "coach-dot" + (i < this.step ? " done" : i === this.step ? " now" : "") })))),
      // Phones have no dot-matrix display: the instruction goes on the card.
      isPhone() ? h("div", { class: "coach-do" }, text) : "",
      h("p", { class: "coach-text" }, st.card(c)),
      st.links ? h("div", { class: "coach-links" }, ...st.links(c)) : "",
      h("div", { class: "coach-btns" },
        ready ? h("button", { class: "small-btn primary coach-ready", onclick: () => this.next() }, "I'm ready ▶", readyKey ? h("small", null, ` ${readyKey}`) : "") : "",
        st.kind === "do" || !ready ? h("button", { class: "small-btn", onclick: () => this.skip(), title: "Do this step for me" }, "Skip step") : "",
        h("button", { class: "small-btn", onclick: () => this.pause(), title: "Hide the tutorial; pick it up from the TILT menu" }, "Later")));
    document.body.appendChild(this.card);
  }

  private showFinale() {
    const app = this.app;
    this.finale = true;
    app.coach = { step: STEPS.length, total: STEPS.length, text: "YOU MADE A SONG!" };
    app.rollGhosts = null;
    this.card?.remove();
    // The song keeps playing: closing the card ends the tutorial, not the music.
    const done = () => { store({ step: STEPS.length, libId: app.song.libId, finished: true }); this.teardown(); app.overlays.toast(`Saved as “${app.song.title}”`, 2500); };
    this.card = h("div", { class: "coach-card finale", role: "status" },
      h("div", { class: "coach-head" }, h("span", { class: "coach-badge" }, "YOU MADE A SONG")),
      h("p", { class: "coach-text" }, "Two scenes, three instruments, playing on a loop. A few things for next time:"),
      h("ul", { class: "coach-list" },
        h("li", null, h("b", null, "Saved: "), `it's in Songs as “${app.song.title}”. Every song saves itself.`),
        h("li", null, h("b", null, "Share: "), "TILT menu → Share gives you a code, a link and a QR code."),
        h("li", null, h("b", null, "Export: "), "TILT menu → Export: WAV, stems or MIDI."),
        h("li", null, h("b", null, "NUDGE: "), "on the setup screen (Dice), a new key, tempo and lineup in one press.")),
      h("div", { class: "coach-btns" }, h("button", { class: "small-btn primary", onclick: done }, "Done")));
    document.body.appendChild(this.card);
    store({ step: STEPS.length, libId: app.song.libId });
    app.refresh();
  }

  private lastKey = "";
  private tick() {
    const c = this.c;
    if (!c) return;
    pollGamepad();
    if (c.song !== this.app.song) { this.pause(); return; } // another song was opened
    if (this.finale) { this.place(rowRect(songChain(c.song)[playingIndex(c)]?.sceneId) ?? firstOf("[data-coach=menu]", ".rail-btn.brand")); return; }
    const st = STEPS[this.step];
    this.watchSong(c);
    this.watchKnobs(c, st);
    if (st.kind === "do" && st.done?.(c)) { this.next(); return; }
    // Redraw the card when what it says changes: the input in use, the screen, a knob, readiness.
    const text = this.knobLine && performance.now() < this.knobLine.until ? this.knobLine.text : st.dmd(c);
    const key = `${text}|${st.card(c)}|${st.kind === "explore" && (st.ready?.(c) ?? true)}`;
    if (key !== this.lastKey) { this.lastKey = key; this.renderCard(); this.app.renderHeader(); }
    this.place(st.target(c), st.cardAt);
  }

  /** The SONG step: once it has played for the whole song's length (it keeps looping), the pass is done. */
  private watchSong(c: Ctx) {
    if (STEPS[this.step] !== STEPS[STEPS.length - 1]) return;
    if (playingIndex(c) < 0 || this.app.songMode !== "song") { c.heard.clear(); this.passFrom = 0; return; }
    if (!this.passFrom) { this.passFrom = performance.now(); this.passMs = wholeSong(c.song).duration * 1000; }
    if (performance.now() - this.passFrom >= this.passMs) c.passDone = true;
  }
  private passFrom = 0;
  private passMs = 0;

  /** The knob step: show each knob's name and value on the display as it's turned. */
  private watchKnobs(c: Ctx, st: Step) {
    if (st !== STEPS[5]) return;
    const t = this.app.track();
    if (!t) return;
    for (const [k, v] of Object.entries(t.params)) {
      const was = this.knobs.get(k);
      if (was !== undefined && was !== v) {
        const def = paramInfo(t, k);
        if (def) this.knobLine = { text: `${def.label.toUpperCase()} ${formatParam(def, v).toUpperCase()}`, until: performance.now() + 1500 };
      }
      this.knobs.set(k, v);
    }
  }

  private place(el: Element | DOMRect | null, cardAt?: "top" | "bottom") {
    const r = el instanceof DOMRect ? el : el?.getBoundingClientRect();
    if (!r || !r.width) { this.spot.style.display = "none"; return; }
    const pad = 6;
    Object.assign(this.spot.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    if (this.card) placeCard(this.card, r, cardAt);
  }
}

/**
 * Put a tutorial card in the screen corner farthest from what it points at, never on top of it or
 * of NUDGE / NEW SONG. A big target (the piano roll) can't be avoided: then the step's choice (top or
 * bottom) and the corner away from the controls that matter.
 */
export function placeCard(card: HTMLElement, target: DOMRect | null, prefer?: "top" | "bottom") {
  if (document.body.classList.contains("phone")) { card.classList.toggle("at-top", !!target && target.top + target.height / 2 > innerHeight / 2); return; }
  const w = card.offsetWidth || 330, hgt = card.offsetHeight || 140, m = 16;
  const bar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 56;
  const keep = [target, ...[".nudge-btn", ".go-btn"].map((q) => document.querySelector(q)?.getBoundingClientRect())]
    .filter((x): x is DOMRect => !!x && x.width > 0 && x.width * x.height < innerWidth * innerHeight * 0.3);
  const spots = [
    { x: m, y: innerHeight - hgt - m }, { x: innerWidth - w - m, y: innerHeight - hgt - m },
    { x: innerWidth - w - m, y: bar + m }, { x: m, y: bar + m },
    { x: (innerWidth - w) / 2, y: bar + m }, { x: (innerWidth - w) / 2, y: innerHeight - hgt - m },
  ];
  const hits = (p: { x: number; y: number }) => keep.some((k) => p.x < k.right + 8 && p.x + w > k.left - 8 && p.y < k.bottom + 8 && p.y + hgt > k.top - 8);
  const cx = target ? target.left + target.width / 2 : innerWidth / 2, cy = target ? target.top + target.height / 2 : innerHeight / 2;
  const big = !!target && target.width * target.height > innerWidth * innerHeight * 0.3;
  const score = (p: { x: number; y: number }) => {
    let d = Math.hypot(p.x + w / 2 - cx, p.y + hgt / 2 - cy);
    if (big && prefer) d += (prefer === "top" ? p.y < innerHeight / 2 : p.y > innerHeight / 2) ? 10000 : 0;
    return d;
  };
  const free = spots.filter((p) => !hits(p));
  const best = (free.length ? free : spots).reduce((a, b) => (score(b) > score(a) ? b : a));
  card.classList.remove("at-top");
  Object.assign(card.style, { left: `${Math.max(m, best.x)}px`, top: `${Math.max(bar + 4, best.y)}px`, right: "auto", bottom: "auto" });
}

/** New here? A card on the setup screen offering the tutorial (never a forced dialog). */
export async function offerTutorial(app: App, tut: Tutorial, host: HTMLElement) {
  const saved = load();
  if (saved?.dismissed || saved?.finished) return;
  if (!saved && (await listLibrary()).length > 0) return; // been here before
  if (host.querySelector(".coach-offer")) return;
  const card = h("div", { class: "coach-offer", role: "complementary" },
    h("div", { class: "coach-badge" }, saved ? "PICK UP WHERE YOU LEFT OFF?" : "NEW TO TILT?"),
    h("div", { class: "coach-offer-title" }, "Your first song in 5 minutes"),
    h("p", { class: "coach-text" }, "Drums, bass and a lead, one step at a time. Skip any step."),
    h("div", { class: "coach-btns" },
      h("button", { class: "small-btn primary", "data-nav": "tutorial", onclick: () => { card.remove(); void tut.start(true); } }, saved ? "Continue" : "Start"),
      h("button", { class: "small-btn", "data-nav": "tutorial-no", onclick: () => { card.remove(); store({ ...(saved ?? { step: 0 }), dismissed: true }); } }, "No thanks")));
  host.appendChild(card);
  // Clear of NUDGE and NEW SONG (it used to sit on them in small windows).
  const keepOut = () => { if (card.isConnected) placeCard(card, null); else removeEventListener("resize", keepOut); };
  requestAnimationFrame(keepOut);
  addEventListener("resize", keepOut);
}

/** For the TILT menu: what the item says. */
export function tutorialLabel(): string {
  const s = load();
  return s && !s.finished && s.step > 0 ? `🎓 First song tutorial (step ${s.step + 1})…` : "🎓 First song tutorial…";
}
export function tutorialResumable(): boolean { const s = load(); return !!s && !s.finished && s.step > 0; }
export function tutorialStatus() { const s = load(); return { step: s?.step ?? 0, finished: !!s?.finished, total: STEPS.length }; }
