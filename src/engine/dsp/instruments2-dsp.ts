// DSP for the Phase 2 instruments: Razor (lead), Thump Lab (analog drums),
// Wobbler (wobble bass), Haze (lo-fi pad). Runs in the AudioWorklet.

import { ADSR, Ladder, OnePole, Osc, SVF, TAU, mtof, smooth, voiceMod } from "./units";
import { velGain, type Clock, type InstrumentDSP } from "./instruments-dsp";
import { Reverb } from "./fx-dsp";
import { DRUM_BASE_NOTE } from "../instruments";
import { UNISON_COUNTS, WOB_BEATS } from "../instruments2";

const panL = (p: number) => Math.cos(((p + 1) * Math.PI) / 4);
const panR = (p: number) => Math.sin(((p + 1) * Math.PI) / 4);

let seed = 22222;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// ---------------------------------------------------------------- Razor: mono lead

export class LeadDSP implements InstrumentDSP {
  private held: number[] = [];
  private freq = 440;
  private target = 440;
  private amp = new ADSR();
  private env = 0; // decaying mod env for filter + sync sweep
  private velNow = 1;
  private master = new Float64Array(7);
  private slave = new Float64Array(7);
  private fL = new SVF();
  private fR = new SVF();
  private vib = 0;
  private vibFade = 1;
  private cut = 5000;
  constructor(public params: Record<string, number>, private sr: number) {
    for (let i = 0; i < 7; i++) { this.master[i] = Math.random(); this.slave[i] = Math.random(); }
  }

  /** Glide above zero also means legato: a note played over a held one slides instead of re-striking. */
  noteOn(pitch: number, vel: number) {
    const legato = this.held.length > 0 && (this.params.glide ?? 0.2) > 0.02;
    this.held = this.held.filter((p) => p !== pitch);
    this.held.push(pitch);
    this.target = mtof(pitch);
    this.velNow = vel / 127;
    if (!legato) { this.amp.gate(true); this.env = 1; this.vibFade = 0; if (this.amp.value < 0.01) this.freq = this.target; }
  }
  noteOff(pitch: number) {
    this.held = this.held.filter((p) => p !== pitch);
    if (this.held.length) this.target = mtof(this.held[this.held.length - 1]);
    else this.amp.gate(false);
  }
  allOff() { this.held = []; this.amp.gate(false); }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    if (!this.amp.active) return;
    // The three character controls:
    //   Scream: sync ratio up, sync envelope deeper, a little drive.
    //   Sweep: filter envelope deeper and longer (the zap at each note; the sync envelope follows it).
    //   Glide: portamento time, legato above zero, and the vibrato fading in after each new note.
    const scream = p.scream ?? 0.4, sweep = p.sweep ?? 0.4, glide = p.glide ?? 0.2;
    const n = UNISON_COUNTS[Math.round(p.unison ?? 1)] ?? 3;
    const spreadK = p.spread ?? 0.6;
    const det = spreadK * 0.012; // up to ~20 cents each side
    const spread = Math.min(1, spreadK * 1.3);
    const square = Math.round(p.wave ?? 0) === 1;
    const glideK = 1 - Math.exp(-1 / (0.002 * Math.pow(300, glide) * sr));
    const envK = Math.exp(-4.6 / ((p.envDecay ?? 0.25) * (0.4 + sweep * 2.6) * sr));
    const fenv = Math.min(1.2, (p.fenv ?? 0.15) + sweep * 0.7);
    const syncSemis = (p.sync ?? 0) + scream * 19, syncEnv = ((p.syncEnv ?? 0.1) + scream * 0.5) * 24;
    const drive = 1 + scream * 2.5, dn = Math.tanh(drive);
    const fadeInc = 1 / (Math.max(0.05, glide * 1.5) * sr);
    const vibInc = (p.vibRate ?? 5.5) / sr, vibAmt0 = (p.vibDepth ?? 0.15) * 0.02;
    const level = (p.level ?? 0.6) * 0.64 / Math.sqrt(n);
    const res = p.reso ?? 0.2;
    for (let i = i0; i < i1; i++) {
      this.freq *= Math.pow(this.target / this.freq, glideK);
      this.env *= envK;
      this.vib = (this.vib + vibInc) % 1;
      if (this.vibFade < 1) this.vibFade = Math.min(1, this.vibFade + fadeInc);
      const f0 = this.freq * voiceMod.pitch * (1 + Math.sin(TAU * this.vib) * vibAmt0 * this.vibFade);
      const ratio = Math.pow(2, (syncSemis + syncEnv * this.env) / 12);
      const a = this.amp.next(p.attack ?? 0.005, 0.2, 1, p.release ?? 0.25, sr) * velGain(this.velNow);
      let l = 0, r = 0;
      for (let v = 0; v < n; v++) {
        const off = n === 1 ? 0 : (v / (n - 1)) * 2 - 1; // -1..1 across the unison stack
        const fm = f0 * (1 + off * det);
        this.master[v] += fm / sr;
        this.slave[v] += (fm * ratio) / sr;
        if (this.master[v] >= 1) { this.master[v] -= 1; this.slave[v] = this.master[v] * ratio; } // hard sync
        this.slave[v] -= Math.floor(this.slave[v]);
        const ph = this.slave[v];
        const x = square ? (ph < voiceMod.pw ? 1 : -1) : 2 * ph - 1;
        const pan = off * spread;
        l += x * panL(pan); r += x * panR(pan);
      }
      this.cut = smooth(this.cut, p.cutoff ?? 5000, 0.002);
      const fc = Math.min(sr * 0.45, this.cut * Math.pow(2, this.env * fenv * 5));
      const g = a * level * 1.41 / dn;
      L[i] += Math.tanh(this.fL.lp(l, fc, res, sr) * drive) * g;
      R[i] += Math.tanh(this.fR.lp(r, fc, res, sr) * drive) * g;
    }
  }
}

// ---------------------------------------------------------------- Wobbler: wobble bass

export class WobbleDSP implements InstrumentDSP {
  private held: number[] = [];
  private freq = 55;
  private target = 55;
  private car = new Osc();
  private subOsc = new Osc();
  private mod = new Osc();
  private filt = new Ladder();
  private dc = new OnePole();
  private amp = 0;
  private gate = false;
  private velNow = 1;
  private hold = 0;
  private holdCnt = 0;
  private delay = new Float32Array(2048);
  private dw = 0;
  private cut = 600;
  constructor(public params: Record<string, number>, private sr: number, private clock: Clock) {}

  noteOn(pitch: number, vel: number) {
    const legato = this.held.length > 0;
    this.held = this.held.filter((p) => p !== pitch);
    this.held.push(pitch);
    this.target = mtof(pitch);
    if (!legato) this.freq = this.target;
    this.velNow = vel / 127;
    this.gate = true;
  }
  noteOff(pitch: number) {
    this.held = this.held.filter((p) => p !== pitch);
    if (this.held.length) this.target = mtof(this.held[this.held.length - 1]);
    else this.gate = false;
  }
  allOff() { this.held = []; this.gate = false; }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number, t0: number) {
    const p = this.params, sr = this.sr;
    if (!this.gate && this.amp < 1e-4) return;
    const wave = Math.round(p.wave ?? 0), xWave = [3, 0, 1][Math.round(p.xWave ?? 0)] ?? 3;
    const xRatio = Math.pow(2, (p.xTune ?? 7) / 12), xmod = p.xmod ?? 0.3;
    const glideK = 1 - Math.exp(-1 / ((p.glide ?? 0.05) * sr));
    const beats = WOB_BEATS[Math.round(p.wobRate ?? 2)] ?? 0.5;
    const shape = Math.round(p.wobShape ?? 0), depth = p.wobble ?? 0.7;
    const crush = p.crush ?? 0.2;
    const step = 1 + Math.floor(crush * crush * 24);
    const levels = Math.pow(2, 16 - crush * 12);
    const reso = Math.min(0.95, p.reso ?? 0.45);
    const width = p.width ?? 0.4, dly = Math.floor(width * 0.012 * sr);
    const level = (p.level ?? 0.65) * 0.5;
    const oscWave = [0, 1, 3][wave];
    for (let i = i0; i < i1; i++) {
      this.freq *= Math.pow(this.target / this.freq, glideK);
      this.amp = smooth(this.amp, this.gate ? velGain(this.velNow) : 0, this.gate ? 0.01 : 0.003);
      // Tempo-locked wobble LFO from the song position.
      const pos = (((t0 + i / sr - this.clock.zero) * this.clock.bpm) / 60 / beats) % 1;
      const ph = pos < 0 ? pos + 1 : pos;
      const lfo = shape === 0 ? 0.5 - 0.5 * Math.cos(TAU * ph) : shape === 1 ? 1 - ph : shape === 2 ? (ph < 0.5 ? 1 : 0) : ph;
      const fq = this.freq * voiceMod.pitch;
      const m = this.mod.next(fq * xRatio, sr, xWave);
      const x0 = this.car.next(Math.max(1, fq * (1 + m * xmod * 2)), sr, oscWave) + this.subOsc.next(fq * 0.5, sr, 3) * (p.sub ?? 0.5);
      // Crush: sample-and-hold plus bit reduction before the filter.
      if (this.holdCnt++ % step === 0) this.hold = Math.round(x0 * levels) / levels;
      const x = crush > 0.01 ? this.hold : x0;
      this.cut = smooth(this.cut, p.cutoff ?? 600, 0.002);
      const fc = Math.min(sr * 0.42, this.cut * Math.pow(2, depth * lfo * 5));
      let y = this.filt.process(x * 1.5, fc, reso, sr) * (1 + reso);
      y = this.dc.hp(Math.tanh(y * 1.3), 25, sr) * this.amp * level;
      this.delay[this.dw] = y;
      const yr = dly ? this.delay[(this.dw - dly + 2048) % 2048] : y;
      this.dw = (this.dw + 1) % 2048;
      L[i] += y;
      R[i] += yr * (1 - width * 0.15) + y * width * 0.15;
    }
  }
}

// ---------------------------------------------------------------- Haze: lo-fi pad

interface PadVoice { pitch: number; vel: number; osc: Osc[]; amp: ADSR; held: boolean; age: number; pan: number }

export class PadDSP implements InstrumentDSP {
  private voices: PadVoice[] = [];
  private fL = new SVF();
  private fR = new SVF();
  private wowPh = 0;
  private flutPh = 0;
  private hold = [0, 0];
  private cnt = 0;
  private rev: Reverb;
  private revBufL = new Float32Array(128);
  private revBufR = new Float32Array(128);
  private counter = 0;
  private cut = 2200;
  constructor(public params: Record<string, number>, private sr: number) {
    this.rev = new Reverb(sr, 1.6);
  }

  noteOn(pitch: number, vel: number) {
    let v = this.voices.find((x) => x.pitch === pitch && x.held);
    if (!v) {
      if (this.voices.length >= 10) {
        const rel = this.voices.filter((x) => !x.held);
        const victim = (rel.length ? rel : this.voices).reduce((a, b) => (a.age < b.age ? a : b));
        this.voices.splice(this.voices.indexOf(victim), 1);
      }
      v = { pitch, vel: vel / 127, osc: Array.from({ length: 6 }, () => new Osc()), amp: new ADSR(), held: true, age: 0, pan: 0 };
      this.voices.push(v);
    }
    v.vel = vel / 127; v.held = true; v.age = ++this.counter;
    v.pan = ((this.counter % 2) * 2 - 1) * (0.2 + 0.5 * Math.random());
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    const wave = [0, 2, 3, 1][Math.round(p.wave ?? 0)] ?? 0;
    const lv = [p.low ?? 0.5, p.hi ?? 0.8, p.higher ?? 0.25];
    const mult = [0.5, 1, 2];
    const det = (p.detune ?? 0.4) * 0.008;
    const a = p.attack ?? 0.8, d = p.decay ?? 1, s = p.sustain ?? 0.8, r = p.release ?? 2.2;
    const lofi = p.lofi ?? 0.35, wow = p.wow ?? 0.35, width = p.width ?? 0.8;
    const nz = (p.noise ?? 0.1) * 0.15;
    const level = (p.level ?? 0.55) * 0.75;
    const step = 1 + Math.floor(lofi * 6), levels = Math.pow(2, 14 - lofi * 9);
    const res = p.reso ?? 0.15;
    const n = i1 - i0;
    if (this.revBufL.length < n) { this.revBufL = new Float32Array(n); this.revBufR = new Float32Array(n); }
    const bl = this.revBufL, br = this.revBufR;
    for (let i = i0; i < i1; i++) {
      // Tape wow (slow) + flutter (fast): one pitch drift shared by every voice.
      this.wowPh = (this.wowPh + 0.45 / sr) % 1;
      this.flutPh = (this.flutPh + 6.3 / sr) % 1;
      const drift = 1 + wow * (0.006 * Math.sin(TAU * this.wowPh) + 0.0015 * Math.sin(TAU * this.flutPh));
      let l = 0, rr = 0;
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        const f = mtof(v.pitch) * drift * voiceMod.pitch;
        let x = 0;
        for (let k = 0; k < 3; k++) {
          if (lv[k] < 0.01) continue;
          x += (v.osc[k * 2].next(f * mult[k] * (1 + det), sr, wave) + v.osc[k * 2 + 1].next(f * mult[k] * (1 - det), sr, wave)) * lv[k];
        }
        x += noise() * nz;
        x *= v.amp.next(a, d, s, r, sr) * velGain(v.vel);
        const pan = v.pan * width;
        l += x * panL(pan); rr += x * panR(pan);
      }
      this.cut = smooth(this.cut, p.cutoff ?? 2200, 0.002);
      l = this.fL.lp(l, this.cut, res, sr);
      rr = this.fR.lp(rr, this.cut, res, sr);
      // Lo-fi: sample-rate and bit reduction blended in, plus a little hiss.
      if (this.cnt++ % step === 0) { this.hold[0] = Math.round(l * levels) / levels; this.hold[1] = Math.round(rr * levels) / levels; }
      const hiss = noise() * 0.004 * lofi;
      bl[i - i0] = (l * (1 - lofi) + this.hold[0] * lofi + hiss) * level;
      br[i - i0] = (rr * (1 - lofi) + this.hold[1] * lofi + hiss) * level;
    }
    this.rev.process(bl, br, n, p.revTime ?? 0.7, p.revLevel ?? 0.45);
    for (let i = 0; i < n; i++) { L[i0 + i] += bl[i]; R[i0 + i] += br[i]; }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}
