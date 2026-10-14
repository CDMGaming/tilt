// "First song in 5 minutes": a coach that watches what you do. Each step ends when you
// actually do the thing (no Next button); the instruction runs across the dot-matrix
// display (a small card on phones), a soft spotlight sits on the target, and the hints
// follow the input you last used (mouse, keyboard, gamepad, touch). Skip does a step for
// you; Later keeps your place (TILT menu → First song tutorial picks it up again).

import { songFromSetup } from "../engine/dice";
import { PPQ, type Song, type Track } from "../engine/model";
import { addNote, duplicateScene, ensureClip } from "../engine/songops";
import type { App } from "./app";
import { h } from "./dom";
import { listLibrary, saveToLibrary } from "./library";
import { isPhone } from "./phone";
import { STORE_PREFIX } from "./storage";

const KEY = STORE_PREFIX + "tutorial.v1";
export const TUTORIAL_TITLE = "My first song";

type Input = "mouse" | "keyboard" | "gamepad" | "touch";
interface Saved { step: number; libId?: string; finished?: boolean; dismissed?: boolean }

function load(): Saved | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as Saved : null; } catch { return null; }
}
function store(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------- the last input used

let lastInput: Input | null = null;
function watchInput() {
  window.addEventListener("pointerdown", (e) => (lastInput = e.pointerType === "mouse" ? "mouse" : "touch"), true);
  window.addEventListener("keydown", () => (lastInput = "keyboard"), true);
}
function pollGamepad() {
  for (const p of navigator.getGamepads?.() ?? []) if (p?.buttons.some((b) => b.pressed) || p?.axes.some((a) => Math.abs(a) > 0.5)) { lastInput = "gamepad"; return; }
}
const input = (): Input => lastInput ?? (isPhone() ? "touch" : "mouse");

/** Pick the hint for the input in use. */
const by = (m: string, k: string, g: string, t: string) => ({ mouse: m, keyboard: k, gamepad: g, touch: t })[input()];

// ---------------------------------------------------------------- the steps

const KICK = 36;
const KICK_TICKS = [0, PPQ, PPQ * 2, PPQ * 3]; // steps 1, 5, 9, 13

interface Ctx { app: App; song: Song; drums: Track; bass: Track; lead: Track; cutoff0: number }
interface Step {
  /** Short, for the dot-matrix display. */
  dmd: (c: Ctx) => string;
  /** The longer line on the card. */
  card: (c: Ctx) => string;
  target: (c: Ctx) => Element | null;
  enter?: (c: Ctx) => void;
  done: (c: Ctx) => boolean;
  /** Skip: do it for them, so the later steps still make sense. */
  auto?: (c: Ctx) => void;
  /** Where the card goes when the target is big (the piano roll): away from where you'll click. */
  cardAt?: "top" | "bottom";
}

const q = (sel: string) => document.querySelector(sel);
const firstOf = (...sels: string[]) => { for (const s of sels) { const e = q(s); if (e && (e as HTMLElement).offsetParent !== null) return e; } return null; };
const clipNotes = (c: Ctx, t: Track, sceneIdx: number) => t.clips[c.song.scenes[sceneIdx]?.id]?.notes.length ?? 0;
const openClip = (c: Ctx, t: Track, sceneIdx: number, focus: "roll" | "panel" = "roll") => {
  const s = c.song.scenes[sceneIdx];
  if (!s) return;
  ensureClip(c.song, t, s.id);
  c.app.ed.trackId = t.id;
  c.app.ed.sceneId = s.id;
  c.app.ed.focus = focus;
  c.app.ed.layout = "split";
  c.app.show("edit");
};
const kicksIn = (c: Ctx) => KICK_TICKS.every((tk) => c.drums.clips[c.song.scenes[0].id]?.notes.some((n) => n.pitch === KICK && n.start === tk));

const STEPS: Step[] = [
  {
    dmd: () => by("CLICK PLAY", "PRESS SPACE TO PLAY", "PRESS Y TO PLAY", "TAP PLAY"),
    card: () => "Start the loop. It stays running while you build the song.",
    target: () => firstOf("[data-coach=play]", ".rail-btn.play"),
    done: (c) => c.app.engine.playing,
    auto: (c) => c.app.playLocal(),
  },
  {
    dmd: () => by("CLICK THE 4 KICK OUTLINES", "ARROWS + ENTER ON THE 4 OUTLINES", "D-PAD + A ON THE 4 OUTLINES", "TAP THE 4 KICK OUTLINES"),
    card: () => "Four on the floor: a kick on steps 1, 5, 9 and 13. The outlines on the Kick row show where.",
    target: () => firstOf(".roll-canvas"),
    cardAt: "top", // the Kick row is the bottom row
    enter: (c) => { openClip(c, c.drums, 0); c.app.ed.pitch = KICK; },
    done: kicksIn,
    auto: (c) => { const clip = ensureClip(c.song, c.drums, c.song.scenes[0].id); for (const tk of KICK_TICKS) addNote(c.song, clip, { pitch: KICK, start: tk, len: PPQ / 4, vel: 110 }); },
  },
  {
    dmd: () => by("CLICK > FOR THE BASS", "HOLD ` AND PICK SQUELCH", "HOLD LB AND PICK SQUELCH", "TAP > FOR THE BASS"),
    card: () => "Next instrument: Squelch, the bass. The arrows by the instrument's name switch tracks.",
    target: () => firstOf(".editor .tb-track"),
    done: (c) => c.app.screenName === "edit" && c.app.ed.trackId === c.bass.id,
    auto: (c) => openClip(c, c.bass, 0),
  },
  {
    dmd: () => "ADD 3 BASS NOTES",
    card: () => `Scale lock keeps you in C minor: the striped rows are out of key and the keyboard only plays notes in the scale. ${by("Click", "Arrow + Enter", "Press A", "Tap")} to add three notes, anywhere.`,
    target: () => firstOf(".roll-canvas"),
    enter: (c) => openClip(c, c.bass, 0),
    done: (c) => clipNotes(c, c.bass, 0) >= 3,
    auto: (c) => { const clip = ensureClip(c.song, c.bass, c.song.scenes[0].id); [[36, 0], [39, PPQ * 1.5], [43, PPQ * 2.5]].forEach(([p, s]) => addNote(c.song, clip, { pitch: p, start: s, len: PPQ / 2, vel: 100 })); },
  },
  {
    dmd: () => by("DRAG THE CUTOFF KNOB", "TAB, THEN , . ON CUTOFF", "RB, RIGHT STICK ON CUTOFF", "DRAG CUTOFF UP OR DOWN"),
    card: () => "Cutoff opens and closes the filter: dark and round, or bright and squelchy. Turn it while it plays.",
    target: () => firstOf(".panel [data-param=cutoff]"),
    enter: (c) => { openClip(c, c.bass, 0, isPhone() ? "panel" : "roll"); c.cutoff0 = c.bass.params.cutoff ?? 500; },
    done: (c) => Math.abs((c.bass.params.cutoff ?? 500) - c.cutoff0) > c.cutoff0 * 0.15,
    auto: (c) => c.app.setParam(c.bass, "cutoff", Math.min(6000, (c.bass.params.cutoff ?? 500) * 2.5), true),
  },
  {
    dmd: (c) => c.app.screenName !== "song" ? by("CLICK SONG", "PRESS F2 FOR SONG", "START, THEN SONG SCREEN", "TAP SONG") : by("RIGHT-CLICK SCENE 1: DUPLICATE", "M ON SCENE 1: DUPLICATE", "X ON SCENE 1: DUPLICATE", "HOLD SCENE 1: DUPLICATE"),
    card: () => "A song is scenes in a row. Copy scene 1 into a second scene: same parts, ready to change.",
    target: (c) => c.app.screenName !== "song" ? firstOf("[data-coach=tab-song]", ".rail-screens .rail-btn") : firstOf(".song-grid .scene-head"),
    done: (c) => c.song.scenes.length >= 2 && c.song.tracks.some((t) => (t.clips[c.song.scenes[1].id]?.notes.length ?? 0) > 0),
    auto: (c) => { duplicateScene(c.song, 0); c.app.show("song"); },
  },
  {
    dmd: () => by("OPEN SCENE 2 RAZOR, ADD A LEAD", "SCENE 2 RAZOR: ENTER, ADD NOTES", "SCENE 2 RAZOR: A, ADD NOTES", "OPEN SCENE 2 RAZOR, ADD A LEAD"),
    card: () => `Scene 2 gets a lead. Open Razor's cell in scene 2 and add three notes, or record: ${by("Shift+Space", "Shift+Space", "hold Y", "Rec")} and play the keys.`,
    target: (c) => c.app.screenName === "edit" && c.app.ed.trackId === c.lead.id ? firstOf(".roll-canvas") : firstOf(`.cell[data-track="${c.lead.id}"][data-scene="${c.song.scenes[1]?.id}"]`),
    done: (c) => clipNotes(c, c.lead, 1) >= 3,
    auto: (c) => { const s = c.song.scenes[1] ?? c.song.scenes[0]; const clip = ensureClip(c.song, c.lead, s.id); [[67, 0], [70, PPQ], [72, PPQ * 2], [70, PPQ * 3]].forEach(([p, st]) => addNote(c.song, clip, { pitch: p, start: st, len: PPQ / 2, vel: 100 })); },
  },
  {
    dmd: () => by("CLICK SONG BY PLAY, THEN PLAY", "PRESS C FOR SONG, SPACE TO PLAY", "L3 FOR SONG, Y TO PLAY", "TAP SCENE TO SWITCH, THEN PLAY"),
    card: () => "SONG plays the scenes in order (SCENE loops one). Hear the whole thing.",
    target: (c) => c.app.songMode !== "song" ? firstOf("[data-coach=mode]", ".rail-btn.mode-rail") : firstOf("[data-coach=play]", ".rail-btn.play"),
    enter: (c) => { if (c.app.screenName !== "song") c.app.show("song"); },
    done: (c) => c.app.songMode === "song" && c.app.engine.playing,
    auto: (c) => { c.app.stopLocal(); c.app.setSongMode("song"); c.app.songCur.row = 0; c.app.playLocal(); },
  },
];

// ---------------------------------------------------------------- the coach

export class Tutorial {
  private c: Ctx | null = null;
  private step = 0;
  private card: HTMLElement | null = null;
  private spot = h("div", { class: "coach-spot", "aria-hidden": "true" });
  private finale = false;

  constructor(private app: App) {
    watchInput();
    app.frameHooks.push(() => this.tick());
  }

  get active() { return !!this.c; }

  /** Start over with a fresh song, or pick up where you left off. */
  async start(resume = true) {
    const app = this.app, saved = load();
    let song: Song | null = null;
    if (resume && saved && !saved.finished && saved.libId) {
      song = app.song.libId === saved.libId ? app.song : (await listLibrary()).find((e) => e.id === saved.libId)?.song ?? null;
    }
    this.step = song ? saved!.step : 0;
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
    this.c = { app, song: s, drums: kind("drums"), bass: kind("acid"), lead: kind("lead"), cutoff0: 0 };
    store({ step: this.step, libId: s.libId });
    document.body.appendChild(this.spot);
    if (this.step === 0) app.show("song");
    this.enterStep();
  }

  /** Later: hide it all, keep the place. */
  pause() {
    this.teardown();
    this.app.overlays.toast("Tutorial paused: TILT menu → First song tutorial picks it up", 3000);
  }

  private teardown() {
    this.c = null;
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
    store({ step: this.step, libId: c.song.libId });
    this.renderCard();
    this.app.refresh();
  }

  private next() {
    this.step++;
    navigator.vibrate?.(20);
    this.app.overlays.toast(this.step < STEPS.length ? "NICE!" : "SONG BUILT!", 900);
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
    const text = st.dmd(c);
    this.app.coach = { step: n, total, text };
    this.card?.remove();
    this.card = h("div", { class: "coach-card", role: "status" },
      h("div", { class: "coach-head" }, h("span", { class: "coach-badge" }, `FIRST SONG ${n}/${total}`),
        h("div", { class: "coach-dots" }, STEPS.map((_, i) => h("span", { class: "coach-dot" + (i < this.step ? " done" : i === this.step ? " now" : "") })))),
      // Phones have no dot-matrix display: the instruction goes on the card.
      isPhone() ? h("div", { class: "coach-do" }, text) : "",
      h("p", { class: "coach-text" }, st.card(c)),
      h("div", { class: "coach-btns" },
        h("button", { class: "small-btn", onclick: () => this.skip(), title: "Do this step for me" }, "Skip step"),
        h("button", { class: "small-btn", onclick: () => this.pause(), title: "Hide the tutorial; pick it up from the TILT menu" }, "Later")));
    document.body.appendChild(this.card);
  }

  private showFinale() {
    const app = this.app;
    this.finale = true;
    app.coach = { step: STEPS.length, total: STEPS.length, text: "YOUR FIRST SONG!" };
    app.rollGhosts = null;
    this.card?.remove();
    const done = () => { this.finale = false; store({ step: STEPS.length, libId: app.song.libId, finished: true }); this.teardown(); app.overlays.toast(`Saved as “${app.song.title}”`, 2500); };
    this.card = h("div", { class: "coach-card finale", role: "status" },
      h("div", { class: "coach-head" }, h("span", { class: "coach-badge" }, "YOUR FIRST SONG")),
      h("ul", { class: "coach-list" },
        h("li", null, h("b", null, "Saved: "), `it's in Songs as “${app.song.title}”. Every song saves itself.`),
        h("li", null, h("b", null, "Export: "), "TILT menu → Export: WAV, stems or MIDI."),
        h("li", null, h("b", null, "NUDGE: "), "on the setup screen (Dice), a new key, tempo and lineup in one press.")),
      h("div", { class: "coach-btns" }, h("button", { class: "small-btn primary", onclick: done }, "Done")));
    document.body.appendChild(this.card);
    store({ step: STEPS.length, libId: app.song.libId });
    app.refresh();
  }

  private lastText = "";
  private tick() {
    const c = this.c;
    if (!c) return;
    pollGamepad();
    if (c.song !== this.app.song) { this.pause(); return; } // another song was opened
    if (this.finale) { this.place(firstOf("[data-coach=menu]", ".rail-btn.brand")); return; }
    const st = STEPS[this.step];
    if (st.done(c)) { this.next(); return; }
    // The hint follows the input (and the screen, for the two-part steps).
    const text = st.dmd(c);
    if (text !== this.lastText) { this.lastText = text; this.renderCard(); this.app.renderHeader(); }
    this.place(st.target(c), st.cardAt);
  }

  private place(el: Element | null, cardAt?: "top" | "bottom") {
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) { this.spot.style.display = "none"; return; }
    const pad = 6;
    Object.assign(this.spot.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // Keep the card off the target: a small target low on the screen sends it to the top;
    // a big one (the piano roll) follows the step's choice.
    const big = r.width * r.height > innerWidth * innerHeight * 0.3;
    const top = big ? cardAt === "top" : r.top + r.height / 2 > innerHeight / 2;
    this.card?.classList.toggle("at-top", top);
  }
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
}

/** For the TILT menu: what the item says. */
export function tutorialLabel(): string {
  const s = load();
  return s && !s.finished && s.step > 0 ? `🎓 First song tutorial (step ${s.step + 1})…` : "🎓 First song tutorial…";
}
export function tutorialResumable(): boolean { const s = load(); return !!s && !s.finished && s.step > 0; }
