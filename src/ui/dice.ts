// DICE screen: roll a setup, lock what you like, pick a timer, go.

import { decodeSetup, encodeSetup, roll, songFromSetup, type LockKey, type Setup } from "../engine/dice";
import { INSTRUMENTS } from "../engine/instruments";
import { newSong } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { randomSeed } from "../engine/rng";
import type { Action } from "./actions";
import { App, type Screen } from "./app";
import { h } from "./dom";
import { SpatialNav } from "./nav";
import { libraryDialog } from "./library";
import { phraseGridDialog } from "./phrasegrid";

const TIMERS = [0, 10, 20, 30];
const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export class DiceScreen implements Screen {
  el = h("div", { class: "dice-screen" });
  private nav = new SpatialNav(() => this.el);
  private rolling = 0;
  private shown: Setup;

  constructor(private app: App) {
    this.shown = app.dice.setup;
  }

  render() {
    const app = this.app, d = app.dice, s = this.shown;
    const locks = d.locks;
    const item = (key: LockKey, label: string, value: string, extra?: HTMLElement) =>
      h("button", { class: "die" + (locks[key] ? " locked" : "") + (this.rolling ? " rolling" : ""), "data-nav": key, onclick: () => { locks[key] = !locks[key]; this.render(); } },
        h("div", { class: "die-label" }, label),
        h("div", { class: "die-value" }, value),
        extra ?? null,
        h("div", { class: "die-lock" }, locks[key] ? "🔒 locked" : "🔓"));
    const saved = App.savedSong();
    this.el.replaceChildren(
      h("div", { class: "dice-head" },
        h("div", { class: "logo" }, h("span", { class: "logo-die" }, FACES[(s.tempo + s.key) % 6]), "ROLLBOX"),
        h("div", { class: "tagline" }, "Roll the dice. Beat the clock. Finish the song.")),
      h("div", { class: "dice-grid" },
        item("key", "Key", NOTE_NAMES[s.key]),
        item("scale", "Scale", scaleById(s.scale).name),
        item("tempo", "Tempo", `${s.tempo}`, h("div", { class: "die-unit" }, "bpm")),
        item("swing", "Swing", s.swing ? `${s.swing}%` : "straight"),
        item("lineup", "Lineup", `${s.lineup.length} tracks`, h("div", { class: "lineup" }, s.lineup.map((l) => h("span", { class: `chip kind-${l.kind}` }, INSTRUMENTS[l.kind].name)))),
        item("presets", "Sounds", "", h("div", { class: "lineup" }, s.lineup.map((l) => h("span", { class: "chip" }, INSTRUMENTS[l.kind].presets[l.preset]?.name ?? "")))),
      ),
      h("div", { class: "dice-actions" },
        h("button", { class: "roll-btn", "data-nav": "roll", onclick: () => this.roll() }, "🎲 ROLL", h("small", null, "Y / Space")),
        h("div", { class: "timer-pick" },
          h("div", { class: "die-label" }, "Timer"),
          h("div", { class: "seg" }, TIMERS.map((m) => h("button", { class: "seg-btn" + (d.minutes === m ? " on" : ""), "data-nav": `t${m}`, onclick: () => { d.minutes = m; this.render(); } }, m ? `${m} min` : "Off")))),
        h("button", { class: "go-btn", "data-nav": "go", onclick: () => this.start() }, "START ▶"),
      ),
      h("div", { class: "dice-foot" },
        h("div", { class: "code" }, h("span", { class: "die-label" }, "Share code "), h("code", null, encodeSetup(s))),
        h("button", { class: "small-btn", "data-nav": "copy", onclick: () => this.copyCode() }, "Copy code"),
        h("button", { class: "small-btn", "data-nav": "enter", onclick: () => this.enterCode() }, "Enter a friend's code…"),
        saved?.tracks.length ? h("button", { class: "small-btn", "data-nav": "continue", onclick: () => this.continueSaved() }, `Continue “${saved.title}”`) : null,
        h("button", { class: "small-btn", "data-nav": "library", onclick: () => libraryDialog(this.app, { onOpen: () => this.app.show("song") }) }, "Songs…"),
        h("button", { class: "small-btn", "data-nav": "blank", onclick: () => this.blank() }, "Blank song, no dice"),
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
    const target = roll(d.setup, d.locks, randomSeed());
    d.setup = target;
    // A short tumble: unlocked dice flicker through random values, then land.
    this.rolling = 8;
    const tick = () => {
      if (--this.rolling <= 0) { this.rolling = 0; this.shown = target; this.render(); return; }
      this.shown = roll(target, d.locks, randomSeed());
      this.render();
      setTimeout(tick, 45 + (8 - this.rolling) * 12);
    };
    tick();
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
    app.show("song");
    // Offer the phrase grid first; the timer starts when it closes, so browsing it is free.
    phraseGridDialog(app, {
      onDone: () => {
        app.startTimer(app.dice.minutes);
        app.show(app.song.tracks.some((t) => t.clips[app.song.scenes[0].id]?.notes.length) ? "song" : "edit");
        app.overlays.toast(app.dice.minutes ? `${app.dice.minutes} minutes. Go!` : "Go!");
      },
    });
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
