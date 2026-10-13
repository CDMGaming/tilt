// Couch mode: up to four players on one computer, each with their own
// controller, instrument (track), cursor, held buttons and undo history.
//
// The editing code all works on "the" editor state (app.ed), so a seat is a
// complete set of that state: whenever a player's controller does something,
// or their quarter of the screen is drawn, the app switches to their seat
// first (app.as). The song itself is shared; ownership (patches.ts) decides
// who may change which part of it.

import { INSTRUMENTS } from "../engine/instruments";
import type { InstrumentKind, Track } from "../engine/model";
import { mods } from "./actions";
import type { App, EditorState, Scratch } from "./app";
import { newScratch } from "./app";

export type Device =
  | { kind: "keys" } // computer keyboard (and the mouse goes with it)
  | { kind: "pad"; index: number } // a gamepad, by its browser slot
  | { kind: "midi"; name: string } // a MIDI keyboard / controller, by port name
  | { kind: "push" };

export const sameDevice = (a: Device, b: Device) =>
  a.kind === b.kind && (a.kind !== "pad" || a.index === (b as { index: number }).index) && (a.kind !== "midi" || a.name === (b as { name: string }).name);

export function deviceName(d: Device): string {
  switch (d.kind) {
    case "keys": return "Keyboard + mouse";
    case "pad": return `Gamepad ${d.index + 1}`;
    case "midi": return d.name;
    case "push": return "Push";
  }
}

export interface Seat {
  id: string; // "p1".."p4" (p1 is also the solo player: their undo history carries on)
  slot: number; // 0..3, the quarter of the screen
  device: Device;
  trackId: number;
  ed: EditorState;
  scratch: Scratch;
  mods: typeof mods;
  /** The conductor's controller can visit the shared strip. */
  inStrip: boolean;
}

export const MAX_SEATS = 4;
export const SEAT_COLORS = ["var(--cyan)", "var(--coral)", "var(--mint)", "var(--purple)"];

const freshMods = (): typeof mods => ({ fine: false, select: false, confirmHeld: false });

export class Couch {
  seats: Seat[] = [];
  conductor = "p1";
  /** Devices nobody has claimed yet act here (their actions can only join the game). */
  readonly lobby: Seat;
  /** The scene everybody is working on. */
  sceneId: number;

  constructor(private app: App) {
    this.sceneId = app.ed.sceneId;
    this.lobby = { id: "lobby", slot: -1, device: { kind: "keys" }, trackId: app.ed.trackId, ed: cloneEd(app.ed), scratch: newScratch(), mods: freshMods(), inStrip: false };
  }

  seatFor(d: Device): Seat | undefined { return this.seats.find((s) => sameDevice(s.device, d)); }
  seat(id: string): Seat | undefined { return this.seats.find((s) => s.id === id); }
  bySlot(slot: number): Seat | undefined { return this.seats.find((s) => s.slot === slot); }
  isConductor(s: Seat | null | undefined) { return !!s && s.id === this.conductor; }

  /** Take the first free quarter with this device. The first seat inherits the solo editor. */
  join(device: Device, first = false): Seat | null {
    if (this.seatFor(device)) return null;
    const app = this.app;
    const slot = [0, 1, 2, 3].find((i) => !this.bySlot(i));
    if (slot === undefined) { app.overlays.toast("All four seats are taken"); return null; }
    const ids = new Set(this.seats.map((s) => s.id));
    const id = ["p1", "p2", "p3", "p4"].find((x) => !ids.has(x))!;
    const track = this.freeTrack();
    if (!track) { app.overlays.toast("No free instrument (8 tracks max)"); return null; }
    const ed = first ? app.ed : cloneEd(app.ed);
    ed.trackId = track.id;
    ed.sceneId = this.sceneId;
    ed.sel = new Set();
    ed.focus = "roll";
    ed.tick = 0;
    const seat: Seat = { id, slot, device, trackId: track.id, ed, scratch: first ? app.scratch : newScratch(), mods: freshMods(), inStrip: false };
    this.seats.push(seat);
    app.owners.tracks.set(track.id, id);
    if (!this.seat(this.conductor)) this.conductor = id;
    app.owners.conductor = this.conductor;
    return seat;
  }

  leave(seat: Seat) {
    const app = this.app;
    this.seats = this.seats.filter((s) => s !== seat);
    app.owners.tracks.delete(seat.trackId);
    if (this.conductor === seat.id) this.conductor = this.seats[0]?.id ?? "p1";
    app.owners.conductor = this.seats.length ? this.conductor : null;
  }

  /** Hand the shared strip to the next player round the table. */
  pass() {
    if (this.seats.length < 2) return;
    const order = [...this.seats].sort((a, b) => a.slot - b.slot);
    const i = order.findIndex((s) => s.id === this.conductor);
    for (const s of order) s.inStrip = false;
    this.conductor = order[(i + 1) % order.length].id;
    this.app.owners.conductor = this.conductor;
  }

  /** Everyone moves to this scene; while playing it starts at the next bar. */
  setScene(id: number) {
    this.sceneId = id;
    for (const s of [...this.seats, this.lobby]) { s.ed.sceneId = id; s.ed.sel.clear(); }
    const app = this.app;
    if (app.engine.playing) app.engine.queue({ kind: "scene", sceneId: id }, true);
  }

  /** A track nobody plays yet, or a new one (a musical job the band is missing). */
  private freeTrack(): Track | null {
    const app = this.app, song = app.song, taken = new Set(this.seats.map((s) => s.trackId));
    const free = song.tracks.find((t) => !taken.has(t.id));
    if (free) return free;
    const groups = new Set(song.tracks.map((t) => INSTRUMENTS[t.kind].group));
    const kinds = Object.keys(INSTRUMENTS) as InstrumentKind[];
    const used = new Set(song.tracks.map((t) => t.kind));
    const want = (["drums", "bass", "harmony", "lead"] as const).find((g) => !groups.has(g));
    const kind = kinds.find((k) => !used.has(k) && (!want || INSTRUMENTS[k].group === want)) ?? kinds.find((k) => !used.has(k)) ?? kinds[0];
    let t: Track | null = null;
    app.systemEdit("Add instrument for a new player", () => { t = app.addTrackOf(kind, 0); });
    return t;
  }
}

function cloneEd(ed: EditorState): EditorState {
  return { ...ed, sel: new Set(), selAnchor: null, placing: null, grabbing: false, clipboard: [] };
}
