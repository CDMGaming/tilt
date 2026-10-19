// The setup screen: a quick start for a new song. Every field (key, scale, tempo,
// swing, the lineup and its sounds) can be set directly; editing a field HOLDs it.
// NUDGE re-rolls whatever isn't held, so randomness is there when you want a push.
// Game features (challenge cards, locking at zero) live behind Game mode.

import {
  ALL_KINDS_FOR_SETUP, MAX_SLOTS, NO_HOLDS, conformSetup, decodeSetup, defaultSpec, encodeSetup, lineupHeld, nudgeSetup, songFromSetup, soundsHeld,
  type HoldKey, type LineupSpec,
} from "../engine/dice";
import { INSTRUMENTS } from "../engine/instruments";
import { newSong, type InstrumentKind } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { randomSeed } from "../engine/rng";
import type { Action } from "./actions";
import { App, STORE_PREFIX, TIMER_CHOICES, type Screen } from "./app";
import { h } from "./dom";
import { SpatialNav } from "./nav";
import { challengeById } from "../engine/challenges";
import { libraryDialog } from "./library";
import { openCodeOrLink } from "./sharesong";
import { phraseGridDialog } from "./phrasegrid";
import { dmdText } from "./dmd";
import { settingsDialog } from "./dialogs";
import { codeLink } from "./share";
import { jamOfTheDay } from "../engine/daily";
import type { MenuItem } from "./overlay";
import { ROLES, ROLE_LABEL, generatePreset, type Role, type SoundRef } from "../engine/sounds";
import { noteRoll, pickOptions } from "./sounds";

/** A sound's name on the setup screen (a generated one's name comes from its seed). */
const soundName = (l: SoundRef) => l.gen !== undefined ? generatePreset(l.kind, l.gen).name : INSTRUMENTS[l.kind].presets[l.preset]?.name ?? "";
const gensOf = (spec: LineupSpec) => (spec.gens ??= Array(MAX_SLOTS).fill(null));
const rolesOf = (spec: LineupSpec) => (spec.roles ??= Array(MAX_SLOTS).fill(null));

const RANGES: [number, number][] = [[1, 3], [2, 4], [3, 5], [4, 6], [5, 8]];
const SETUPS_KEY = STORE_PREFIX + "setups.v1";

/** A saved setup: the fields that were held (and their values) and the lineup spec. */
interface SavedSetup { name: string; holds: Record<HoldKey, boolean>; values: { key?: number; scale?: string; tempo?: number; swing?: number }; spec: LineupSpec }

function loadSetups(): SavedSetup[] {
  try { return JSON.parse(localStorage.getItem(SETUPS_KEY) ?? "[]") as SavedSetup[]; } catch { return []; }
}
function storeSetups(list: SavedSetup[]) {
  try { localStorage.setItem(SETUPS_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

export class DiceScreen implements Screen {
  el = h("div", { class: "dice-screen" });
  private nav = new SpatialNav(() => this.el);
  private rolling = 0;
  private shown;

  constructor(private app: App) { this.shown = app.dice.setup; }

  private get d() { return this.app.dice; }
  private get cardsOn() { return this.app.settings.gameMode; }
  private get opts() { return pickOptions(this.app.settings.genShare); }

  /** Something changed: remember it, redraw. */
  private changed() { this.app.saveDice(); this.shown = this.d.setup; this.render(); }

  render() {
    const app = this.app, d = this.d, s = this.shown, holds = d.holds, spec = d.spec, n = s.lineup.length;
    const anchor = (e: Event) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: r.left, y: r.bottom + 4 }; };
    const holdBtn = (id: string, held: boolean, part: boolean, onclick: () => void, title: string) =>
      h("button", { class: "hold" + (held ? " on" : part ? " part" : ""), "data-nav": `hold-${id}`, "aria-pressed": String(held), onclick, title }, "HOLD");
    // A plain field: its value opens a list; − / + where it's a number. Editing it HOLDs it.
    const field = (key: HoldKey, label: string, value: string, menu: () => MenuItem[], step?: (dir: -1 | 1) => void, unit?: string) =>
      h("div", { class: `die reel reel-${key}` + (holds[key] ? " locked" : "") + (this.rolling && !holds[key] ? " rolling" : "") },
        h("div", { class: "die-label" }, label),
        h("div", { class: "reel-window" },
          h("button", { class: "reel-value", "data-nav": key, title: `Choose the ${label.toLowerCase()} (holds it)`, onclick: (e: Event) => app.overlays.menu(label, menu, anchor(e)) },
            h("span", { class: "die-value" }, value), unit ? h("span", { class: "die-unit" }, unit) : ""),
          step ? h("div", { class: "reel-step" },
            h("button", { class: "step-btn", "data-nav": `${key}-down`, onclick: () => step(-1), title: `${label} down` }, "−"),
            h("button", { class: "step-btn", "data-nav": `${key}-up`, onclick: () => step(1), title: `${label} up` }, "+")) : ""),
        holdBtn(key, holds[key], false, () => { holds[key] = !holds[key]; this.changed(); }, holds[key] ? "Held: NUDGE leaves it. Click to release" : "Hold: NUDGE leaves it alone"));
    const set = (key: HoldKey, apply: () => void) => { apply(); holds[key] = true; this.changed(); };

    const chosenSlots = spec.slots.slice(0, n).filter(Boolean).length, chosenSounds = spec.presets.slice(0, n).filter((p) => p !== null).length;
    const countLabel = spec.count !== null ? `${spec.count}` : `Random ${spec.min}–${spec.max}`;

    this.el.replaceChildren(
      h("div", { class: "dice-head" },
        h("div", { class: "logo" }, dmdText("TILT", { height: 48, slant: 7 })),
        h("div", { class: "tagline" }, "Just a Nudge"),
        this.dailyCard()),
      h("div", { class: "reels" },
        field("key", "Key", NOTE_NAMES[s.key], () => NOTE_NAMES.map((nm, i) => ({ label: nm, checked: s.key === i, run: () => set("key", () => (d.setup = { ...d.setup, key: i })) }))),
        field("scale", "Scale", scaleById(s.scale).name, () => SCALES.map((sc) => ({ label: sc.name, checked: s.scale === sc.id, run: () => set("scale", () => (d.setup = { ...d.setup, scale: sc.id })) }))),
        field("tempo", "Tempo", `${s.tempo}`, () => [
          ...[60, 70, 80, 90, 100, 110, 120, 124, 128, 135, 140, 150, 160, 174].map((t) => ({ label: `${t} bpm`, checked: s.tempo === t, run: () => set("tempo", () => (d.setup = { ...d.setup, tempo: t })) })),
          { label: "Other…", run: () => { const v = Number(prompt("Tempo (40-250 bpm)", String(s.tempo))); if (v >= 40 && v <= 250) set("tempo", () => (d.setup = { ...d.setup, tempo: Math.round(v) })); } },
        ], (dir) => set("tempo", () => (d.setup = { ...d.setup, tempo: Math.max(40, Math.min(250, d.setup.tempo + dir)) })), "bpm"),
        field("swing", "Swing", s.swing ? `${s.swing}%` : "straight", () => [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((v) => ({ label: v ? `${v}%` : "Straight", checked: s.swing === v, run: () => set("swing", () => (d.setup = { ...d.setup, swing: v })) })),
          (dir) => set("swing", () => (d.setup = { ...d.setup, swing: Math.max(0, Math.min(100, d.setup.swing + dir * 5)) }))),
        // The lineup: how many, and per slot an instrument or "?" (filled by NUDGE).
        h("div", { class: "die reel reel-lineup" + (lineupHeld(spec, n) ? " locked" : "") },
          h("div", { class: "die-label" }, "Lineup"),
          h("div", { class: "reel-window" },
            h("button", { class: "count-btn", "data-nav": "count", title: "How many instruments: a fixed number, or a random one in a range", onclick: (e: Event) => app.overlays.menu("Instruments", () => this.countMenu(), anchor(e)) }, countLabel),
            h("div", { class: "slots" }, s.lineup.map((l, i) => {
              const chosen = !!spec.slots[i], role = spec.roles?.[i];
              const title = chosen ? "Chosen: NUDGE leaves it" : role ? `? ${ROLE_LABEL[role]}: NUDGE picks a ${ROLE_LABEL[role].toLowerCase()} sound from any instrument` : "?: NUDGE picks a role, then a sound for it";
              return h("button", { class: `chip slot kind-${l.kind}` + (chosen ? " chosen" : " surprise"), "data-nav": `slot${i}`, title, onclick: (e: Event) => app.overlays.menu(`Slot ${i + 1}`, () => this.slotMenu(i), anchor(e)) },
                chosen ? "" : h("span", { class: "q" }, role ? `? ${ROLE_LABEL[role]} ` : "?"), INSTRUMENTS[l.kind].name);
            }))),
          holdBtn("lineup", lineupHeld(spec, n), chosenSlots > 0, () => this.toggleLineup(), "Hold every slot (and the count) / release them all")),
        h("div", { class: "die reel reel-presets" + (soundsHeld(spec, n) ? " locked" : "") },
          h("div", { class: "die-label" }, "Sounds"),
          h("div", { class: "reel-window" },
            h("div", { class: "slots" }, s.lineup.map((l, i) => {
              const chosen = spec.presets[i] !== null;
              return h("button", { class: "chip slot" + (chosen ? " chosen" : " surprise"), "data-nav": `sound${i}`, title: chosen ? "Chosen: NUDGE leaves it" : "?: NUDGE picks one", onclick: (e: Event) => app.overlays.menu(`${INSTRUMENTS[l.kind].name} sound`, () => this.soundMenu(i), anchor(e)) },
                chosen ? "" : h("span", { class: "q" }, "?"), soundName(l));
            }))),
          holdBtn("presets", soundsHeld(spec, n), chosenSounds > 0, () => this.toggleSounds(), "Hold every sound / release them all")),
        this.cardsOn ? h("div", { class: "die reel reel-cards" },
          h("div", { class: "die-label" }, "Challenges"),
          h("div", { class: "reel-window" }, s.cards?.length
            ? h("div", { class: "cards" }, s.cards.map((c) => h("div", { class: "card" }, challengeById(c)?.text ?? c)))
            : h("div", { class: "die-value small" }, "none"))) : "",
      ),
      // Songs stays in sight; the rest of the setup tools live in More ▾.
      h("div", { class: "dice-foot" },
        h("button", { class: "small-btn", "data-nav": "library", onclick: () => libraryDialog(app, { onOpen: () => app.show("song") }) }, "▤ Songs…"),
        h("button", { class: "small-btn", "data-nav": "more", title: "Holds, saved setups, the share code, a blank song", onclick: (e: Event) => app.overlays.menu("More", () => this.moreMenu(), anchor(e)) }, "More ▾"),
      ),
      // Always on screen: nudge, timer (and game mode), new song.
      h("div", { class: "dice-bar" },
        h("button", { class: "roll-btn nudge-btn", "data-nav": "nudge", onclick: () => this.nudge(), title: "Re-roll everything that isn't held (Y / Space)" }, "NUDGE", h("small", null, "Y / Space")),
        h("div", { class: "timer-pick" },
          h("div", { class: "die-label" }, "Timer ", h("button", { class: "link-btn", "data-nav": "game-mode", onclick: () => settingsDialog(app, "timer") }, app.settings.gameMode ? "Game mode: on…" : "Game mode…")),
          h("div", { class: "seg" }, TIMER_CHOICES.map((m) => h("button", { class: "seg-btn" + (d.minutes === m ? " on" : ""), "data-nav": `t${m}`, onclick: () => { d.minutes = m; this.changed(); } }, m ? `${m} min` : "Off")))),
        this.cardsOn ? h("div", { class: "timer-pick" },
          h("div", { class: "die-label" }, "Challenges"),
          h("div", { class: "seg" }, [0, 1, 2, 3].map((c) => h("button", { class: "seg-btn" + (d.cards === c ? " on" : ""), "data-nav": `cards${c}`, onclick: () => { d.cards = c; d.setup = nudgeSetup(d.setup, { key: true, scale: true, tempo: true, swing: true }, this.heldSpec(), randomSeed(), c); this.changed(); } }, c ? String(c) : "Off")))) : "",
        h("div", { class: "spacer" }),
        h("button", { class: "go-btn", "data-nav": "go", onclick: () => this.start(), title: "Make the song (Shift+Space / hold Y)" }, "NEW SONG ▶"),
        app.song.tracks.length ? h("button", { class: "small-btn continue", "data-nav": "continue", onclick: () => this.continueSaved(), title: "Back to the song you were working on" }, `Continue “${app.song.title}”`) : "",
      ),
    );
    this.nav.paint();
  }

  /** A spec that keeps the whole lineup as it is (for re-dealing cards without touching anything else). */
  private heldSpec(): LineupSpec {
    const s = this.d.setup, sp = defaultSpec();
    sp.count = s.lineup.length;
    s.lineup.forEach((l, i) => { sp.slots[i] = l.kind; sp.presets[i] = l.preset; gensOf(sp)[i] = l.gen ?? null; });
    return sp;
  }

  // ------------------------------------------------------------ lineup editing

  private countMenu(): MenuItem[] {
    const d = this.d, spec = d.spec;
    const apply = (fn: () => void) => { fn(); d.setup = conformSetup(d.setup, spec, randomSeed(), this.opts); this.changed(); };
    return [
      ...RANGES.map(([a, b]) => ({ label: `Random ${a}–${b}`, checked: spec.count === null && spec.min === a && spec.max === b, run: () => apply(() => { spec.count = null; spec.min = a; spec.max = b; }) })),
      ...Array.from({ length: 8 }, (_, i) => ({ label: `${i + 1} instrument${i ? "s" : ""}`, checked: spec.count === i + 1, run: () => apply(() => { spec.count = i + 1; }) })),
    ];
  }

  private slotMenu(i: number): MenuItem[] {
    const d = this.d, spec = d.spec;
    const apply = (k: InstrumentKind | null, role: Role | null = null) => {
      if (spec.slots[i] !== k || role) { spec.presets[i] = null; gensOf(spec)[i] = null; } // a new instrument: its old sound choice doesn't apply
      spec.slots[i] = k;
      rolesOf(spec)[i] = role;
      if (spec.count === null && i >= spec.min) spec.min = Math.min(spec.max, i + 1);
      // A role re-rolls this slot now; otherwise it keeps what it has.
      d.setup = conformSetup(d.setup, spec, randomSeed(), this.opts, role ? i : undefined);
      this.changed();
    };
    const role = spec.roles?.[i] ?? null;
    return [
      { label: "? Let NUDGE pick", checked: !spec.slots[i] && !role, run: () => apply(null) },
      { label: "? A role, any instrument", hint: role ? ROLE_LABEL[role] : "", sub: () => ROLES.map((r) => ({ label: `? Any ${ROLE_LABEL[r].toLowerCase()}`, checked: !spec.slots[i] && role === r, run: () => apply(null, r) })) },
      ...ALL_KINDS_FOR_SETUP.map((k) => ({ label: INSTRUMENTS[k].name, hint: INSTRUMENTS[k].group, checked: spec.slots[i] === k, run: () => apply(k) })),
    ];
  }

  private soundMenu(i: number): MenuItem[] {
    const d = this.d, spec = d.spec, now = d.setup.lineup[i], kind = now.kind;
    // Choosing a sound chooses its instrument too (a sound belongs to one).
    const apply = (p: number | null, gen: number | null = null) => {
      spec.presets[i] = p;
      gensOf(spec)[i] = gen;
      if (p !== null) spec.slots[i] = kind;
      d.setup = conformSetup(d.setup, spec, randomSeed(), this.opts);
      this.changed();
    };
    return [
      { label: "? Let NUDGE pick", checked: spec.presets[i] === null, run: () => apply(null) },
      ...(now.gen !== undefined ? [{ label: `${soundName(now)} (generated)`, checked: spec.gens?.[i] === now.gen, run: () => apply(now.preset, now.gen!) }] : []),
      ...INSTRUMENTS[kind].presets.map((p, pi) => ({ label: p.name, checked: spec.presets[i] === pi && (spec.gens?.[i] ?? null) === null, run: () => apply(pi) })),
    ];
  }

  /** HOLD on the lineup: hold every slot and the count as they are, or release them all. */
  private toggleLineup() {
    const d = this.d, spec = d.spec, n = d.setup.lineup.length;
    if (lineupHeld(spec, n)) { spec.count = null; spec.slots = spec.slots.map(() => null); }
    else { spec.count = n; d.setup.lineup.forEach((l, i) => (spec.slots[i] = l.kind)); }
    this.changed();
  }

  private toggleSounds() {
    const d = this.d, spec = d.spec, n = d.setup.lineup.length;
    // Holding a sound holds its instrument too; releasing the sounds leaves the instruments chosen.
    if (soundsHeld(spec, n)) { spec.presets = spec.presets.map(() => null); spec.gens = gensOf(spec).map(() => null); }
    else d.setup.lineup.forEach((l, i) => { spec.presets[i] = l.preset; gensOf(spec)[i] = l.gen ?? null; spec.slots[i] = l.kind; });
    this.changed();
  }

  /** Jam of the day: everyone gets the same setup today. Load it onto the reels (then NEW SONG). */
  private dailyCard(): HTMLElement {
    const app = this.app, j = jamOfTheDay(), s = j.setup;
    const today = new Date(`${j.day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const on = encodeSetup(this.d.setup) === j.code;
    return h("div", { class: "daily-card" + (on ? " on" : "") },
      h("div", { class: "daily-title" }, `Jam of the day · ${today}`),
      h("div", { class: "daily-meta" }, `${NOTE_NAMES[s.key]} ${scaleById(s.scale).name} · ${s.tempo} bpm · ${s.lineup.map((l) => INSTRUMENTS[l.kind].name).join(", ")}`),
      on ? h("div", { class: "daily-note" }, "On the reels: NEW SONG to play it. Same for everyone today.")
        : h("button", { class: "small-btn", "data-nav": "daily", title: `The same setup for everyone today (code ${j.code})`, onclick: () => { this.d.setup = j.setup; this.d.holds = { ...NO_HOLDS }; this.changed(); app.overlays.toast("Jam of the day on the reels: NEW SONG to play it", 2000); } }, "Load it"));
  }

  /** The setup screen's More ▾: what used to crowd the row under the reels. */
  private moreMenu(): MenuItem[] {
    const app = this.app, code = encodeSetup(this.shown);
    const head = (label: string): MenuItem => ({ label, heading: true });
    return [
      head("Holds"),
      { label: "Release all", hint: "every HOLD and chosen slot", run: () => this.releaseAll() },
      head("Setups"),
      { label: "Load a setup", sub: () => this.setupsMenu() },
      { label: "Save setup…", hint: "the held fields", run: () => this.saveSetup() },
      head(`Share code ${code}`),
      { label: "Copy code", run: () => this.copyCode() },
      { label: "Copy link", hint: "opens TILT with this setup", run: () => { void navigator.clipboard?.writeText(codeLink(code)); app.overlays.toast("Link copied", 1200); } },
      { label: "Enter a code…", run: () => this.enterCode() },
      head("Start"),
      { label: "Blank song", hint: "no instruments yet", run: () => this.blank() },
    ];
  }

  private releaseAll() {
    const d = this.d, keep = d.spec;
    d.holds = { ...NO_HOLDS };
    d.spec = { ...defaultSpec(), min: keep.min, max: keep.max };
    this.changed();
    this.app.overlays.toast("Everything released: NUDGE re-rolls it all", 1500);
  }

  // ------------------------------------------------------------ saved setups

  private saveSetup() {
    const d = this.d, s = d.setup;
    const held = (Object.keys(d.holds) as HoldKey[]).filter((k) => d.holds[k]);
    const name = prompt(`Save this setup as (holds: ${[...held, d.spec.slots.some(Boolean) ? "lineup slots" : "", d.spec.presets.some((p) => p !== null) ? "sounds" : ""].filter(Boolean).join(", ") || "nothing held yet"})`, "My setup");
    if (!name?.trim()) return;
    const values: SavedSetup["values"] = {};
    for (const k of held) (values as Record<string, unknown>)[k] = s[k];
    const list = loadSetups().filter((x) => x.name !== name.trim());
    list.unshift({ name: name.trim().slice(0, 40), holds: { ...d.holds }, values, spec: JSON.parse(JSON.stringify(d.spec)) });
    storeSetups(list);
    this.app.overlays.toast(`Saved setup “${name.trim()}”`, 1500);
  }

  private setupsMenu(): MenuItem[] {
    const list = loadSetups();
    if (!list.length) return [{ label: "No saved setups yet (Save setup…)", disabled: true }];
    return [
      ...list.map((x) => ({ label: x.name, run: () => this.loadSetup(x) })),
      { label: "Delete a setup", sub: () => list.map((x) => ({ label: x.name, run: () => { storeSetups(loadSetups().filter((y) => y.name !== x.name)); this.app.overlays.toast(`Deleted “${x.name}”`, 1200); } })) },
    ];
  }

  /** Load a setup: its fields come back held; anything it left open is re-rolled to fit. */
  private loadSetup(x: SavedSetup) {
    const d = this.d;
    d.holds = { ...NO_HOLDS, ...x.holds };
    d.spec = { ...defaultSpec(), ...JSON.parse(JSON.stringify(x.spec)) };
    d.setup = nudgeSetup({ ...d.setup, ...x.values }, d.holds, d.spec, randomSeed(), this.cardsOn ? d.cards : 0, this.opts);
    this.changed();
    this.app.overlays.toast(`Setup “${x.name}”`, 1200);
  }

  // ------------------------------------------------------------ actions

  handle(a: Action): boolean {
    switch (a.type) {
      case "dir": this.nav.move(a.dir); return true;
      case "confirm": this.nav.focused?.click(); return true;
      case "play": this.nudge(); return true;
      case "record": this.start(); return true;
    }
    return false;
  }

  enter() { this.shown = this.d.setup; }

  /** NUDGE: re-roll everything that isn't held, with a short tumble on the reels that change. */
  nudge() {
    const d = this.d;
    if (this.rolling) return;
    const cards = this.cardsOn ? d.cards : 0;
    const opts = this.opts;
    const target = nudgeSetup(d.setup, d.holds, d.spec, randomSeed(), cards, opts);
    d.setup = target;
    noteRoll(target.lineup);
    this.app.saveDice();
    this.rolling = 8;
    const tick = () => {
      if (--this.rolling <= 0) { this.rolling = 0; this.shown = target; this.render(); return; }
      this.shown = nudgeSetup(target, d.holds, d.spec, randomSeed(), cards, opts);
      this.render();
      setTimeout(tick, 45 + (8 - this.rolling) * 12);
    };
    tick();
  }

  private async copyCode() {
    const code = encodeSetup(this.d.setup);
    try { await navigator.clipboard.writeText(code); this.app.overlays.toast(`Copied ${code}`); }
    catch { prompt("Share code", code); }
  }

  /** One box for everything: a song code (TILT-XXXXXXXX) opens that song; a setup code fills the reels. */
  private enterCode() {
    const c = prompt("Song code (TILT-XXXXXXXX), setup code, or a TILT link");
    if (!c) return;
    const s = decodeSetup(c);
    if (s) { this.d.setup = s; this.changed(); return; }
    void openCodeOrLink(this.app, c);
  }

  start() {
    const app = this.app, d = this.d;
    if (this.rolling) return;
    const setup = this.cardsOn ? d.setup : { ...d.setup, cards: undefined };
    const song = songFromSetup(setup);
    song.title = `Song ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${NOTE_NAMES[song.key]} ${scaleById(song.scale).name}`;
    app.engine.stop();
    app.replaceSong(song);
    app.startTimer(0);
    app.songCur = { row: 0, col: 0 };
    app.ed.trackId = song.tracks[0]?.id ?? 0;
    app.ed.sceneId = song.scenes[0].id;
    app.ed.focus = "roll";
    const go = () => {
      app.startTimer(d.minutes);
      app.show(app.song.tracks.some((t) => t.clips[app.song.scenes[0].id]?.notes.length) ? "song" : "edit");
      app.overlays.toast(d.minutes ? `${d.minutes} minutes on the clock.  Stuck? Hit the bulb` : "New song.  Stuck? Hit the bulb", 3500);
    };
    // Start from a blank page; the phrase grid waits behind the 💡 Stuck? button
    // (or opens here first if the player turned that on in Settings).
    if (app.settings.gridAtStart) { app.show("song"); phraseGridDialog(app, { onDone: go }); }
    else go();
  }

  private continueSaved() {
    const app = this.app;
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
