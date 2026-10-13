// Insert effects (2 knobs each, a/b in 0..1). Process stereo buffers in place.
// Runs in the AudioWorklet.

import { FX_TYPES, syncDiv } from "../params";
import type { Clock } from "./instruments-dsp";

export interface Fx {
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number, t0: number, clock: Clock): void;
}

const TAU = Math.PI * 2;
const expMap = (u: number, lo: number, hi: number) => lo * Math.pow(hi / lo, Math.max(0, Math.min(1, u)));

// ---------------------------------------------------------------- building blocks

/** TPT state-variable filter giving low, band and high outputs. */
class SVF2 {
  private ic1 = 0;
  private ic2 = 0;
  lp = 0; bp = 0; hp = 0;
  run(x: number, g: number, k: number) {
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2;
  }
}

/** RBJ biquad (shelves for the EQ). */
class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  private z = [0, 0, 0, 0, 0, 0, 0, 0]; // x1 x2 y1 y2 for L and R
  shelf(low: boolean, f: number, db: number, sr: number) {
    const A = Math.pow(10, db / 40), w = (TAU * f) / sr, cw = Math.cos(w), sw = Math.sin(w);
    const al = (sw / 2) * Math.SQRT2, sA = 2 * Math.sqrt(A) * al;
    let b0, b1, b2, a0, a1, a2;
    if (low) {
      b0 = A * (A + 1 - (A - 1) * cw + sA); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - sA);
      a0 = A + 1 + (A - 1) * cw + sA; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - sA;
    } else {
      b0 = A * (A + 1 + (A - 1) * cw + sA); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - sA);
      a0 = A + 1 - (A - 1) * cw + sA; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - sA;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x: number, ch: 0 | 1): number {
    const z = this.z, o = ch * 4;
    const y = this.b0 * x + this.b1 * z[o] + this.b2 * z[o + 1] - this.a1 * z[o + 2] - this.a2 * z[o + 3];
    z[o + 1] = z[o]; z[o] = x; z[o + 3] = z[o + 2]; z[o + 2] = y;
    return y;
  }
}

class DelayLine {
  buf: Float32Array;
  w = 0;
  constructor(len: number) { this.buf = new Float32Array(len); }
  write(x: number) { this.buf[this.w] = x; this.w = (this.w + 1) % this.buf.length; }
  /** Fractional read `d` samples back. */
  read(d: number): number {
    const n = this.buf.length;
    const p = this.w - 1 - d + n * 2;
    const i = Math.floor(p), f = p - i;
    return this.buf[i % n] * (1 - f) + this.buf[(i + 1) % n] * f;
  }
}

// ---------------------------------------------------------------- effects

class EQ implements Fx {
  private lo = new Biquad(); private hi = new Biquad(); private la = -1; private lb = -1;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    if (a !== this.la) { this.lo.shelf(true, 220, (a - 0.5) * 24, this.sr); this.la = a; }
    if (b !== this.lb) { this.hi.shelf(false, 3500, (b - 0.5) * 24, this.sr); this.lb = b; }
    for (let i = 0; i < n; i++) { L[i] = this.hi.run(this.lo.run(L[i], 0), 0); R[i] = this.hi.run(this.lo.run(R[i], 1), 1); }
  }
}

class Filter implements Fx {
  private f = [new SVF2(), new SVF2()];
  private g = 0;
  constructor(private sr: number, private mode: "lp" | "hp" | "bp") {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const target = Math.tan(Math.PI * Math.min(expMap(a, 30, 18000), this.sr * 0.45) / this.sr);
    const k = 2 - 1.96 * b;
    for (let i = 0; i < n; i++) {
      this.g += (target - this.g) * 0.01;
      for (const ch of [0, 1] as const) {
        const buf = ch ? R : L, f = this.f[ch];
        f.run(buf[i], this.g, k);
        buf[i] = this.mode === "lp" ? f.lp : this.mode === "hp" ? f.hp : f.bp * k;
      }
    }
  }
}

class Comp implements Fx {
  private env = 0;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const thrDb = -a * 36, ratio = 4;
    const att = Math.exp(-1 / (expMap(b, 0.0005, 0.05) * this.sr)), rel = Math.exp(-1 / (0.15 * this.sr));
    const makeup = Math.pow(10, (-thrDb * (1 - 1 / ratio) * 0.5) / 20);
    for (let i = 0; i < n; i++) {
      const lvl = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      this.env = lvl > this.env ? att * this.env + (1 - att) * lvl : rel * this.env + (1 - rel) * lvl;
      const db = 20 * Math.log10(this.env + 1e-9);
      const gr = db > thrDb ? (thrDb + (db - thrDb) / ratio) - db : 0;
      const g = Math.pow(10, gr / 20) * makeup;
      L[i] *= g; R[i] *= g;
    }
  }
}

class Drive implements Fx {
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const k = 1 + a * 24, norm = 1 / Math.tanh(k), out = b * 1.4;
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * k) * norm * out; R[i] = Math.tanh(R[i] * k) * norm * out; }
  }
}

class Decimator implements Fx {
  private hold = 0; private cnt = 0; private hl = 0; private hr = 0;
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const step = 1 + Math.floor(Math.pow(1 - a, 2) * 48);
    const levels = Math.pow(2, 2 + Math.round(b * 14) - 1);
    for (let i = 0; i < n; i++) {
      if (this.cnt++ % step === 0) { this.hl = Math.round(L[i] * levels) / levels; this.hr = Math.round(R[i] * levels) / levels; }
      L[i] = this.hl; R[i] = this.hr;
    }
    void this.hold;
  }
}

class Chorus implements Fx {
  private d = [new DelayLine(4096), new DelayLine(4096)];
  private ph = 0;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const rate = expMap(a, 0.08, 6), base = 0.012 * this.sr, depth = b * 0.008 * this.sr;
    for (let i = 0; i < n; i++) {
      this.ph = (this.ph + rate / this.sr) % 1;
      const ml = base + depth * Math.sin(TAU * this.ph), mr = base + depth * Math.sin(TAU * (this.ph + 0.25));
      this.d[0].write(L[i]); this.d[1].write(R[i]);
      L[i] = L[i] * 0.7 + this.d[0].read(ml) * 0.6;
      R[i] = R[i] * 0.7 + this.d[1].read(mr) * 0.6;
    }
  }
}

class Phaser implements Fx {
  private s = [new Float32Array(6), new Float32Array(6)];
  private fb = [0, 0];
  private ph = 0;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const rate = expMap(a, 0.05, 4);
    for (let i = 0; i < n; i++) {
      this.ph = (this.ph + rate / this.sr) % 1;
      for (const ch of [0, 1] as const) {
        const buf = ch ? R : L;
        const lfo = 0.5 + 0.5 * Math.sin(TAU * (this.ph + ch * 0.2));
        const f = 200 * Math.pow(20, lfo * b + (1 - b) * 0.3);
        const t = Math.tan((Math.PI * f) / this.sr), c = (t - 1) / (t + 1);
        let x = buf[i] + this.fb[ch] * 0.6;
        const st = this.s[ch];
        for (let k = 0; k < 6; k++) { const y = c * x + st[k]; st[k] = x - c * y; x = y; }
        this.fb[ch] = x;
        buf[i] = (buf[i] + x * b) * (1 / (1 + b * 0.5));
      }
    }
  }
}

class Tremolo implements Fx {
  private ph = 0;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const rate = expMap(a, 0.5, 16);
    for (let i = 0; i < n; i++) {
      this.ph = (this.ph + rate / this.sr) % 1;
      const g = 1 - b * (0.5 + 0.5 * Math.sin(TAU * this.ph));
      L[i] *= g; R[i] *= g;
    }
  }
}

/** Sidechain-style ducking locked to the song's beat. */
class Pump implements Fx {
  private g = 1;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number, t0: number, clock: Clock) {
    const beats = syncDiv(0.375 + a * 0.625).beats; // 1/8 .. 1 bar
    for (let i = 0; i < n; i++) {
      const pos = (((t0 + i / this.sr - clock.zero) * clock.bpm) / 60 / beats) % 1;
      const ph = pos < 0 ? pos + 1 : pos;
      const target = 1 - b * Math.pow(Math.max(0, 1 - ph * 1.7), 2);
      this.g += (target - this.g) * 0.02;
      L[i] *= this.g; R[i] *= this.g;
    }
  }
}

/** Rhythmic gate locked to the beat; Hold = how much of each step stays open. */
class Slicer implements Fx {
  private g = 1;
  constructor(private sr: number) {}
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number, t0: number, clock: Clock) {
    const beats = syncDiv(a * 0.78).beats; // 1/32 .. 1/2
    const hold = 0.1 + b * 0.85;
    for (let i = 0; i < n; i++) {
      const pos = (((t0 + i / this.sr - clock.zero) * clock.bpm) / 60 / beats) % 1;
      const ph = pos < 0 ? pos + 1 : pos;
      this.g += ((ph < hold ? 1 : 0) - this.g) * 0.03;
      L[i] *= this.g; R[i] *= this.g;
    }
  }
}

/** Tempo-synced echo; Depth sets both feedback and wet level. */
class BpmDelay implements Fx {
  private d: DelayLine[];
  private damp = [0, 0];
  private time = 0;
  constructor(private sr: number) { this.d = [new DelayLine(sr * 4), new DelayLine(sr * 4)]; }
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number, _t0: number, clock: Clock) {
    const target = Math.min(this.sr * 3.9, (syncDiv(a).beats * 60 / clock.bpm) * this.sr);
    if (!this.time) this.time = target;
    const fb = b * 0.82, wet = Math.min(0.8, b * 0.9);
    for (let i = 0; i < n; i++) {
      this.time += (target - this.time) * 0.0005;
      for (const ch of [0, 1] as const) {
        const buf = ch ? R : L;
        const echo = this.d[ch].read(this.time + (ch ? this.sr * 0.004 : 0));
        this.damp[ch] += (echo - this.damp[ch]) * 0.35; // darker repeats
        this.d[ch].write(buf[i] + this.damp[ch] * fb);
        buf[i] += this.damp[ch] * wet;
      }
    }
  }
}

/** Small Freeverb-style reverb: 4 combs + 2 allpasses per side. */
export class Reverb implements Fx {
  private combs: { d: Float32Array; i: number; f: number }[][];
  private aps: { d: Float32Array; i: number }[][];
  constructor(sr: number, size: number) {
    const scale = (sr / 44100) * size;
    const mk = (lens: number[], spread: number) => lens.map((l) => ({ d: new Float32Array(Math.round((l + spread) * scale)), i: 0, f: 0 }));
    this.combs = [mk([1116, 1188, 1277, 1356], 0), mk([1116, 1188, 1277, 1356], 23)];
    this.aps = [[556, 441], [556, 441]].map((ls, s) => ls.map((l) => ({ d: new Float32Array(Math.round((l + s * 23) * (sr / 44100))), i: 0 })));
  }
  process(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
    const fb = 0.7 + a * 0.27, damp = 0.25, wet = b * 0.9, dry = 1 - b * 0.35;
    for (let i = 0; i < n; i++) {
      const input = (L[i] + R[i]) * 0.12;
      for (const ch of [0, 1] as const) {
        let acc = 0;
        for (const c of this.combs[ch]) {
          const y = c.d[c.i];
          c.f = y * (1 - damp) + c.f * damp;
          c.d[c.i] = input + c.f * fb;
          c.i = (c.i + 1) % c.d.length;
          acc += y;
        }
        for (const ap of this.aps[ch]) {
          const y = ap.d[ap.i];
          ap.d[ap.i] = acc + y * 0.5;
          ap.i = (ap.i + 1) % ap.d.length;
          acc = y - acc;
        }
        const buf = ch ? R : L;
        buf[i] = buf[i] * dry + acc * wet;
      }
    }
  }
}

export function makeFx(typeIndex: number, sr: number): Fx | null {
  switch (FX_TYPES[typeIndex]?.id) {
    case "eq": return new EQ(sr);
    case "lpf": return new Filter(sr, "lp");
    case "hpf": return new Filter(sr, "hp");
    case "bpf": return new Filter(sr, "bp");
    case "comp": return new Comp(sr);
    case "drive": return new Drive();
    case "decim": return new Decimator();
    case "chorus": return new Chorus(sr);
    case "phaser": return new Phaser(sr);
    case "trem": return new Tremolo(sr);
    case "pump": return new Pump(sr);
    case "slicer": return new Slicer(sr);
    case "delay": return new BpmDelay(sr);
    case "room": return new Reverb(sr, 0.7);
    case "hall": return new Reverb(sr, 1.5);
  }
  return null;
}
