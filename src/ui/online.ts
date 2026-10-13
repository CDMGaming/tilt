// Online games: the couch screen, with the players on different computers.
//
// Everyone joins a room on the relay (tools/relay.ts). The host's machine holds
// the song and hands each newcomer a copy plus the seating plan (the roster).
// After that, every edit travels as patches (src/engine/patches.ts): each
// player owns one instrument, so edits never collide. Nobody hears anybody in
// real time: each machine plays the loop itself, and the host's machine sends
// "song position at server time" every second so everyone's loop stays on the
// same beat. Cursors travel too, so you can watch the others work.

import { idLanes, type Song } from "../engine/model";
import type { Patch } from "../engine/patches";
import type { App } from "./app";
import type { Seat } from "./seats";

export interface RosterSeat { id: string; slot: number; trackId: number; peer: string; name: string }

type Msg = Record<string, unknown> & { t: string; from?: string };

const wall = () => performance.timeOrigin + performance.now();

export class Online {
  ws!: WebSocket;
  myId = "";
  hostId = "";
  room = "";
  /** Server clock minus ours (ms), from the fastest of the recent pings. */
  private offset = 0;
  private samples: { rtt: number; offset: number }[] = [];
  private timers: number[] = [];
  private lastCursor = "";
  /** Notes other players added while you had them muted (the "+12" badge). */
  unheard = new Map<string, number>();
  closed = false;

  constructor(private app: App, readonly name: string) {}

  get isHost() { return this.myId !== "" && this.myId === this.hostId; }
  serverNow() { return wall() + this.offset; }

  /** Connect; resolves with the welcome (room code, ids) or rejects with a reason. */
  connect(url: string, q: { create?: boolean; room?: string }): Promise<void> {
    const u = new URL(url);
    if (q.create) u.searchParams.set("create", "1");
    if (q.room) u.searchParams.set("room", q.room.toUpperCase().trim());
    u.searchParams.set("name", this.name);
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try { ws = new WebSocket(u.toString()); } catch (e) { reject(String(e)); return; }
      this.ws = ws;
      let welcomed = false;
      ws.onmessage = (e) => {
        let m: Msg;
        try { m = JSON.parse(e.data as string); } catch { return; }
        if (m.t === "error") { reject(String(m.why)); return; }
        if (m.t === "welcome") {
          welcomed = true;
          this.myId = m.id as string;
          this.hostId = m.hostId as string;
          this.room = m.room as string;
          this.offset = (m.s as number) - wall();
          this.startClock();
          resolve();
          return;
        }
        this.onMessage(m);
      };
      ws.onerror = () => { if (!welcomed) reject(`Couldn't reach the online server at ${url}`); };
      ws.onclose = () => {
        if (!welcomed) { reject(`Couldn't reach the online server at ${url}`); return; }
        if (!this.closed) this.app.onlineEnded("Lost the connection to the online server");
      };
    });
  }

  close() {
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.close();
  }

  send(m: Msg, to?: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(to ? { ...m, to } : m));
  }

  // ------------------------------------------------------------ clock

  private startClock() {
    const ping = () => this.send({ t: "ping", c: wall() });
    ping();
    let n = 0;
    // Quick pings to settle, then a slow heartbeat.
    const fast = setInterval(() => { ping(); if (++n >= 6) clearInterval(fast); }, 300) as unknown as number;
    this.timers.push(fast, setInterval(ping, 4000) as unknown as number);
    // The host keeps everyone's loop on its beat.
    this.timers.push(setInterval(() => this.sendAnchor(), 1000) as unknown as number);
  }

  private pong(m: Msg) {
    const now = wall(), rtt = now - (m.c as number);
    this.samples.push({ rtt, offset: (m.s as number) + rtt / 2 - now });
    if (this.samples.length > 8) this.samples.shift();
    this.offset = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
  }

  /** Host: "this song position is being heard at this server time". */
  private sendAnchor() {
    const eng = this.app.engine;
    if (!this.isHost || !eng.playing) return;
    const tick = eng.globalTickAt(eng.heardTime(performance.now()));
    if (tick !== null) this.send({ t: "anchor", s: this.serverNow(), tick, sceneId: this.app.couch?.sceneId });
  }

  private anchor(m: Msg) {
    const app = this.app, eng = app.engine;
    if (!eng.playing) { app.playLocal(); return; } // joined mid-song or missed the start: catch up at the next anchor
    const gt = (m.tick as number) + ((this.serverNow() - (m.s as number)) / 1000) * eng.ticksPerSec();
    eng.alignTo(gt, eng.heardTime(performance.now()));
  }

  // ------------------------------------------------------------ transport

  /** Anyone can start or stop; everyone starts at the same server moment. */
  transport(play: boolean) {
    const at = this.serverNow() + 350;
    const m = { t: "transport", playing: play, at, sceneId: this.app.couch?.sceneId };
    this.send(m);
    this.applyTransport(m);
  }

  private applyTransport(m: Msg) {
    const app = this.app;
    if (!m.playing) { app.stopLocal(); return; }
    if (typeof m.sceneId === "number" && app.couch) app.couch.setScene(m.sceneId, false);
    const wait = (m.at as number) - this.serverNow();
    setTimeout(() => { if (!app.engine.playing) app.playLocal(); }, Math.max(0, wait));
  }

  // ------------------------------------------------------------ host duties

  roster(): RosterSeat[] {
    const c = this.app.couch;
    return c ? c.seats.map((s) => ({ id: s.id, slot: s.slot, trackId: s.trackId, peer: s.device.kind === "net" ? s.device.peer : this.myId, name: s.device.kind === "net" ? s.device.name : this.name })) : [];
  }

  private sendRoster() {
    if (!this.isHost) return;
    const c = this.app.couch!;
    this.send({ t: "roster", seats: this.roster(), conductor: c.conductor });
  }

  /** Host: a new player arrived: give them a seat (and an instrument), then the song. */
  private peerJoined(peer: string, name: string) {
    const app = this.app, c = app.couch;
    if (!this.isHost || !c) return;
    const seat = c.join({ kind: "net", peer, name });
    if (!seat) { this.send({ t: "full" }, peer); return; }
    this.send({
      t: "snapshot", song: app.song, seats: this.roster(), conductor: c.conductor, sceneId: c.sceneId,
      playing: app.engine.playing,
    }, peer);
    this.sendRoster();
    app.overlays.toast(`${name} joined`);
    app.refresh();
  }

  private peerLeft(peer: string) {
    const app = this.app, c = app.couch;
    if (!c) return;
    const seat = c.seats.find((s) => s.device.kind === "net" && s.device.peer === peer);
    if (!seat) return;
    app.overlays.toast(`${seat.device.kind === "net" ? seat.device.name : "A player"} left`);
    if (this.isHost) { c.leave(seat); this.sendRoster(); }
    app.refresh();
  }

  // ------------------------------------------------------------ guest

  /** Guest: the host's song and seating plan. */
  private snapshot(m: Msg) {
    const app = this.app;
    app.joinedOnline(this, m.song as Song, m.seats as RosterSeat[], m.conductor as string, m.sceneId as number);
    if (m.playing) app.playLocal();
  }

  /** Who sits where (from the host). Keeps each seat's editor state across updates. */
  applyRoster(seats: RosterSeat[], conductor: string) {
    const app = this.app, c = app.couch;
    if (!c) return;
    c.applyRoster(seats.map((s) => ({ ...s, device: { kind: "net" as const, peer: s.peer, name: s.name } })), conductor);
    const mine = c.seats.find((s) => s.device.kind === "net" && s.device.peer === this.myId);
    c.localId = mine?.id ?? null;
    if (mine) { idLanes.lanes = 8; idLanes.lane = mine.slot; }
    app.refresh();
  }

  // ------------------------------------------------------------ messages

  private seatOfPeer(peer: string): Seat | undefined {
    return this.app.couch?.seats.find((s) => s.device.kind === "net" && s.device.peer === peer);
  }

  private onMessage(m: Msg) {
    const app = this.app, c = app.couch, from = m.from ?? "";
    switch (m.t) {
      case "pong": this.pong(m); return;
      case "peer-join": this.peerJoined(m.id as string, m.name as string); return;
      case "peer-leave": this.peerLeft(m.id as string); return;
      case "host-left": this.closed = true; app.onlineEnded("The host ended the game. The song stays here."); return;
      case "full": this.closed = true; app.onlineEnded("That game has no free seat"); return;
      case "snapshot": this.snapshot(m); return;
      case "roster": if (from === this.hostId) this.applyRoster(m.seats as RosterSeat[], m.conductor as string); return;
      case "anchor": if (from === this.hostId) this.anchor(m); return;
      case "transport": this.applyTransport(m); return;
    }
    if (!c) return;
    const seat = this.seatOfPeer(from);
    switch (m.t) {
      case "patches": {
        // The host may change anything (seating a newcomer adds an instrument); others only what they own.
        const patches = m.patches as Patch[];
        if (from !== this.hostId && (!seat || app.owners.refused(seat.id, patches).length)) return;
        app.applyRemote(patches, seat ?? null);
        if (seat && app.localMutes.has(seat.id)) {
          const added = patches.reduce((n, p) => p.path[0] === "clip" ? n + Math.max(0, ((p.value as { notes?: unknown[] })?.notes?.length ?? 0) - ((p.old as { notes?: unknown[] })?.notes?.length ?? 0)) : n, 0);
          if (added) this.unheard.set(seat.id, (this.unheard.get(seat.id) ?? 0) + added);
        }
        return;
      }
      case "cursor": {
        if (!seat) return;
        const ed = seat.ed, view = m.focus as typeof ed.focus;
        const viewChanged = ed.focus !== view;
        Object.assign(ed, { tick: m.tick, pitch: m.pitch, focus: view, viewBars: m.viewBars, scrollTick: m.scrollTick, autoKey: m.autoKey ?? null, velView: !!m.velView, topPitch: m.topPitch ?? ed.topPitch });
        app.remoteCursor(seat, viewChanged);
        return;
      }
      case "scene": if (seat && c.isConductor(seat)) { c.setScene(m.id as number, false); app.refresh(); } return;
      case "conductor": if (seat && (c.isConductor(seat) || from === this.hostId)) { c.setConductor(m.id as string); app.refresh(); } return;
    }
  }

  /** Called every frame: send our cursor when it moved (at most ~12 times a second). */
  private lastCursorAt = 0;
  tickCursor(seat: Seat) {
    const now = performance.now();
    if (now - this.lastCursorAt < 80) return;
    const ed = seat.ed;
    const m = { t: "cursor", tick: ed.tick, pitch: ed.pitch, focus: ed.focus, viewBars: ed.viewBars, scrollTick: ed.scrollTick, autoKey: ed.autoKey, velView: ed.velView, topPitch: ed.topPitch };
    const key = JSON.stringify(m);
    if (key === this.lastCursor) return;
    this.lastCursor = key;
    this.lastCursorAt = now;
    this.send(m);
  }
}
