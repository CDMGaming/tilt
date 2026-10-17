// TILT Jam online: friends on other computers each take a part card. Same relay as TILT Studio's
// online games (rooms, peer ids, a server clock). The host's machine holds the jam: guests send
// their actions, the host applies them and sends everyone the new state. Every machine plays the
// music itself; the host sends "song position at server time" every second so all stay on the beat.

import type { JamState } from "./build";
import type { Section } from "./pack";

export type Msg = Record<string, unknown> & { t: string; from?: string };
const wall = () => performance.timeOrigin + performance.now();

export interface NetHooks {
  /** Host: someone joined (send them the jam). */
  onJoin(peer: string, name: string): void;
  onLeave(peer: string): void;
  /** Guest: the jam to play (template, key, tempo, state, roster). */
  onHello(m: Msg): void;
  /** Guest: a new state from the host. */
  onState(st: JamState, held: Section | null, roster: Msg["roster"]): void;
  /** Host: a guest's action. */
  onAct(peer: string, act: Msg): void;
  /** Everyone: the host's transport and beat. */
  onPlay(at: number): void;
  onStop(): void;
  onAnchor(serverTime: number, tick: number): void;
  onFx(id: string, on: boolean): void;
  onEnded(why: string): void;
}

export class JamNet {
  ws!: WebSocket;
  myId = "";
  hostId = "";
  room = "";
  closed = false;
  private offset = 0;
  private samples: { rtt: number; offset: number }[] = [];
  private timers: number[] = [];

  constructor(readonly name: string, private hooks: NetHooks) {}

  get isHost() { return this.myId !== "" && this.myId === this.hostId; }
  serverNow() { return wall() + this.offset; }

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
          this.myId = m.id as string; this.hostId = m.hostId as string; this.room = m.room as string;
          this.offset = (m.s as number) - wall();
          this.startClock();
          resolve();
          return;
        }
        this.onMessage(m);
      };
      ws.onerror = () => { if (!welcomed) reject(`Couldn't reach the online server at ${url}`); };
      ws.onclose = () => { if (!welcomed) reject(`Couldn't reach the online server at ${url}`); else if (!this.closed) this.hooks.onEnded("Lost the connection to the online server"); };
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

  /** Host: the beat, every second (set by the app: the song position heard now, or null). */
  anchorSource: (() => number | null) | null = null;

  private startClock() {
    const ping = () => this.send({ t: "ping", c: wall() });
    ping();
    let n = 0;
    const fast = setInterval(() => { ping(); if (++n >= 6) clearInterval(fast); }, 300) as unknown as number;
    this.timers.push(fast, setInterval(ping, 4000) as unknown as number);
    this.timers.push(setInterval(() => {
      if (!this.isHost) return;
      const tick = this.anchorSource?.();
      if (tick != null) this.send({ t: "anchor", s: this.serverNow(), tick });
    }, 1000) as unknown as number);
  }

  private onMessage(m: Msg) {
    const h = this.hooks, from = m.from ?? "", fromHost = from === this.hostId;
    switch (m.t) {
      case "pong": {
        const now = wall(), rtt = now - (m.c as number);
        this.samples.push({ rtt, offset: (m.s as number) + rtt / 2 - now });
        if (this.samples.length > 8) this.samples.shift();
        this.offset = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
        return;
      }
      case "peer-join": if (this.isHost) h.onJoin(m.id as string, m.name as string); return;
      case "peer-leave": h.onLeave(m.id as string); return;
      case "host-left": this.closed = true; h.onEnded("The host ended the jam."); return;
      case "full": this.closed = true; h.onEnded("That jam is full"); return;
      case "jam-hello": if (fromHost) h.onHello(m); return;
      case "jam-state": if (fromHost) h.onState(m.st as JamState, (m.held as Section | null) ?? null, m.roster); return;
      case "jam-act": if (this.isHost) h.onAct(from, m.act as Msg); return;
      case "jam-play": if (fromHost) h.onPlay(m.at as number); return;
      case "jam-stop": if (fromHost) h.onStop(); return;
      case "anchor": if (fromHost) h.onAnchor(m.s as number, m.tick as number); return;
      case "jam-fx": if (fromHost) h.onFx(m.id as string, !!m.on); return;
    }
  }
}

/** The relay: next to the app (/relay), or on the dev server port 8787. */
export function relayUrl(): string {
  if (import.meta.env.DEV) return `ws://${location.hostname || "localhost"}:8787`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/relay`;
}
