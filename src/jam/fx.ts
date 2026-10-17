// The performance FX strip: hold to apply, let go and it springs back. All on the master bus
// (before the always-on limiter), so nothing a player does here can get past it.

import type { AudioEngine } from "../engine/audio";
import type { Template } from "./pack";

export type FxId = "sweep" | "stutter" | "tape" | "verb" | "riser";
export const FX_LIST: { id: FxId; label: string; key: string; hint: string }[] = [
  { id: "sweep", label: "Filter sweep", key: "1", hint: "Hold: the band sinks behind a closing filter. Let go: it opens up again" },
  { id: "stutter", label: "Stutter", key: "2", hint: "Hold: the band chops in time" },
  { id: "tape", label: "Tape stop", key: "3", hint: "Hold: the tape slows to a halt. Let go: back up to speed" },
  { id: "verb", label: "Huge reverb", key: "4", hint: "Hold: everything goes into a giant hall" },
  { id: "riser", label: "Riser", key: "5", hint: "Hold: a rising noise sweep that builds and builds (let go on the drop)" },
];

export class PerfFx {
  held = new Set<FxId>();
  private riser: { src: AudioBufferSourceNode; gain: GainNode; bp: BiquadFilterNode } | null = null;
  private stutterTimer = 0;
  private tapeTimer = 0;

  constructor(private eng: AudioEngine, private t: Template, private tempo: () => number) {}

  private get ctx() { return this.eng.ctx; }
  private get p() { return this.eng.perf; }

  press(id: FxId) {
    if (this.held.has(id)) return;
    this.held.add(id);
    const now = this.ctx.currentTime, p = this.p;
    switch (id) {
      case "sweep":
        p.filter.Q.setTargetAtTime(0.7 + this.t.fx.reso * 8, now, 0.05);
        p.filter.frequency.cancelScheduledValues(now);
        p.filter.frequency.setValueAtTime(p.filter.frequency.value, now);
        p.filter.frequency.exponentialRampToValueAtTime(260, now + 1.8);
        break;
      case "stutter": this.stutter(); break;
      case "tape": this.tapeStop(); break;
      case "verb":
        p.wet.gain.setTargetAtTime(0.6 + this.t.fx.reverb * 0.9, now, 0.08);
        break;
      case "riser": this.startRiser(); break;
    }
  }

  release(id: FxId) {
    if (!this.held.delete(id)) return;
    const now = this.ctx.currentTime, p = this.p;
    switch (id) {
      case "sweep":
        p.filter.frequency.cancelScheduledValues(now);
        p.filter.frequency.setValueAtTime(Math.max(40, p.filter.frequency.value), now);
        p.filter.frequency.exponentialRampToValueAtTime(22000, now + 0.35);
        p.filter.Q.setTargetAtTime(0.7, now + 0.3, 0.05);
        break;
      case "stutter":
        clearTimeout(this.stutterTimer);
        p.gate.gain.cancelScheduledValues(now);
        p.gate.gain.setTargetAtTime(1, now, 0.005);
        break;
      case "tape":
        clearInterval(this.tapeTimer);
        this.eng.setTempoOverride(null);
        p.gate.gain.cancelScheduledValues(now);
        p.gate.gain.setTargetAtTime(1, now, 0.03);
        p.filter.frequency.cancelScheduledValues(now);
        p.filter.frequency.setTargetAtTime(22000, now, 0.08);
        break;
      case "verb": p.wet.gain.setTargetAtTime(0, now, 0.6); break; // the tail rings out
      case "riser": this.stopRiser(); break;
    }
  }

  releaseAll() { for (const id of [...this.held]) this.release(id); }

  /** Gate the band on and off in 16ths (or 8ths), in time, for as long as it's held. */
  private stutter() {
    const g = this.p.gate.gain, beat = 60 / this.tempo(), div = this.t.fx.stutter === "1/8" ? beat / 2 : beat / 4;
    const run = () => {
      if (!this.held.has("stutter")) return;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      for (let k = 0; k < 8; k++) {
        const t0 = now + k * div;
        g.setTargetAtTime(1, t0, 0.003);
        g.setTargetAtTime(0, t0 + div * 0.5, 0.004);
      }
      this.stutterTimer = setTimeout(run, div * 8 * 1000 - 20) as unknown as number;
    };
    run();
  }

  /** Slow the clock down over ~1.2 s with a closing filter and a fade, like pulling the plug on a tape machine. */
  private tapeStop() {
    const start = this.tempo(), t0 = performance.now(), p = this.p, now = this.ctx.currentTime;
    p.filter.frequency.cancelScheduledValues(now);
    p.filter.frequency.setValueAtTime(p.filter.frequency.value, now);
    p.filter.frequency.exponentialRampToValueAtTime(500, now + 1.2);
    p.gate.gain.cancelScheduledValues(now);
    p.gate.gain.setValueAtTime(1, now);
    p.gate.gain.linearRampToValueAtTime(0.0001, now + 1.3);
    this.tapeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 1200);
      this.eng.setTempoOverride(Math.max(30, start * (1 - k * 0.75)));
      if (k >= 1) clearInterval(this.tapeTimer);
    }, 60) as unknown as number;
  }

  /** White noise through a band-pass that climbs, getting louder, for the template's riser length. */
  private startRiser() {
    const ctx = this.ctx, len = (60 / this.tempo()) * this.t.fx.riserBeats;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gain = ctx.createGain(), now = ctx.currentTime;
    src.buffer = buf; src.loop = true;
    bp.type = "bandpass"; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.exponentialRampToValueAtTime(9000, now + len);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + len);
    src.connect(bp).connect(gain).connect(this.p.input);
    src.start();
    this.riser = { src, gain, bp };
    // The band thins out underneath it a little.
    this.p.filter.frequency.cancelScheduledValues(now);
    this.p.filter.frequency.setValueAtTime(this.p.filter.frequency.value, now);
    this.p.filter.frequency.exponentialRampToValueAtTime(2500, now + len);
  }

  private stopRiser() {
    const r = this.riser, now = this.ctx.currentTime;
    this.riser = null;
    if (r) { r.gain.gain.cancelScheduledValues(now); r.gain.gain.setTargetAtTime(0, now, 0.03); setTimeout(() => { r.src.stop(); r.src.disconnect(); }, 300); }
    if (!this.held.has("sweep")) {
      this.p.filter.frequency.cancelScheduledValues(now);
      this.p.filter.frequency.setValueAtTime(Math.max(40, this.p.filter.frequency.value), now);
      this.p.filter.frequency.exponentialRampToValueAtTime(22000, now + 0.08);
    }
  }
}
