// DICE screen: roll a setup, lock what you like, pick a timer, go.

import { DICE, decodeSetup, encodeSetup, nudge, roll, songFromSetup, type LockKey, type Setup } from "../engine/dice";
import { INSTRUMENTS } from "../engine/instruments";
import { newSong } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { randomSeed } from "../engine/rng";
import type { Action } from "./actions";
import { App, type Screen } from "./app";
import { h } from "./dom";
import { SpatialNav } from "./nav";
import { challengeById } from "../engine/challenges";
import { libraryDialog } from "./library";
import { phraseGridDialog } from "./phrasegrid";
import { dmdText } from "./dmd";

const TIMERS = [0, 10, 20, 30];

export class DiceScreen implements Screen {
  el = h("div", { class: "dice-screen" });
  private nav = new SpatialNav(() => this.el);
  private rolling = 0;
  private shown: Setup;
  /** The die that just got nudged (it gives a little shake). */
  private nudged: LockKey | null = null;

  constructor(private app: App) {
    this.shown = app.dice.setup;
  }

  render() {
    const app = this.app, d = app.dice, s = this.shown;
    const locks = d.locks;
    // A reel per die, its HOLD lamp underneath (lit amber while held). Click / A on a reel toggles HOLD.
    const item = (key: LockKey, label: string, value: string, extra?: HTMLElement) =>
      h("button", { class: `die reel reel-${key}` + (locks[key] ? " locked" : "") + (this.rolling ? " rolling" : "") + (this.nudged === key ? " nudged" : ""), "data-nav": key, "aria-pressed": String(locks[key]), title: `${label}: click to ${locks[key] ? "release" : "hold"}`, onclick: () => { locks[key] = !locks[key]; this.render(); } },
        h("div", { class: "die-label" }, label),
        h("div", { class: "reel-window" }, value ? h("div", { class: "die-value" }, value) : "", extra ?? ""),
        h("div", { class: "hold" + (locks[key] ? " on" : "") }, "HOLD"));
    const saved = App.savedSong();
    this.el.replaceChildren(
      h("div", { class: "dice-head" },
        h("div", { class: "logo" }, dmdText("TILT", { height: 56, slant: 7 })),
        h("div", { class: "tagline" }, "Just a Nudge")),
      h("div", { class: "reels" },
        item("key", "Key", NOTE_NAMES[s.key]),
        item("scale", "Scale", scaleById(s.scale).name),
        item("tempo", "Tempo", `${s.tempo}`, h("div", { class: "die-unit" }, "bpm")),
        item("swing", "Swing", s.swing ? `${s.swing}%` : "straight"),
        item("lineup", "Lineup", "", h("div", { class: "lineup" }, s.lineup.map((l) => h("span", { class: `chip kind-${l.kind}` }, INSTRUMENTS[l.kind].name)))),
        item("presets", "Sounds", "", h("div", { class: "lineup" }, s.lineup.map((l) => h("span", { class: "chip" }, INSTRUMENTS[l.kind].presets[l.preset]?.name ?? "")))),
        item("cards", "Challenges", s.cards?.length ? "" : "none", h("div", { class: "cards" }, (s.cards ?? []).map((c) => h("div", { class: "card" }, challengeById(c)?.text ?? c)))),
      ),
      h("div", { class: "dice-foot" },
        h("div", { class: "code" }, h("span", { class: "die-label" }, "Share code "), h("code", null, encodeSetup(s))),
        h("button", { class: "small-btn", "data-nav": "copy", onclick: () => this.copyCode() }, "Copy code"),
        h("button", { class: "small-btn", "data-nav": "enter", onclick: () => this.enterCode() }, "Enter a friend's code…"),
        saved?.tracks.length ? h("button", { class: "small-btn", "data-nav": "continue", onclick: () => this.continueSaved() }, `Continue “${saved.title}”`) : null,
        h("button", { class: "small-btn", "data-nav": "library", onclick: () => libraryDialog(this.app, { onOpen: () => this.app.show("song") }) }, "Songs…"),
        h("button", { class: "small-btn", "data-nav": "blank", onclick: () => this.blank() }, "Blank song, no dice"),
      ),
      // The bar that's always on screen: roll, nudge, timer, challenges, start.
      h("div", { class: "dice-bar" },
        h("button", { class: "roll-btn", "data-nav": "roll", onclick: () => this.roll() }, "🎲 ROLL", h("small", null, "Y / Space")),
        h("button", { class: "roll-btn nudge-btn", "data-nav": "nudge", onclick: () => this.nudge(), title: "Re-roll one die: the one the cursor is on, or a random unlocked one" }, "NUDGE", h("small", null, "one reel")),
        h("div", { class: "timer-pick" },
          h("div", { class: "die-label" }, "Timer"),
          h("div", { class: "seg" }, TIMERS.map((m) => h("button", { class: "seg-btn" + (d.minutes === m ? " on" : ""), "data-nav": `t${m}`, onclick: () => { d.minutes = m; this.render(); } }, m ? `${m} min` : "Off")))),
        h("div", { class: "timer-pick" },
          h("div", { class: "die-label" }, "Challenges"),
          h("div", { class: "seg" }, [0, 1, 2, 3].map((n) => h("button", { class: "seg-btn" + (d.cards === n ? " on" : ""), "data-nav": `cards${n}`, onclick: () => { d.cards = n; d.locks.cards = false; this.roll(); } }, n ? String(n) : "Off")))),
        h("button", { class: "go-btn", "data-nav": "go", onclick: () => this.start(), title: "Start the jam (Shift+Space / hold Y)" }, h("span", { class: "press-start" }, "PRESS START")),
      ),
    );
    this.nav.paint();
  }

  handle(a: Action): boolean {
    switch (a.type) {
      case "dir": this.nav.move(a.dir); return true;
      case "confirm": this.nav.focused?.click(); return true;
      case "play": this.roll(); return true;
      case "record": this.start(); return true;
    }
    return false;
  }

  enter() { this.shown = this.app.dice.setup; }

  roll() {
    const d = this.app.dice;
    const target = roll(d.setup, d.locks, randomSeed(), d.cards);
    d.setup = target;
    // A short tumble: unlocked dice flicker through random values, then land.
    this.rolling = 8;
    const tick = () => {
      if (--this.rolling <= 0) { this.rolling = 0; this.shown = target; this.render(); return; }
      this.shown = roll(target, d.locks, randomSeed(), d.cards);
      this.render();
      setTimeout(tick, 45 + (8 - this.rolling) * 12);
    };
    tick();
  }

  /** Re-roll one die: the one the cursor is on (gamepad / keys), else a random unlocked one. */
  nudge() {
    const app = this.app, d = app.dice;
    if (this.rolling) return;
    const at = this.nav.focused?.dataset.nav as LockKey | undefined;
    const usable = (k: LockKey) => !d.locks[k] && (k !== "cards" || d.cards > 0);
    let die: LockKey | undefined;
    if (at && DICE.includes(at)) {
      if (!usable(at)) { app.overlays.toast(d.locks[at] ? "That die is locked" : "No challenge cards to nudge", 1000); return; }
      die = at;
    } else {
      const free = DICE.filter(usable);
      if (!free.length) { app.overlays.toast("Everything is locked", 1000); return; }
      die = free[Math.floor(Math.random() * free.length)];
    }
    d.setup = this.shown = nudge(d.setup, die, randomSeed(), d.cards);
    this.nudged = die;
    this.render();
    setTimeout(() => { if (this.nudged === die) { this.nudged = null; this.render(); } }, 450);
  }

  private async copyCode() {
    const code = encodeSetup(this.app.dice.setup);
    try { await navigator.clipboard.writeText(code); this.app.overlays.toast(`Copied ${code}`); }
    catch { prompt("Share code", code); }
  }

  private enterCode() {
    const c = prompt("Paste a share code");
    if (!c) return;
    const s = decodeSetup(c);
    if (!s) { this.app.overlays.toast("That code doesn't decode"); return; }
    this.app.dice.setup = this.shown = s;
    this.render();
  }

  start() {
    const app = this.app;
    if (this.rolling) return;
    const song = songFromSetup(app.dice.setup);
    song.title = `Jam ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${NOTE_NAMES[song.key]} ${scaleById(song.scale).name}`;
    app.engine.stop();
    app.replaceSong(song);
    app.startTimer(0);
    app.songCur = { row: 0, col: 0 };
    app.ed.trackId = song.tracks[0]?.id ?? 0;
    app.ed.sceneId = song.scenes[0].id;
    app.ed.focus = "roll";
    const go = () => {
      app.startTimer(app.dice.minutes);
      app.show(app.song.tracks.some((t) => t.clips[app.song.scenes[0].id]?.notes.length) ? "song" : "edit");
      app.overlays.toast(app.dice.minutes ? `${app.dice.minutes} minutes. Go!  Stuck? Hit the bulb` : "Go!  Stuck? Hit the bulb", 3500);
    };
    // Start from a blank page; the phrase grid waits behind the 💡 Stuck? button
    // (or opens here first if the player turned that on in Settings).
    if (app.settings.gridAtStart) { app.show("song"); phraseGridDialog(app, { onDone: go }); }
    else go();
  }

  private continueSaved() {
    const app = this.app, s = App.savedSong();
    if (!s) return;
    app.replaceSong(s);
    app.startTimer(0);
    app.show("song");
  }

  private blank() {
    const app = this.app;
    const s = newSong();
    s.key = 0;
    s.scale = SCALES[0].id;
    app.replaceSong(s);
    app.startTimer(0);
    app.songCur = { row: -1, col: 0 };
    app.show("song");
  }
}
