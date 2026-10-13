// AudioWorklet entry: one "rb-instrument" node per track. Note events arrive
// with context times and are applied at the exact sample frame.

import { AcidDSP, DrumsDSP, PolyDSP, type Clock, type InstrumentDSP } from "./instruments-dsp";
import { makeFx, type Fx } from "./fx-dsp";
import { FX_SLOTS } from "../model";

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

/** Note on/off, or an automation step ("param": set `key` to `value`). */
export interface TimedEvent { time: number; type: "on" | "off" | "param"; pitch: number; vel: number; key?: string; value?: number }

export interface InstrumentOptions {
  kind: "drums" | "acid" | "poly";
  params: Record<string, number>;
  samples?: Float32Array[];
  samplesRate?: number;
  events?: TimedEvent[]; // offline rendering: everything up front
  clock: Clock;
}

export type InstrumentMessage =
  | { t: "events"; events: TimedEvent[] }
  | { t: "live"; type: "on" | "off"; pitch: number; vel: number }
  | { t: "params"; params: Record<string, number> }
  | { t: "clock"; clock: Clock }
  | { t: "samples"; samples: Float32Array[]; samplesRate: number }
  | { t: "stop" };

class RbInstrument extends AudioWorkletProcessor {
  private dsp: InstrumentDSP;
  private queue: TimedEvent[] = [];
  private clock: Clock;
  private fx: (Fx | null)[] = [];
  private fxType: number[] = [];
  private vol = -1;
  private pan = 0;
  private send = 0;

  constructor(options: { processorOptions: InstrumentOptions }) {
    super();
    const o = options.processorOptions;
    this.clock = { ...o.clock };
    if (o.kind === "drums") {
      const d = new DrumsDSP(o.params, o.samples ?? [], sampleRate);
      d.samplesRate = o.samplesRate ?? sampleRate;
      this.dsp = d;
    } else if (o.kind === "acid") this.dsp = new AcidDSP(o.params, sampleRate, this.clock);
    else this.dsp = new PolyDSP(o.params, sampleRate);
    if (o.events) this.enqueue(o.events);
    this.port.onmessage = (e: MessageEvent<InstrumentMessage>) => this.onMessage(e.data);
  }

  private enqueue(events: TimedEvent[]) {
    for (const ev of events) this.queue.push(ev);
    // Same time: note-offs first, so a repeated pitch retriggers cleanly.
    this.queue.sort((a, b) => a.time - b.time || (a.type === b.type ? 0 : a.type === "off" ? -1 : 1));
  }

  private onMessage(m: InstrumentMessage) {
    switch (m.t) {
      case "events": this.enqueue(m.events); break;
      case "live":
        if (m.type === "on") this.dsp.noteOn(m.pitch, m.vel, currentTime);
        else this.dsp.noteOff(m.pitch, currentTime);
        break;
      case "params": Object.assign(this.dsp.params, m.params); break;
      case "clock": Object.assign(this.clock, m.clock); break;
      case "samples":
        if (this.dsp instanceof DrumsDSP) { this.dsp.setSamples(m.samples); this.dsp.samplesRate = m.samplesRate; }
        break;
      case "stop":
        this.queue.length = 0;
        this.dsp.allOff();
        break;
    }
  }

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const L = outputs[0][0];
    const R = outputs[0][1] ?? L;
    const n = L.length;
    this.renderInstrument(L, R, n);
    this.post(L, R, n, outputs[1]);
    return true;
  }

  /** Insert FX chain, then volume / pan (smoothed, automatable) and the reverb send output. */
  private post(L: Float32Array, R: Float32Array, n: number, sendOut: Float32Array[] | undefined) {
    const p = this.dsp.params;
    for (let s = 0; s < FX_SLOTS; s++) {
      const type = Math.round(p[`fx${s}:type`] ?? 0);
      if (type !== this.fxType[s]) { this.fxType[s] = type; this.fx[s] = makeFx(type, sampleRate); }
      this.fx[s]?.process(L, R, n, p[`fx${s}:a`] ?? 0.5, p[`fx${s}:b`] ?? 0.5, currentTime, this.clock);
    }
    const vt = p["mix:vol"] ?? 0.8, pt = p["mix:pan"] ?? 0, st = p["mix:send"] ?? 0;
    if (this.vol < 0) { this.vol = vt; this.pan = pt; this.send = st; }
    const sl = sendOut?.[0], sr = sendOut?.[1];
    for (let i = 0; i < n; i++) {
      // ~5 ms smoothing: automation steps and knob moves never click.
      this.vol += (vt - this.vol) * 0.004;
      this.pan += (pt - this.pan) * 0.004;
      this.send += (st - this.send) * 0.004;
      const g = this.vol * this.vol * 1.25; // squared: a fader-like curve
      const a = ((this.pan + 1) * Math.PI) / 4;
      const l = L[i] * g * Math.cos(a) * 1.414, r = R[i] * g * Math.sin(a) * 1.414;
      L[i] = l; R[i] = r;
      if (sl && sr) { sl[i] = l * this.send; sr[i] = r * this.send; }
    }
  }

  private renderInstrument(L: Float32Array, R: Float32Array, n: number) {
    let i0 = 0;
    while (i0 < n) {
      // Render up to the next event's frame, then apply every event due there.
      let i1 = n;
      const head = this.queue[0];
      if (head) {
        const f = Math.max(i0, Math.round((head.time - currentTime) * sampleRate));
        if (f < n) i1 = f;
      }
      if (i1 > i0) this.dsp.render(L, R, i0, i1, currentTime);
      i0 = i1;
      while (this.queue.length && Math.round((this.queue[0].time - currentTime) * sampleRate) <= i0) {
        const ev = this.queue.shift()!;
        const t = currentTime + i0 / sampleRate;
        if (ev.type === "on") this.dsp.noteOn(ev.pitch, ev.vel, t);
        else if (ev.type === "off") this.dsp.noteOff(ev.pitch, t);
        else if (ev.key) this.dsp.params[ev.key] = ev.value!;
      }
      if (i0 >= n) break;
    }
  }
}

registerProcessor("rb-instrument", RbInstrument);
