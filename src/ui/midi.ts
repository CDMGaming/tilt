// Web MIDI input, with an auto-detected profile for the Arturia MiniLab mkII.

export interface MidiSink {
  /** Keys (and pads on non-drum tracks route elsewhere, see onPad). `time` is event.timeStamp (ms, performance clock). */
  onKey(pitch: number, vel: number, on: boolean, time: number): void;
  /** MiniLab pads: index 0..15. */
  onPad(index: number, vel: number, on: boolean, time: number): void;
  /** 8 macro knobs of the selected track. Either an absolute 0..1 position or a relative step count. */
  onMacro(index: number, v: { abs?: number; delta?: number }): void;
  /** Bottom-row knobs: track volumes. */
  onTrackVolume(index: number, v: { abs?: number; delta?: number }): void;
  onTransport(what: "play"): void;
  onDevicesChanged(): void;
  /** Any CC, before the device profile. Return true if it was used (learn / learned binding / transport). */
  onCC(ch: number, cc: number, raw: number, v: { abs?: number; delta?: number }): boolean;
  /** System realtime: clock 0xF8, start 0xFA, continue 0xFB, stop 0xFC. */
  onRealtime(byte: number, time: number): void;
  /** A Push 1 appeared (output for LEDs/LCD) or went away (null). */
  onPush(port: { out: MIDIOutput | null; sysex: boolean } | null): ((d: Uint8Array, t: number) => void) | null;
}

export interface MonitorLine { time: number; device: string; text: string }

import { isPush1Name } from "./push1";

// MiniLab mkII factory map (Arturia's default template).
// Knobs are endless encoders; in the factory template they send relative values.
const MINILAB_TOP = [112, 74, 71, 76, 77, 93, 73, 75];
const MINILAB_BOTTOM = [114, 18, 19, 16, 17, 91, 79, 72];
const MINILAB_KNOB1_CLICK = 113;
const MINILAB_PAD_CHANNEL = 9; // channel 10, zero-based
const MINILAB_PAD_BASE = 36;

type KnobMode = "unknown" | "abs" | "rel64" | "rel2c";

export class Midi {
  access: MIDIAccess | null = null;
  error = "";
  monitor: MonitorLine[] = [];
  private knobMode = new Map<string, KnobMode>();

  constructor(private sink: MidiSink) {}

  get supported() { return !!navigator.requestMIDIAccess; }

  async enable() {
    if (!this.supported) { this.error = "This browser has no Web MIDI (use Chrome or Edge)."; return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      // The Push 1 LCD needs SysEx: ask for it only when a Push is actually connected.
      if (this.inputs().some((i) => isPush1Name(i.name ?? ""))) await this.upgradeSysex();
      this.access.onstatechange = () => {
        if (!this.access!.sysexEnabled && this.inputs().some((i) => isPush1Name(i.name ?? ""))) void this.upgradeSysex().then(() => { this.bind(); this.sink.onDevicesChanged(); });
        this.bind();
        this.sink.onDevicesChanged();
      };
      this.bind();
      this.sink.onDevicesChanged();
    } catch (e) {
      this.error = `MIDI permission refused: ${e}`;
    }
  }

  private async upgradeSysex() {
    try {
      const a = await navigator.requestMIDIAccess({ sysex: true });
      a.onstatechange = this.access?.onstatechange ?? null;
      this.access = a;
    } catch { /* refused: the Push still works, just without its display */ }
  }

  private pushHandler: ((d: Uint8Array, t: number) => void) | null = null;
  private pushName = "";

  get pushConnected() { return !!this.pushHandler; }
  /** The port the message being handled came from (couch mode: which player). */
  lastInput = "";

  outputs(): MIDIOutput[] {
    const out: MIDIOutput[] = [];
    this.access?.outputs.forEach((o) => { if (o.state === "connected") out.push(o); });
    return out;
  }

  inputs(): MIDIInput[] {
    const out: MIDIInput[] = [];
    this.access?.inputs.forEach((i) => { if (i.state === "connected") out.push(i); });
    return out;
  }

  isMiniLab(name: string | null | undefined) { return /minilab\s*mk\s*ii|minilab\s*mkii/i.test(name ?? ""); }

  get miniLabConnected() { return this.inputs().some((i) => this.isMiniLab(i.name)); }

  private bind() {
    const push = this.inputs().find((i) => isPush1Name(i.name ?? ""));
    if (push && push.name !== this.pushName) {
      this.pushName = push.name ?? "";
      const out = this.outputs().find((o) => isPush1Name(o.name ?? "")) ?? null;
      this.pushHandler = this.sink.onPush({ out, sysex: !!this.access?.sysexEnabled });
    } else if (!push && this.pushHandler) {
      this.pushName = "";
      this.pushHandler = null;
      this.sink.onPush(null);
    }
    for (const input of this.inputs()) {
      if (push && input === push && this.pushHandler) {
        const h = this.pushHandler;
        input.onmidimessage = (e) => {
          const ev = e as MIDIMessageEvent;
          if (!ev.data) return;
          if (ev.data[0] >= 0xf8) { this.sink.onRealtime(ev.data[0], ev.timeStamp); return; }
          this.log(input.name ?? "Push", Array.from(ev.data).map((b) => b.toString(16).padStart(2, "0")).join(" "));
          h(ev.data, ev.timeStamp);
        };
      } else input.onmidimessage = (e) => this.onMessage(input, e as MIDIMessageEvent);
    }
  }

  private log(device: string, text: string) {
    this.monitor.push({ time: performance.now(), device, text });
    if (this.monitor.length > 60) this.monitor.shift();
  }

  private onMessage(input: MIDIInput, e: MIDIMessageEvent) {
    const d = e.data;
    if (!d || d.length < 1) return;
    const status = d[0] & 0xf0, ch = d[0] & 0x0f;
    const name = input.name ?? "MIDI";
    this.lastInput = name;
    const mini = this.isMiniLab(name);
    if (d[0] >= 0xf8) { if (d[0] !== 0xf8) this.log(name, `${d[0].toString(16)}  ${({ 0xfa: "start", 0xfb: "continue", 0xfc: "stop" } as Record<number, string>)[d[0]] ?? "realtime"}`); this.sink.onRealtime(d[0], e.timeStamp); return; }
    if (status === 0xf0) return; // sysex
    const hex = Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    if (status === 0x90 || status === 0x80) {
      const on = status === 0x90 && d[2] > 0;
      this.log(name, `${hex}  note ${on ? "on " : "off"} ch${ch + 1} n${d[1]} v${d[2]}`);
      if (mini && ch === MINILAB_PAD_CHANNEL && d[1] >= MINILAB_PAD_BASE && d[1] < MINILAB_PAD_BASE + 16) {
        this.sink.onPad(d[1] - MINILAB_PAD_BASE, d[2], on, e.timeStamp);
      } else this.sink.onKey(d[1], d[2], on, e.timeStamp);
      return;
    }
    if (status === 0xb0) {
      const cc = d[1], val = d[2];
      this.log(name, `${hex}  CC ch${ch + 1} #${cc} = ${val}`);
      const v = this.knobValue(`${name}:${cc}`, val);
      if (this.sink.onCC(ch, cc, val, v)) return;
      if (mini && cc === MINILAB_KNOB1_CLICK) { if (val > 0) this.sink.onTransport("play"); return; }
      const top = MINILAB_TOP.indexOf(cc), bottom = MINILAB_BOTTOM.indexOf(cc);
      if (!mini || (top < 0 && bottom < 0)) return;
      if (top >= 0) this.sink.onMacro(top, v);
      else this.sink.onTrackVolume(bottom, v);
      return;
    }
    this.log(name, hex);
  }

  /**
   * Decide per knob whether it sends absolute positions or relative steps.
   * Relative encoders hover around 64 (Arturia "Relative #1") or 0/127
   * (two's complement); an absolute knob soon sends something else.
   */
  private knobValue(key: string, val: number): { abs?: number; delta?: number } {
    let mode = this.knobMode.get(key) ?? "unknown";
    const near64 = val >= 56 && val <= 72 && val !== 64;
    const twos = (val >= 1 && val <= 8) || (val >= 120 && val <= 127);
    if (mode === "unknown") mode = near64 ? "rel64" : twos ? "rel2c" : "abs";
    else if (mode === "rel64" && !near64) mode = "abs";
    else if (mode === "rel2c" && !twos) mode = "abs";
    this.knobMode.set(key, mode);
    if (mode === "rel64") return { delta: val - 64 };
    if (mode === "rel2c") return { delta: val < 64 ? val : val - 128 };
    return { abs: val / 127 };
  }

  knobModes(): string[] {
    return [...this.knobMode.entries()].map(([k, m]) => `${k.split(":").pop()}: ${m}`);
  }
}
