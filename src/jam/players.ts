// TILT Jam with friends. Every action (a knob, a pad, a section...) goes through act(): played
// here when solo or hosting, sent to the host when you're a guest online.
//
// Couch: the keyboard and mouse are P1 (any card nobody has taken). Each gamepad or MIDI controller
// that presses something joins and takes the next free card, and its knobs drive that card's
// macros (a MiniLab's top row: knobs 1-5; any other controller: its knobs in the order you first
// turn them). Online: every computer is one player; take a card with its "Take" button.

import { GamepadInput } from "../ui/input";
import type { Action } from "../ui/actions";
import { Midi } from "../ui/midi";
import { h } from "../ui/dom";
import { ROLE_MACROS } from "./macros";
import { PACKS } from "./packs";
import { FX_LIST, type FxId } from "./fx";
import { PAD_SECTIONS, type Section } from "./pack";
import { JamNet, relayUrl, type Msg } from "./net";
import type { JamApp } from "./ui";
import type { JamState } from "./build";

export type Act =
  | { a: "knob"; part: number; k: number; v: number }
  | { a: "dice" | "mute" | "reset" | "claim" | "release"; part: number }
  | { a: "section"; s: Section }
  | { a: "song" } | { a: "prog" } | { a: "back" } | { a: "play" }
  | { a: "fx"; id: FxId; on: boolean };

export interface Player { id: string; name: string; color: string; kind: "keys" | "pad" | "midi" | "net"; part: number | null; knob: number }

const COLORS = ["#4fe3ff", "#ff6b5c", "#5cf2a6", "#b28dff", "#ffd23f", "#ff8bd2", "#9be15d", "#ffa45c"];
const ICON: Record<Player["kind"], string> = { keys: "⌨", pad: "🎮", midi: "🎹", net: "🌐" };

export class Players {
  list: Player[] = [];
  net: JamNet | null = null;
  private pads = new Map<number, GamepadInput>();
  private midi: Midi;
  private midiMaps = new Map<string, number[]>(); // device -> CC numbers in the order first turned
  private broadcastTimer = 0;

  constructor(private app: JamApp) {
    this.midi = new Midi({
      onKey: () => this.player(this.midiId()),
      onPad: (i, _v, on) => this.midiPad(i, on),
      onMacro: (i, v) => this.midiKnob(i, v),
      onTrackVolume: (i, v) => { const s = this.app.session; if (s && i < s.t.parts.length) this.turn(i, ROLE_MACROS[s.t.parts[i].role].findIndex((m) => m.id === "level"), v, this.midiId()); },
      onTransport: () => this.act({ a: "play" }, this.midiId()),
      onDevicesChanged: () => {},
      onCC: (_ch, cc, _raw, v) => this.genericCC(cc, v),
      onRealtime: () => {},
      onPush: () => null,
    });
    const loop = (now: number) => { this.pollPads(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /** On the first jam (a click): MIDI permission, and P1 (keyboard + mouse). */
  begin() {
    if (!this.midi.access && this.midi.supported) void this.midi.enable();
    if (!this.list.length) this.list.push({ id: "p1", name: "P1", color: COLORS[0], kind: "keys", part: null, knob: 0 });
  }

  /** The player the mouse and keyboard act for. */
  get me(): Player {
    if (this.net) return this.list.find((p) => p.id === this.net!.myId) ?? { id: this.net.myId, name: this.net.name, color: COLORS[0], kind: "net", part: null, knob: 0 };
    return this.list.find((p) => p.kind === "keys") ?? this.list[0];
  }

  ownerOf(part: number): Player | undefined { return this.list.find((p) => p.part === part); }
  /** May this player touch that card? (Free cards: anyone; taken ones: only their player.) */
  may(p: Player, part: number) { const o = this.ownerOf(part); return !o || o.id === p.id; }
  get multiplayer() { return this.list.length > 1 || !!this.net; }

  // ------------------------------------------------------------ actions

  act(a: Act, by = this.me.id) {
    if (this.net && !this.net.isHost) { this.net.send({ t: "jam-act", act: a as unknown as Msg }); if (a.a === "knob") this.perform(a, by, true); return; }
    this.perform(a, by);
  }

  /** Play an action here (solo / host). `preview`: a guest's own knob, shown at once and corrected by the host's state. */
  private perform(a: Act, by: string, preview = false) {
    const s = this.app.session;
    if (!s) return;
    const p = this.list.find((x) => x.id === by) ?? this.me;
    if ("part" in a && a.a !== "claim" && !this.may(p, a.part)) { this.app.toast(`That's ${this.ownerOf(a.part)!.name}'s part`); return; }
    switch (a.a) {
      case "knob": s.setKnob(a.part, a.k, a.v); if (preview) return; break;
      case "dice": s.dice(a.part); break;
      case "mute": s.toggleMute(a.part); break;
      case "reset": s.resetPart(a.part); break;
      case "claim": this.claim(p, a.part); break;
      case "release": if (p.part === a.part) p.part = null; this.app.renderJam(); break;
      case "section": s.playSection(a.s); break;
      case "song": s.followSong(); break;
      case "prog": s.shuffleProgression(); break;
      case "back": s.backToGood(); break;
      case "play": this.play(); break;
      case "fx": if (a.on) s.fx?.press(a.id); else s.fx?.release(a.id); this.net?.send({ t: "jam-fx", id: a.id, on: a.on }); this.app.refresh(); return;
    }
    this.broadcast();
  }

  private claim(p: Player, part: number) {
    if (this.ownerOf(part) && this.ownerOf(part) !== p) return;
    p.part = part;
    p.knob = 0;
    const name = this.app.session?.t.parts[part]?.name ?? "";
    this.app.toast(`${p.name} plays ${name}`);
    this.app.renderJam();
  }

  /** The next card nobody has, after `from`. */
  private freeCard(from = -1, dir = 1): number | null {
    const n = this.app.session?.t.parts.length ?? 0;
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (!this.ownerOf(i)) return i;
    }
    return null;
  }

  private play() {
    const s = this.app.session!;
    if (this.net?.isHost) {
      if (s.playing) { s.stop(); this.net.send({ t: "jam-stop" }); return; }
      const at = this.net.serverNow() + 300;
      this.net.send({ t: "jam-play", at });
      setTimeout(() => { if (!s.playing) s.togglePlay(); }, 300);
      return;
    }
    s.togglePlay();
  }

  /** Host: everyone gets the new state (a few changes in a row go as one). */
  broadcast() {
    if (!this.net?.isHost) return;
    clearTimeout(this.broadcastTimer);
    this.broadcastTimer = setTimeout(() => {
      const s = this.app.session;
      if (s) this.net!.send({ t: "jam-state", st: s.st as unknown as Msg, held: s.held, roster: this.list as unknown as Msg[] });
    }, 30) as unknown as number;
  }

  // ------------------------------------------------------------ controllers on the couch

  /** The player for a local device, joining (and taking a free card) on first use. Online: all of them are you. */
  private player(device: string): Player | null {
    const s = this.app.session;
    if (!s) return null;
    if (this.net) return this.me;
    let p = this.list.find((x) => x.id === device);
    if (!p) {
      const kind: Player["kind"] = device.startsWith("pad") ? "pad" : "midi";
      p = { id: device, name: `P${this.list.length + 1}`, color: COLORS[this.list.length % COLORS.length], kind, part: null, knob: 0 };
      this.list.push(p);
      const card = this.freeCard();
      if (card !== null) this.claim(p, card);
      else { this.app.toast(`${p.name} joined (every part is taken)`); this.app.renderJam(); }
    }
    return p;
  }

  private turn(part: number, k: number, v: { abs?: number; delta?: number }, by: string) {
    const s = this.app.session;
    if (!s || k < 0) return;
    const cur = s.st.knobs[part]?.[k];
    if (cur === undefined) return;
    const next = v.abs !== undefined ? v.abs : cur + (v.delta ?? 0) * 0.015;
    this.act({ a: "knob", part, k, v: Math.max(0, Math.min(1, next)) }, by);
    this.app.refresh();
  }

  private pollPads(now: number) {
    for (const [i, pad] of [...(navigator.getGamepads?.() ?? [])].entries()) {
      if (!pad?.connected) continue;
      let g = this.pads.get(i);
      if (!g) { g = new GamepadInput({ action: (a) => this.padAction(i, a), musicKey: () => {} }, i); this.pads.set(i, g); }
      if (this.app.session) g.poll(now);
    }
  }

  /**
   * A gamepad on its card: left / right picks a knob, up / down (or the right stick) turns it, A sends
   * it home, X another riff, B mute, RB / LB the next / previous free card. Y play, Start BACK TO
   * GOOD, View the next section, L3 the song, R3 another progression, RT (hold) the filter sweep.
   */
  private padAction(index: number, a: Action) {
    const p = this.player(`pad${index}`);
    const s = this.app.session;
    if (!p || !s) return;
    const part = p.part;
    const n = part !== null ? ROLE_MACROS[s.t.parts[part].role].length : 0;
    switch (a.type) {
      case "dir":
        if (part === null) return;
        if (a.dir === "left" || a.dir === "right") { p.knob = (p.knob + (a.dir === "right" ? 1 : -1) + n) % n; this.app.refresh(); }
        else this.turn(part, p.knob, { delta: a.dir === "up" ? 4 : -4 }, p.id);
        return;
      case "knob": if (part !== null) this.turn(part, p.knob, { delta: (a.dx + a.dy) * 1.2 }, p.id); return;
      case "confirm": if (part !== null) { const m = ROLE_MACROS[s.t.parts[part].role][p.knob]; this.act({ a: "knob", part, k: p.knob, v: s.t.parts[part].home?.[m.id] ?? m.home }, p.id); this.app.refresh(); } return;
      case "menu": if (part !== null) this.act({ a: "dice", part }, p.id); return;
      case "back": if (part !== null) this.act({ a: "mute", part }, p.id); return;
      case "focusSwap": case "shortcut": {
        if (a.type === "shortcut" && !a.down) return;
        const next = this.freeCard(part ?? -1, a.type === "focusSwap" ? 1 : -1);
        if (next !== null) { if (this.net) this.act({ a: "claim", part: next }, p.id); else { p.part = null; this.claim(p, next); } }
        return;
      }
      case "play": this.act({ a: "play" }, p.id); return;
      case "system": this.act({ a: "back" }, p.id); return;
      case "undo": {
        const cur = s.section, i = cur ? PAD_SECTIONS.indexOf(cur) : -1;
        this.act({ a: "section", s: PAD_SECTIONS[(i + 1) % PAD_SECTIONS.length] }, p.id);
        return;
      }
      case "playMode": this.act({ a: "song" }, p.id); return;
      case "aux": this.act({ a: "prog" }, p.id); return;
      case "selectHold": this.act({ a: "fx", id: "sweep", on: a.down }, p.id); return;
    }
  }

  // ------------------------------------------------------------ MIDI

  private midiId() { return `midi:${this.midi.lastInput}`; }

  /** MiniLab top row (and any knob mapped below): the card's macros, in order. */
  private midiKnob(i: number, v: { abs?: number; delta?: number }) {
    const p = this.player(this.midiId());
    if (p?.part == null) return;
    this.turn(p.part, i, v, p.id);
  }

  /** Other controllers: each new CC takes the next macro, in the order they're first turned. */
  private genericCC(cc: number, v: { abs?: number; delta?: number }): boolean {
    if (this.midi.isMiniLab(this.midi.lastInput)) return false;
    const id = this.midiId(), map = this.midiMaps.get(id) ?? [];
    if (!map.includes(cc)) map.push(cc);
    this.midiMaps.set(id, map);
    this.midiKnob(map.indexOf(cc), v);
    return true;
  }

  /**
   * MiniLab pads. Bank 1: dice, mute, reset, BACK TO GOOD, then four FX (held). Bank 2: the five
   * sections, the song, another progression, the riser (held).
   */
  private midiPad(i: number, on: boolean) {
    const p = this.player(this.midiId());
    if (!p) return;
    const fx = (id: FxId) => this.act({ a: "fx", id, on }, p.id);
    if (i === 4) return fx("sweep"); if (i === 5) return fx("stutter"); if (i === 6) return fx("tape"); if (i === 7) return fx("verb"); if (i === 15) return fx("riser");
    if (!on) return;
    if (i === 0 && p.part !== null) this.act({ a: "dice", part: p.part }, p.id);
    else if (i === 1 && p.part !== null) this.act({ a: "mute", part: p.part }, p.id);
    else if (i === 2 && p.part !== null) this.act({ a: "reset", part: p.part }, p.id);
    else if (i === 3) this.act({ a: "back" }, p.id);
    else if (i >= 8 && i <= 12) this.act({ a: "section", s: PAD_SECTIONS[i - 8] }, p.id);
    else if (i === 13) this.act({ a: "song" }, p.id);
    else if (i === 14) this.act({ a: "prog" }, p.id);
  }

  // ------------------------------------------------------------ the card's badge

  /** Who plays this card (and a Take / Leave button for the mouse player). */
  badge(part: number): HTMLElement {
    const o = this.ownerOf(part), me = this.me;
    if (!this.multiplayer && !o) return h("span");
    if (o) {
      return h("span", { class: "card-owner", style: `--pc:${o.color}` }, `${ICON[o.kind]} ${o.name}`,
        o.id === me.id ? h("button", { class: "card-take", title: "Leave this card free for someone else", onclick: () => this.act({ a: "release", part }) }, "Leave") : "");
    }
    return h("button", { class: "card-take", title: "Play this part (only you can turn it)", onclick: () => this.act({ a: "claim", part }) }, "Take");
  }

  /** The knob a controller player has picked on this card (and their colour). */
  focus(part: number): { k: number; color: string } | null {
    const o = this.ownerOf(part);
    return o && (o.kind === "pad" || o.kind === "midi") ? { k: o.knob, color: o.color } : null;
  }

  // ------------------------------------------------------------ online

  async host(name: string): Promise<string> {
    const net = new JamNet(name, this.hooks());
    await net.connect(relayUrl(), { create: true });
    this.net = net;
    const me = this.me, keys = this.list.find((p) => p.kind === "keys");
    // P1 becomes this computer's online player (keeping their card).
    this.list = this.list.filter((p) => p.kind !== "keys");
    this.list.unshift({ ...me, id: net.myId, name, kind: "net", part: keys?.part ?? null });
    const eng = this.app.session?.engine;
    net.anchorSource = () => (eng?.playing ? eng.globalTickAt(eng.heardTime(performance.now())) : null);
    this.app.renderJam();
    return net.room;
  }

  async join(name: string, room: string) {
    const net = new JamNet(name, this.hooks());
    await net.connect(relayUrl(), { room });
    this.net = net;
  }

  leave() {
    this.net?.close();
    this.net = null;
    this.list = this.list.filter((p) => p.kind !== "net");
    if (!this.list.some((p) => p.kind === "keys")) this.list.unshift({ id: "p1", name: "P1", color: COLORS[0], kind: "keys", part: null, knob: 0 });
    this.app.renderJam();
  }

  private hooks() {
    const app = this.app;
    return {
      onJoin: (peer: string, name: string) => {
        const s = app.session;
        if (!s) return;
        this.list.push({ id: peer, name: name || `P${this.list.length + 1}`, color: COLORS[this.list.length % COLORS.length], kind: "net", part: null, knob: 0 });
        const pack = PACKS.find((p) => p.templates.includes(s.t))!;
        this.net!.send({ t: "jam-hello", pack: pack.id, tpl: s.t.id, key: s.st.key, scale: s.st.scale, tempo: s.st.tempo, st: s.st as unknown as Msg, held: s.held, playing: s.playing, roster: this.list as unknown as Msg[] }, peer);
        app.toast(`${name} joined the jam`);
        app.renderJam();
        this.broadcast();
      },
      onLeave: (peer: string) => {
        const p = this.list.find((x) => x.id === peer);
        if (!p) return;
        this.list = this.list.filter((x) => x !== p);
        app.toast(`${p.name} left`);
        app.renderJam();
        this.broadcast();
      },
      onHello: async (m: Msg) => {
        const tpl = PACKS.find((p) => p.id === m.pack)?.templates.find((t) => t.id === m.tpl);
        if (!tpl) { app.toast("The host plays a template this TILT doesn't have: reload the page"); return; }
        this.list = (m.roster as unknown as Player[]) ?? [];
        await app.start(tpl, { key: m.key as number, scale: m.scale as string, tempo: m.tempo as number, remote: true });
        app.session!.applyRemote(m.st as unknown as JamState, (m.held as Section | null) ?? null);
        if (!m.playing) app.session!.stop();
        app.renderJam();
      },
      onState: (st: JamState, held: Section | null, roster: Msg["roster"]) => {
        if (roster) this.list = roster as unknown as Player[];
        app.session?.applyRemote(st, held);
        app.renderJam();
      },
      onAct: (peer: string, act: Msg) => this.perform(act as unknown as Act, peer),
      onPlay: (at: number) => { const s = app.session; if (s) setTimeout(() => { if (!s.playing) s.togglePlay(); }, Math.max(0, at - this.net!.serverNow())); },
      onStop: () => app.session?.stop(),
      onAnchor: (sTime: number, tick: number) => {
        const s = app.session, eng = s?.engine;
        if (!eng) return;
        if (!eng.playing) { s!.togglePlay(); return; }
        const gt = tick + ((this.net!.serverNow() - sTime) / 1000) * eng.ticksPerSec();
        eng.alignTo(gt, eng.heardTime(performance.now()));
      },
      onFx: (id: string, on: boolean) => { const fx = app.session?.fx; if (fx) { if (on) fx.press(id as FxId); else fx.release(id as FxId); app.refresh(); } },
      onEnded: (why: string) => { app.toast(why); this.leave(); },
    };
  }
}

export { FX_LIST };
