// The three Phase 1 instruments' DSP. Each renders stereo into L/R between
// sample indices [i0, i1). Runs in the AudioWorklet.

import { ADSR, Ladder, OnePole, Osc, SVF, mtof, smooth, voiceMod } from "./units";
import { DRUM_BASE_NOTE, DRUM_PARTS } from "../instruments";

export interface Clock { bpm: number; zero: number } // zero = context time of song tick 0

export interface InstrumentDSP {
  params: Record<string, number>;
  noteOn(pitch: number, vel: number, t: number): void;
  noteOff(pitch: number, t: number): void;
  allOff(): void;
  render(L: Float32Array, R: Float32Array, i0: number, i1: number, t0: number): void;
}

/** Velocity (0..1) to gain: a clear curve, so soft notes are clearly softer (64 ~ -10 dB, 32 ~ -20 dB). */
export const velGain = (v: number) => Math.max(0.02, Math.pow(Math.max(0, Math.min(1, v)), 1.7));

const panL = (p: number) => Math.cos(((p + 1) * Math.PI) / 4);
const panR = (p: number) => Math.sin(((p + 1) * Math.PI) / 4);

// ---------------------------------------------------------------- drums

interface DrumVoice { part: number; pos: number; rate: number; amp: number; decayK: number; vel: number; kill: number }

export class DrumsDSP implements InstrumentDSP {
  private voices: DrumVoice[] = [];
  private filters = Array.from({ length: DRUM_PARTS }, () => new OnePole());
  constructor(public params: Record<string, number>, private samples: Float32Array[], private sr: number) {}

  setSamples(s: Float32Array[]) { this.samples = s; }

  noteOn(pitch: number, vel: number) {
    const part = pitch - DRUM_BASE_NOTE;
    if (part < 0 || part >= DRUM_PARTS) return;
    const p = this.params;
    // Retrigger and hat choke: fade the old voice fast instead of cutting (no clicks).
    for (const v of this.voices) {
      if (v.part === part || (p.choke >= 0.5 && part === 3 && v.part === 4)) v.kill = 1;
    }
    const smp = Math.round(p[`p${part}smp`] ?? 0);
    if (!this.samples[smp]) return;
    const decay = p[`p${part}decay`] ?? 1;
    this.voices.push({
      part, pos: 0, vel: velGain(vel / 127),
      rate: Math.pow(2, (p[`p${part}tune`] ?? 0) / 12) * (this.samplesRate / this.sr),
      amp: 1, decayK: Math.exp(-4.6 / (decay * this.sr)), kill: 0,
    });
    if (this.voices.length > 24) this.voices.shift();
  }
  samplesRate = 48000; // sample data rate (set by processor)
  noteOff() { /* one-shot */ }
  allOff() { for (const v of this.voices) v.kill = 1; }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params;
    const master = p.level ?? 0.85;
    for (const v of this.voices) {
      const data = this.samples[Math.round(p[`p${v.part}smp`] ?? 0)];
      if (!data) { v.amp = 0; continue; }
      const level = (p[`p${v.part}level`] ?? 0.8) * v.vel * master;
      const pan = p[`p${v.part}pan`] ?? 0;
      const gl = panL(pan) * level, gr = panR(pan) * level;
      const drive = p[`p${v.part}drive`] ?? 0;
      const dg = 1 + drive * 10, dn = Math.tanh(dg);
      const tone = p[`p${v.part}tone`] ?? 0;
      const f = this.filters[v.part];
      for (let i = i0; i < i1; i++) {
        const ip = v.pos | 0;
        if (ip + 1 >= data.length || v.amp < 1e-4) { v.amp = 0; break; }
        const fr = v.pos - ip;
        let x = data[ip] + (data[ip + 1] - data[ip]) * fr;
        x *= v.amp;
        if (drive > 0.001) x = Math.tanh(x * dg) / dn;
        if (tone < -0.02) x = f.lp(x, 18000 * Math.pow(2, tone * 6), this.sr);
        else if (tone > 0.02) x = f.hp(x, 20 * Math.pow(2, tone * 9), this.sr);
        L[i] += x * gl;
        R[i] += x * gr;
        v.pos += v.rate;
        v.amp *= v.kill ? 0.995 : v.decayK;
      }
    }
    this.voices = this.voices.filter((v) => v.amp >= 1e-4);
  }
}

// ---------------------------------------------------------------- acid bass

const ARP_DIV = [2, 4, 8, 6]; // steps per beat for 1/8, 1/16, 1/32, 1/16T

export class AcidDSP implements InstrumentDSP {
  private osc = new Osc();
  private sub = new Osc();
  private filt = new Ladder();
  private dc = new OnePole();
  private held: number[] = []; // in press order
  private freq = 110; // current (gliding) frequency
  private target = 110;
  private fenv = 0;
  private amp = 0;
  private gate = false;
  private accentNow = 0;
  private velNow = 1;
  private cut = 500;
  // arp
  private arpNext = 0;
  private arpIdx = 0;
  private arpGateOff = 0;
  constructor(public params: Record<string, number>, private sr: number, private clock: Clock) {}

  noteOn(pitch: number, vel: number, t: number) {
    const legato = this.held.length > 0;
    this.held = this.held.filter((p) => p !== pitch);
    this.held.push(pitch);
    this.velNow = vel / 127;
    if (this.params.arpOn >= 0.5) {
      if (!legato) {
        // Start the arp now, then lock to the song's step grid.
        this.arpIdx = 0;
        this.arpStep(t);
        const d = this.stepDur();
        this.arpNext = this.clock.zero + (Math.floor((t - this.clock.zero) / d + 1e-3) + 1) * d;
      }
      return;
    }
    this.play(pitch, vel, !legato);
  }

  private play(pitch: number, vel: number, retrigger: boolean) {
    this.target = mtof(pitch);
    if (retrigger) {
      this.freq = this.target;
      this.fenv = 1;
      this.accentNow = vel >= 100 ? 1 : 0;
    }
    this.gate = true;
  }

  noteOff(pitch: number) {
    this.held = this.held.filter((p) => p !== pitch);
    if (this.params.arpOn >= 0.5) { if (!this.held.length) this.gate = false; return; }
    if (this.held.length) this.target = mtof(this.held[this.held.length - 1]); // glide back
    else this.gate = false;
  }

  allOff() { this.held = []; this.gate = false; }

  private stepDur() {
    return 60 / this.clock.bpm / ARP_DIV[Math.round(this.params.arpRate ?? 1)];
  }

  private arpPattern(): number[] {
    const base = [...this.held].sort((a, b) => a - b);
    const oct = Math.round(this.params.arpRange ?? 1);
    const up: number[] = [];
    for (let o = 0; o < oct; o++) for (const p of base) up.push(p + 12 * o);
    switch (Math.round(this.params.arpMode ?? 0)) {
      case 1: return up.reverse();
      case 2: return up.length > 2 ? [...up, ...up.slice(1, -1).reverse()] : up;
      default: return up;
    }
  }

  private arpStep(t: number) {
    const pat = this.arpPattern();
    if (!pat.length) return;
    const random = Math.round(this.params.arpMode ?? 0) === 3;
    const pitch = random ? pat[Math.floor(Math.random() * pat.length)] : pat[this.arpIdx % pat.length];
    this.arpIdx++;
    this.play(pitch, this.velNow * 127, true);
    this.arpGateOff = t + this.stepDur() * 0.55;
  }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number, t0: number) {
    const p = this.params, sr = this.sr;
    const wave = Math.round(p.wave ?? 0);
    const decayK = Math.exp(-4.6 / ((p.decay ?? 0.35) * sr));
    const glideK = 1 - Math.exp(-1 / ((p.glide ?? 0.06) * sr));
    const reso = Math.min(0.97, p.reso ?? 0.6);
    const bite = p.bite ?? 0.3;
    const accent = (p.accent ?? 0.5) * this.accentNow;
    const level = (p.level ?? 0.7) * 0.4;
    const subLv = p.sub ?? 0;
    const arp = p.arpOn >= 0.5;
    for (let i = i0; i < i1; i++) {
      if (arp && this.held.length) {
        const t = t0 + i / sr;
        if (t >= this.arpNext) { this.arpStep(t); this.arpNext += this.stepDur(); }
        if (this.gate && t >= this.arpGateOff) this.gate = false;
      }
      this.freq *= Math.pow(this.target / this.freq, glideK);
      // Amp: fast attack gate, short release; accent and velocity push it.
      const ampTarget = this.gate ? velGain(this.velNow) * (1 + accent * 0.4) : 0;
      this.amp = smooth(this.amp, ampTarget, this.gate ? 0.02 : 0.004);
      this.fenv *= decayK;
      this.cut = smooth(this.cut, p.cutoff ?? 500, 0.002);
      const fc = Math.min(sr * 0.42, this.cut * Math.pow(2, this.fenv * ((p.envmod ?? 0.5) * 5 + accent * 2.5)));
      const fq = this.freq * voiceMod.pitch;
      let x = this.osc.next(fq, sr, wave === 1 ? 1 : 0);
      if (subLv > 0) x += this.sub.next(fq * 0.5, sr, 1) * subLv * 0.7;
      x *= 1 + bite * 3; // "bite": drive into the saturating ladder input
      let y = this.filt.process(x, fc, reso, sr) * (1 + reso * 1.5);
      if (bite > 0.01) y = Math.tanh(y * (1 + bite * 2.5));
      y = this.dc.hp(y, 20, sr) * this.amp * level;
      L[i] += y;
      R[i] += y;
    }
  }
}

// ---------------------------------------------------------------- poly synth

interface PolyVoice {
  pitch: number; vel: number; o1: Osc; o2: Osc; f: SVF; amp: ADSR; fenv: number; pan: number; age: number; held: boolean;
}

export class PolyDSP implements InstrumentDSP {
  private voices: PolyVoice[] = [];
  private cut = 2500;
  private counter = 0;
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    let v = this.voices.find((x) => x.pitch === pitch && x.held);
    if (!v) {
      if (this.voices.length >= 12) {
        // Steal: prefer released voices, then the oldest.
        const rel = this.voices.filter((x) => !x.held);
        const victim = (rel.length ? rel : this.voices).reduce((a, b) => (a.age < b.age ? a : b));
        this.voices.splice(this.voices.indexOf(victim), 1);
      }
      v = { pitch, vel: vel / 127, o1: new Osc(), o2: new Osc(), f: new SVF(), amp: new ADSR(), fenv: 1, pan: 0, age: 0, held: true };
      this.voices.push(v);
    }
    v.vel = vel / 127;
    v.age = ++this.counter;
    v.held = true;
    v.fenv = 1;
    v.pan = ((this.counter % 2) * 2 - 1) * (0.3 + 0.4 * Math.random());
    v.amp.gate(true);
  }

  noteOff(pitch: number) {
    for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); }
  }

  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    const w1 = Math.round(p.wave1 ?? 0), w2 = Math.round(p.wave2 ?? 1);
    const ratio2 = Math.pow(2, ((p.semi2 ?? 0) + (p.detune ?? 8) / 100) / 12);
    const mix = p.mix ?? 0.4;
    const reso = p.reso ?? 0.2, fenvAmt = p.fenv ?? 0.3;
    const fK = Math.exp(-4.6 / ((p.fdecay ?? 0.5) * sr));
    const a = p.attack ?? 0.01, d = p.decay ?? 0.4, s = p.sustain ?? 0.7, r = p.release ?? 0.4;
    const width = p.width ?? 0.5;
    const level = (p.level ?? 0.55) * 0.45;
    for (let i = i0; i < i1; i++) {
      this.cut = smooth(this.cut, p.cutoff ?? 2500, 0.002);
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        const f0 = mtof(v.pitch) * voiceMod.pitch;
        const x = v.o1.next(f0, sr, w1) * (1 - mix) + v.o2.next(f0 * ratio2, sr, w2) * mix;
        v.fenv *= fK;
        const fc = this.cut * Math.pow(2, v.fenv * fenvAmt * 6 * (0.5 + 0.5 * v.vel));
        const y = v.f.lp(x, fc, reso, sr) * v.amp.next(a, d, s, r, sr) * velGain(v.vel) * level;
        const pan = v.pan * width;
        L[i] += y * panL(pan) * 1.41;
        R[i] += y * panR(pan) * 1.41;
      }
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}
