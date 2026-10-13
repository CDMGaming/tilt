// Couch mode screen: the window split into four quarters, one per player,
// with the shared strip (scenes, tempo, key, master, transport) across the
// middle. Each quarter is a compact editor locked to its player's instrument;
// a player's controller only ever acts inside their own quarter. The shared
// strip belongs to the conductor, who can pass it on.

import { INSTRUMENTS } from "../engine/instruments";
import type { InstrumentKind } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { addScene, changeInstrument, duplicateScene } from "../engine/songops";
import type { Action } from "./actions";
import type { App, Screen } from "./app";
import { h } from "./dom";
import { EditorScreen } from "./editor";
import { SpatialNav } from "./nav";
import type { MenuItem } from "./overlay";
import { MAX_SEATS, SEAT_COLORS, deviceName, type Seat } from "./seats";
import { trackColor } from "./theme";

interface Quad { root: HTMLElement; head: HTMLElement; editor: EditorScreen }

export class CouchScreen implements Screen {
  el = h("div", { class: "couch" });
  private strip = h("div", { class: "couch-strip" });
  private stripNav = new SpatialNav(() => this.strip);
  private quads = new Map<string, Quad>();
  private cells = Array.from({ length: MAX_SEATS }, (_, i) => h("div", { class: `couch-cell cell${i}` }));
  private queueEl = h("span", { class: "strip-queue" });

  constructor(private app: App) {
    this.el.append(this.cells[0], this.cells[1], this.strip, this.cells[2], this.cells[3]);
    // Menus, dialogs and toasts belong to the player who opened them, inside their quarter.
    const ov = app.overlays;
    ov.owner = () => (app.couch && app.screenName === "couch" && app.actor ? app.actor.id : null);
    ov.area = (id) => this.quads.get(id)?.root.getBoundingClientRect() ?? null;
    ov.toastHost = () => (app.couch && app.screenName === "couch" && app.actor ? this.quads.get(app.actor.id)?.root ?? null : null);
    ov.onOwnerPointer = (id) => { const s = app.couch?.seat(id); if (s) app.focusSeat(s); };
    // The mouse belongs to the keyboard player; with no keyboard player it helps whoever's quarter it's in.
    this.strip.addEventListener("pointerdown", () => { const s = this.mouseSeat(null); if (s) app.focusSeat(s); }, true);
  }

  private get couch() { return this.app.couch!; }

  /** The seat a mouse press in `seat`'s quarter acts as, or null if the mouse may not go there. */
  private mouseSeat(seat: Seat | null): Seat | null {
    const c = this.couch, keys = c.seatFor({ kind: "keys" });
    if (keys) return !seat || seat === keys ? keys : null;
    return seat ?? c.seat(c.conductor) ?? null;
  }

  enter() {
    for (const s of this.couch.seats) this.quad(s);
  }

  private quad(seat: Seat): Quad {
    let q = this.quads.get(seat.id);
    if (q) return q;
    const app = this.app;
    const editor = new EditorScreen(app, { extraMenu: () => this.seatMenu(seat) });
    const head = h("div", { class: "quad-head" });
    const root = h("div", { class: "quad" }, head, editor.el);
    const guard = (e: Event) => {
      const as = this.mouseSeat(seat);
      if (as) { app.focusSeat(as); return; }
      e.stopPropagation();
      e.preventDefault();
      app.as(this.couch.seatFor({ kind: "keys" })!, () => app.overlays.toast(`That's ${seat.id.toUpperCase()}'s quarter`, 900));
    };
    for (const ev of ["pointerdown", "wheel", "contextmenu"]) root.addEventListener(ev, guard, { capture: true, passive: false });
    q = { root, head, editor };
    this.quads.set(seat.id, q);
    app.as(seat, () => editor.enter());
    return q;
  }

  render() {
    const app = this.app, c = this.couch;
    for (const id of [...this.quads.keys()]) if (!c.seat(id)) this.quads.delete(id);
    for (let slot = 0; slot < MAX_SEATS; slot++) {
      const cell = this.cells[slot], seat = c.bySlot(slot);
      if (!seat) {
        cell.replaceChildren(h("div", { class: "quad empty", style: `--seat:${SEAT_COLORS[slot]}` },
          h("div", { class: "join" },
            h("div", { class: "join-title" }, `Player ${slot + 1}`),
            h("div", null, "Press A on a gamepad, Enter on the keyboard,"),
            h("div", null, "or play a note on a MIDI controller to join"))));
        continue;
      }
      const q = this.quad(seat), track = app.song.tracks.find((t) => t.id === seat.trackId);
      if (!track) continue;
      q.root.style.cssText = `--seat:${SEAT_COLORS[slot]};--track:${trackColor(track)}`;
      q.root.classList.toggle("is-conductor", c.isConductor(seat));
      q.head.replaceChildren(
        h("span", { class: "seat-badge" }, seat.id.toUpperCase()),
        h("span", { class: "quad-inst" }, INSTRUMENTS[track.kind].name),
        h("span", { class: "quad-preset" }, track.preset),
        c.isConductor(seat) ? h("span", { class: "conductor-badge", title: "Has the shared controls" }, "★ conductor") : "",
        h("span", { class: "spacer" }),
        h("span", { class: "quad-device" }, deviceName(seat.device)),
      );
      if (cell.firstChild !== q.root) cell.replaceChildren(q.root);
      app.as(seat, () => q.editor.render());
    }
    this.renderStrip();
  }

  frame(now: number) {
    for (const s of this.couch.seats) {
      const q = this.quads.get(s.id);
      if (q) this.app.as(s, () => q.editor.frame());
    }
    this.queueEl.textContent = this.queueText();
    void now;
  }

  paramChanged(trackId: number, id: string) {
    const s = this.couch.seats.find((x) => x.trackId === trackId);
    const q = s && this.quads.get(s.id);
    if (s && q) this.app.as(s, () => q.editor.paramChanged(trackId, id));
  }

  handle(a: Action): boolean {
    const app = this.app, c = this.couch, seat = app.actor;
    if (!seat || seat === c.lobby) return false;
    if (a.type === "system") {
      if (!c.isConductor(seat)) { app.overlays.toast(`${c.conductor.toUpperCase()} has the shared controls`, 1200); return true; }
      seat.inStrip = !seat.inStrip;
      this.renderStrip();
      return true;
    }
    if (seat.inStrip) return this.handleStrip(a, seat);
    return this.quads.get(seat.id)?.editor.handle(a) ?? false;
  }

  private handleStrip(a: Action, seat: Seat): boolean {
    switch (a.type) {
      case "dir": this.stripNav.move(a.dir); return true;
      case "confirm": (this.stripNav.focused as HTMLElement | null)?.click(); return true;
      case "back": seat.inStrip = false; this.renderStrip(); return true;
    }
    return true; // the strip swallows the rest (play / record are handled before screens)
  }

  // ------------------------------------------------------------ shared strip

  /** Shared changes: only the conductor (ownership refuses song edits from anyone else too). */
  private conducting(): boolean {
    const c = this.couch, s = this.app.actor;
    if (c.isConductor(s)) return true;
    this.app.overlays.toast(`Only ${c.conductor.toUpperCase()} (the conductor) can change that`, 1200);
    return false;
  }

  private renderStrip() {
    const app = this.app, c = this.couch, song = app.song, playing = app.engine.playing;
    const pos = app.engine.position();
    const b = (nav: string, label: string, onclick: () => void, cls = "", title = "") =>
      h("button", { class: `strip-btn ${cls}`, "data-nav": nav, onclick, title }, label);
    const conductor = c.seat(c.conductor);
    const shared = (fn: () => void) => () => { if (this.conducting()) fn(); };
    const stepKey = (d: number) => app.edit("Key", () => (song.key = (song.key + d + 12) % 12));
    const stepScale = (d: number) => {
      const i = SCALES.findIndex((x) => x.id === song.scale);
      app.edit("Scale", () => (song.scale = SCALES[(i + d + SCALES.length) % SCALES.length].id));
    };
    this.strip.classList.toggle("active", !!conductor?.inStrip);
    this.strip.style.setProperty("--seat", conductor ? SEAT_COLORS[conductor.slot] : "var(--line)");
    this.strip.replaceChildren(
      h("div", { class: "strip-group" },
        h("span", { class: "strip-label" }, `★ ${c.conductor.toUpperCase()}`),
        b("pass", "Pass ▸", shared(() => { c.pass(); app.refresh(); app.overlays.toast(`${c.conductor.toUpperCase()} has the shared controls`); }), "", "Hand the shared controls to the next player")),
      h("div", { class: "strip-group" },
        b("play", playing ? "■" : "▶", () => app.togglePlay(), playing ? "on" : "", "Play / stop (anyone)"),
        b("rec", "●", () => app.toggleRecord(), "rec" + (app.recording ? " on" : ""), "Record: everyone's live playing goes into their own clip")),
      h("div", { class: "strip-group scenes" },
        ...song.scenes.map((s, i) => b(`sc${s.id}`, `${i + 1} ${s.name}`, shared(() => { c.setScene(s.id); app.refresh(); }),
          "scene" + (s.id === c.sceneId ? " on" : "") + (pos?.sceneId === s.id ? " playing" : ""))),
        b("addsc", "+", shared(() => { app.edit("Add scene", () => addScene(song)); const n = song.scenes[song.scenes.length - 1]; c.setScene(n.id); app.refresh(); }), "", "Add a blank scene"),
        b("dupsc", "⧉", shared(() => {
          const i = song.scenes.findIndex((s) => s.id === c.sceneId);
          app.edit("Duplicate scene", () => duplicateScene(song, i));
          const n = song.scenes[i + 1];
          if (n && n.id !== c.sceneId) c.setScene(n.id);
          app.refresh();
        }), "", "Copy this scene (with everyone's clips)"),
        this.queueEl),
      h("div", { class: "strip-group" },
        b("tempo-", "−", shared(() => app.edit("Tempo", () => (song.tempo = Math.max(40, song.tempo - 2))))),
        h("span", { class: "strip-value" }, `${app.engine.externalTempo ?? song.tempo} bpm`),
        b("tempo+", "+", shared(() => app.edit("Tempo", () => (song.tempo = Math.min(250, song.tempo + 2)))))),
      h("div", { class: "strip-group" },
        b("key-", "‹", shared(() => stepKey(-1))),
        h("span", { class: "strip-value" }, `${NOTE_NAMES[song.key]} ${scaleById(song.scale).name}`),
        b("key+", "›", shared(() => stepKey(1))),
        b("scale", "Scale", shared(() => stepScale(1)), "", "Next scale")),
      h("div", { class: "strip-group" },
        b("reverb", song.master.reverb ? "Reverb on" : "Reverb off", shared(() => app.edit("Reverb", () => (song.master.reverb = !song.master.reverb))), song.master.reverb ? "on" : ""),
        b("vol-", "−", shared(() => app.setMaster("volume", Math.max(0, song.master.volume - 0.05), true))),
        h("span", { class: "strip-value" }, `Vol ${Math.round(song.master.volume * 100)}`),
        b("vol+", "+", shared(() => app.setMaster("volume", Math.min(1, song.master.volume + 0.05), true)))),
      h("div", { class: "spacer" }),
      b("end", "End couch", () => this.confirmEnd(), "end"),
    );
    if (conductor?.inStrip) this.stripNav.paint(); else this.stripNav.clearPaint();
    this.queueEl.textContent = this.queueText();
  }

  /** "→ Verse at the next bar", while a scene change is waiting. */
  private queueText(): string {
    const app = this.app, pos = app.engine.position(), mode = app.engine.playMode;
    if (!pos || mode.kind !== "scene" || mode.sceneId === pos.sceneId) return "";
    const s = app.song.scenes.find((x) => x.id === mode.sceneId);
    const beats = Math.max(1, Math.ceil((pos.ticks - pos.tick) / 96));
    return s ? `→ ${s.name} in ${beats} beat${beats > 1 ? "s" : ""}` : "";
  }

  private confirmEnd() {
    const app = this.app;
    app.overlays.dialog("End couch mode?", (close) => h("div", { class: "form" },
      h("p", { class: "note" }, "Everyone's work stays in the song. P1 carries on solo."),
      h("button", { class: "row-btn primary", "data-nav": "end", onclick: () => { close(); app.endCouch(); } }, "End couch mode"),
      h("button", { class: "row-btn", "data-nav": "stay", onclick: close }, "Keep playing")));
  }

  // ------------------------------------------------------------ per-player menu

  private seatMenu(seat: Seat): MenuItem[] {
    const app = this.app, c = this.couch;
    const track = app.song.tracks.find((t) => t.id === seat.trackId);
    if (!track) return [];
    const kinds = Object.keys(INSTRUMENTS) as InstrumentKind[];
    return [
      { label: "Change my instrument", sub: () => kinds.map((k) => ({
        label: INSTRUMENTS[k].name, hint: INSTRUMENTS[k].group, checked: track.kind === k,
        run: () => { app.edit("Change instrument", () => changeInstrument(track, k)); app.refresh(); },
      })) },
      ...(c.isConductor(seat) ? [{ label: "Pass the shared controls", disabled: c.seats.length < 2, run: () => { c.pass(); app.refresh(); } }] : []),
      { label: "Leave the game", run: () => {
        c.leave(seat);
        if (!c.seats.length) app.endCouch(); else app.refresh();
      } },
      { label: "End couch mode…", run: () => this.confirmEnd() },
    ];
  }
}
