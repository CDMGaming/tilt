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
import type { Online } from "./online";

export type Device =
  | { kind: "keys" } // computer keyboard (and the mouse goes with it)
  | { kind: "pad"; index: number } // a gamepad, by its browser slot
  | { kind: "midi"; name: string } // a MIDI keyboard / controller, by port name
  | { kind: "push" }
  | { kind: "net"; peer: string; name: string }; // a player in an online game (on this machine or another)

export const sameDevice = (a: Device, b: Device) =>
  a.kind === b.kind && (a.kind !== "pad" || a.index === (b as { index: number }).index) && (a.kind !== "midi" || a.name === (b as { name: string }).name)
  && (a.kind !== "net" || a.peer === (b as { peer: string }).peer);

export function deviceName(d: Device): string {
  switch (d.kind) {
    case "keys": return "Keyboard + mouse";
    case "pad": return `Gamepad ${d.index + 1}`;
    case "midi": return d.name;
    case "push": return "Push";
    case "net": return d.name;
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
  /** Looking at another player's instrument (read-only, Jump to…): its track id. */
  viewing?: number | null;
}

/** "P2" (couch) or the player's name (online). */
export const seatName = (s: Seat) => (s.device.kind === "net" ? s.device.name : s.id.toUpperCase());

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
  /** Online game: the connection, and which seat is the person at this computer. */
  online: Online | null = null;
  localId: string | null = null;

  /** Online: every controller here plays the local seat. */
  get localSeat(): Seat | undefined { return this.localId ? this.seat(this.localId) : undefined; }
  isLocal(s: Seat) { return !this.online || s.id === this.localId; }

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

  /** Who plays this track (a seat), if anyone. */
  ownerOf(trackId: number): Seat | undefined { return this.seats.find((s) => s.trackId === trackId); }

  /** Sit `seat` at a track nobody plays (its old one is free again). */
  moveSeat(seat: Seat, trackId: number) {
    const owners = this.app.owners.tracks;
    if (this.ownerOf(trackId)) return;
    owners.delete(seat.trackId);
    owners.set(trackId, seat.id);
    seat.trackId = trackId;
    seat.viewing = null;
    seat.ed.trackId = trackId;
    seat.ed.sel = new Set();
  }

  /** Two players trade instruments (both agreed). */
  swap(a: Seat, b: Seat) {
    const owners = this.app.owners.tracks, ta = a.trackId, tb = b.trackId;
    a.trackId = tb; b.trackId = ta;
    owners.set(tb, a.id); owners.set(ta, b.id);
    for (const s of [a, b]) { s.viewing = null; s.ed.trackId = s.trackId; s.ed.sel = new Set(); }
  }

  /** Hand the shared strip to the next player round the table. */
  pass() {
    if (this.seats.length < 2) return;
    const order = [...this.seats].sort((a, b) => a.slot - b.slot);
    const i = order.findIndex((s) => s.id === this.conductor);
    this.setConductor(order[(i + 1) % order.length].id);
    this.online?.send({ t: "conductor", id: this.conductor });
  }

  setConductor(id: string) {
    for (const s of this.seats) s.inStrip = false;
    this.conductor = id;
    this.app.owners.conductor = id;
  }

  /** Everyone moves to this scene; while playing it starts at the next bar. `share`: tell the other machines. */
  setScene(id: number, share = true) {
    if (share && this.sceneId !== id) this.online?.send({ t: "scene", id });
    this.sceneId = id;
    for (const s of [...this.seats, this.lobby]) { s.ed.sceneId = id; s.ed.sel.clear(); }
    const app = this.app;
    if (app.engine.playing) app.engine.queue({ kind: "scene", sceneId: id }, true);
  }

  /** Online guests: the host's seating plan. Seats that stay keep their editor state. */
  applyRoster(specs: { id: string; slot: number; trackId: number; device: Device }[], conductor: string) {
    const app = this.app, keep = new Map(this.seats.map((s) => [s.id, s]));
    this.seats = specs.map((r) => {
      const s = keep.get(r.id) ?? { id: r.id, slot: r.slot, device: r.device, trackId: r.trackId, ed: cloneEd(app.ed), scratch: newScratch(), mods: freshMods(), inStrip: false };
      Object.assign(s, { slot: r.slot, device: r.device, trackId: r.trackId });
      // Still looking at someone else's instrument? Keep looking (unless it's now yours).
      if (s.viewing === r.trackId) s.viewing = null;
      s.ed.trackId = s.viewing ?? r.trackId;
      s.ed.sceneId = this.sceneId;
      return s;
    });
    app.owners.tracks.clear();
    for (const s of this.seats) app.owners.tracks.set(s.trackId, s.id);
    this.setConductor(conductor);
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
