// DSP for the Phase 2 instruments: Razor (lead), Thump Lab (analog drums),
// Wobbler (wobble bass), Haze (lo-fi pad). Runs in the AudioWorklet.

import { ADSR, Ladder, OnePole, Osc, SVF, TAU, mtof, smooth } from "./units";
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
  private cut = 5000;
  constructor(public params: Record<string, number>, private sr: number) {
    for (let i = 0; i < 7; i++) { this.master[i] = Math.random(); this.slave[i] = Math.random(); }
  }

  noteOn(pitch: number, vel: number) {
    const legato = this.held.length > 0 && (this.params.legato ?? 1) >= 0.5;
    this.held = this.held.filter((p) => p !== pitch);
    this.held.push(pitch);
    this.target = mtof(pitch);
    this.velNow = vel / 127;
    if (!legato) { this.amp.gate(true); this.env = 1; if (this.amp.value < 0.01) this.freq = this.target; }
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
    const n = UNISON_COUNTS[Math.round(p.unison ?? 1)] ?? 3;
    const det = (p.detune ?? 0.3) * 0.012; // up to ~20 cents each side
    const spread = p.spread ?? 0.6;
    const square = Math.round(p.wave ?? 0) === 1;
    const glideK = 1 - Math.exp(-1 / ((p.glide ?? 0.04) * sr));
    const envK = Math.exp(-4.6 / ((p.envDecay ?? 0.3) * sr));
    const vibInc = (p.vibRate ?? 5.5) / sr, vibAmt = (p.vibDepth ?? 0.15) * 0.02;
    const level = (p.level ?? 0.6) * 0.4 / Math.sqrt(n);
    const res = p.reso ?? 0.2;
    for (let i = i0; i < i1; i++) {
      this.freq *= Math.pow(this.target / this.freq, glideK);
      this.env *= envK;
      this.vib = (this.vib + vibInc) % 1;
      const f0 = this.freq * (1 + Math.sin(TAU * this.vib) * vibAmt);
      const ratio = Math.pow(2, ((p.sync ?? 7) + (p.syncEnv ?? 0.35) * 24 * this.env) / 12);
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
        const x = square ? (ph < 0.5 ? 1 : -1) : 2 * ph - 1;
        const pan = off * spread;
        l += x * panL(pan); r += x * panR(pan);
      }
      this.cut = smooth(this.cut, p.cutoff ?? 5000, 0.002);
      const fc = Math.min(sr * 0.45, this.cut * Math.pow(2, this.env * (p.fenv ?? 0.35) * 5));
      L[i] += this.fL.lp(l, fc, res, sr) * a * level * 1.41;
      R[i] += this.fR.lp(r, fc, res, sr) * a * level * 1.41;
    }
  }
}

// ---------------------------------------------------------------- Thump Lab: analog drum modules

interface AVoice { part: number; t: number; vel: number; ph: number; ph2: number; ph3: number[]; amp: number; alive: boolean; bp: OnePole; hp: OnePole }

export class AnalogDrumsDSP implements InstrumentDSP {
  private voices: (AVoice | null)[] = [null, null, null, null];
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    const part = pitch - DRUM_BASE_NOTE;
    if (part < 0 || part > 3) return;
    this.voices[part] = { part, t: 0, vel: velGain(vel / 127), ph: 0, ph2: 0, ph3: [0, 0.3, 0.6, 0.1], amp: 1, alive: true, bp: new OnePole(), hp: new OnePole() };
  }
  noteOff() { /* one-shot */ }
  allOff() { for (const v of this.voices) if (v) v.alive = false; }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr, master = p.level ?? 0.85;
    for (const v of this.voices) {
      if (!v || !v.alive) continue;
      for (let i = i0; i < i1; i++) {
        const t = v.t;
        let x = 0;
        switch (v.part) {
          case 0: { // kick: sine with a fast pitch drop, click, boost
            const decay = p.kDecay ?? 0.5;
            const f = (p.kTune ?? 52) * (1 + (p.kBend ?? 0.5) * 6 * Math.exp(-t / 0.025));
            v.ph += f / sr;
            const env = Math.exp((-t * 4.6) / decay);
            x = Math.sin(TAU * v.ph) * env + (t < 0.003 ? noise() * 0.4 * (1 - t / 0.003) : 0);
            const g = 1 + (p.kDrive ?? 0.2) * 6;
            x = (Math.tanh(x * g) / Math.tanh(g)) * (p.kLevel ?? 0.9);
            if (env < 1e-4) v.alive = false;
            break;
          }
          case 1: { // snare: two tones + filtered noise ("snappy")
            const decay = p.sDecay ?? 0.22, f = p.sTune ?? 190;
            v.ph += f / sr; v.ph2 += (f * 1.62) / sr;
            const tone = (Math.sin(TAU * v.ph) + Math.sin(TAU * v.ph2) * 0.5) * Math.exp((-t * 4.6) / (decay * 0.5));
            const nz = v.hp.hp(noise(), 400 + (p.sTone ?? 0.55) * 6000, sr) * Math.exp((-t * 4.6) / decay);
            const snap = p.sSnappy ?? 0.6;
            x = (tone * (1 - snap * 0.6) + nz * snap * 1.2) * (p.sLevel ?? 0.75);
            if (t > decay * 1.5) v.alive = false;
            break;
          }
          case 2: { // tom: pitched sine with bend, a little noise
            const decay = p.tDecay ?? 0.4;
            const f = (p.tTune ?? 120) * (1 + (p.tBend ?? 0.4) * 1.5 * Math.exp(-t / 0.06));
            v.ph += f / sr;
            const env = Math.exp((-t * 4.6) / decay);
            x = (Math.sin(TAU * v.ph) + v.bp.lp(noise(), 3000, sr) * (p.tNoise ?? 0.15) * 2) * env * (p.tLevel ?? 0.7);
            if (env < 1e-4) v.alive = false;
            break;
          }
          default: { // perc: metal / click / fm / noise
            const decay = p.pDecay ?? 0.12, f = p.pTune ?? 800, depth = p.pDepth ?? 0.5;
            const env = Math.exp((-t * 4.6) / decay);
            switch (Math.round(p.pShape ?? 0)) {
              case 0: { // metal: inharmonic squares
                const ratios = [1, 1.48, 1.92, 2.62];
                let s = 0;
                for (let k = 0; k < 4; k++) { v.ph3[k] = (v.ph3[k] + (f * ratios[k] * (1 + depth * 0.3 * k)) / sr) % 1; s += v.ph3[k] < 0.5 ? 1 : -1; }
                x = v.hp.hp(s * 0.25, 2000, sr);
                break;
              }
              case 1: x = Math.sin(TAU * (v.ph += f / sr)) * Math.exp(-t / 0.004) + noise() * Math.exp(-t / 0.002) * depth; break;
              case 2: { // two-operator FM
                v.ph2 += (f * 1.41) / sr;
                v.ph += (f + Math.sin(TAU * v.ph2) * f * depth * 4 * env) / sr;
                x = Math.sin(TAU * v.ph);
                break;
              }
              default: x = v.bp.lp(v.hp.hp(noise(), f * 0.5, sr), f * (1 + depth * 3), sr) * 2;
            }
            x *= env * (p.pLevel ?? 0.6);
            if (env < 1e-4) v.alive = false;
          }
        }
        x *= v.vel * master * 0.45;
        // Fixed placement: kick/snare centre, tom slightly left, perc slightly right.
        const pan = v.part === 2 ? -0.25 : v.part === 3 ? 0.3 : 0;
        L[i] += x * panL(pan) * 1.41;
        R[i] += x * panR(pan) * 1.41;
        v.t += 1 / sr;
        if (!v.alive) break;
      }
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
      const m = this.mod.next(this.freq * xRatio, sr, xWave);
      const x0 = this.car.next(Math.max(1, this.freq * (1 + m * xmod * 2)), sr, oscWave) + this.subOsc.next(this.freq * 0.5, sr, 3) * (p.sub ?? 0.5);
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
        const f = mtof(v.pitch) * drift;
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
