// Axe: an electric guitar through an amp and a cab, all modelled (no samples).
//
// Strings: Karplus-Strong, plucked with a pick (a shaped noise burst), heard through a pickup (a
// comb at the pickup's position: neck round, bridge bright and thin). Playing:
//   velocity 51-126  an open note
//   velocity <= 50   palm-muted: heavily damped, short and thuddy (the "m" chug)
//   velocity 127     pick squeal: a pinch harmonic, bright, with vibrato
// Amp: clean, crunch or high gain (2x oversampled clipping stages, tightened lows, a mid scoop on
// high gain), a tone control, then a cabinet (a closed-back 4x12: resonant lows, a presence peak,
// the speaker's roll-off), a doubled-guitar width (a second, slightly detuned "take" on the other
// side) and a room.

import { ADSR, OnePole, mtof, voiceMod } from "./units";
import { velGain, type InstrumentDSP } from "./instruments-dsp";
import { claim } from "./instruments3-dsp";
import { Reverb } from "./fx-dsp";

let seed = 9157;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

/** RBJ biquad (peak, low / high shelf, low / high pass). */
class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private key = "";
  set(type: "peak" | "low" | "high" | "lp" | "hp", f: number, q: number, db: number, sr: number) {
    const k = `${type}${f.toFixed(1)}${q}${db.toFixed(2)}${sr}`;
    if (k === this.key) return this;
    this.key = k;
    const A = Math.pow(10, db / 40), w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "peak") { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else {
      const sq = 2 * Math.sqrt(A) * al, s = type === "low" ? 1 : -1;
      b0 = A * ((A + 1) - s * (A - 1) * cs + sq); b1 = 2 * s * A * ((A - 1) - s * (A + 1) * cs); b2 = A * ((A + 1) - s * (A - 1) * cs - sq);
      a0 = (A + 1) + s * (A - 1) * cs + sq; a1 = -2 * s * ((A - 1) + s * (A + 1) * cs); a2 = (A + 1) + s * (A - 1) * cs - sq;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

interface GVoice {
  pitch: number; held: boolean; age: number; amp: ADSR; vel: number; t: number;
  buf: Float32Array; w: number; len: number; lp: number; g: number; mute: boolean; squeal: boolean;
  pick: Float32Array; pw: number; env: number; rel: boolean;
}

export const AMP_MODES = ["Clean", "Crunch", "High gain"];

export class GuitarDSP implements InstrumentDSP {
  private voices: GVoice[] = [];
  private counter = 0;
  private room: Reverb;
  // Amp chain (2x oversampled stages), cab, width.
  private tight = new OnePole();
  private pre = new Biquad();
  private up = new Biquad();
  private down = new Biquad();
  private stage2 = new OnePole();
  private scoop = new Biquad();
  private treble = new Biquad();
  private bassEq = new Biquad();
  private cabHp = new Biquad();
  private cabRes = new Biquad();
  private cabPres = new Biquad();
  private cabLp = new Biquad();
  private cabLp2 = new Biquad();
  private dc = new OnePole();
  private last = 0;
  private dbl: Float32Array;
  private dw = 0;
  private dph = 0;
  private bl = new Float32Array(128);
  private br = new Float32Array(128);
  private il = new Float32Array(128);
  private ir = new Float32Array(128);
  constructor(public params: Record<string, number>, private sr: number) {
    this.room = new Reverb(sr, 0.7);
    this.dbl = new Float32Array(Math.ceil(sr * 0.05));
  }

  noteOn(pitch: number, vel: number) {
    const p = this.params, sr = this.sr;
    const v = claim(this.voices, 12, pitch, () => ({
      pitch, held: true, age: 0, amp: new ADSR(), vel: 1, t: 0, buf: new Float32Array(4096), w: 0, len: 100, lp: 0, g: 0.99, mute: false, squeal: false,
      pick: new Float32Array(1), pw: 0, env: 1, rel: false,
    }), ++this.counter);
    v.held = true; v.t = 0; v.env = 1; v.rel = false;
    v.vel = vel / 127;
    v.mute = vel <= 50;
    v.squeal = vel >= 127;
    const f = mtof(pitch) * voiceMod.pitch;
    v.len = Math.max(2, Math.min(4000, sr / f));
    const n = Math.ceil(v.len), attack = p.pick ?? 0.6;
    // The pick: a noise burst, brighter for a harder pick; a pinch harmonic excites near a node.
    const bright = v.mute ? 0.25 : 0.25 + attack * 0.6 + (v.squeal ? 0.2 : 0);
    let z = 0;
    for (let i = 0; i < n; i++) {
      const x = noise() * (0.6 + attack * 0.4) + (v.squeal ? Math.sin((Math.PI * 2 * 3 * i) / n) * 0.8 : Math.sin((Math.PI * i) / n) * 0.5);
      z += bright * (x - z);
      v.buf[i] = z;
    }
    v.w = n % v.buf.length; v.lp = 0;
  }

  noteOff(pitch: number) {
    for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.rel = true; }
  }
  allOff() { for (const v of this.voices) { v.held = false; v.rel = true; } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr, n = i1 - i0;
    if (this.bl.length < n) { this.bl = new Float32Array(n); this.br = new Float32Array(n); this.il = new Float32Array(n); this.ir = new Float32Array(n); }
    const bl = this.bl, br = this.br;
    bl.fill(0, 0, n);
    const sustain = p.sustain ?? 4, palm = p.palm ?? 0.7, pickup = p.pickup ?? 0.7;
    // ---- strings, summed (mono: one guitar)
    for (const v of this.voices) {
      const f = mtof(v.pitch) * voiceMod.pitch;
      // Loop: brighter strings ring longer; a palm mute darkens and chokes them.
      const k = v.mute ? 0.22 - palm * 0.1 : v.squeal ? 0.9 : 0.62;
      const dec = v.mute ? 0.18 - palm * 0.1 : v.squeal ? sustain * 0.6 : sustain * Math.pow(2, (52 - v.pitch) / 30);
      const loopDelay = (1 - k) / k;
      v.len = Math.max(2, Math.min(4000, sr / f - loopDelay));
      const g = Math.exp(-6.9 / (f * Math.max(0.03, dec)));
      const vg = velGain(v.mute ? 0.75 : Math.min(1, v.vel + 0.1)) * (v.squeal ? 0.7 : 1);
      // Pickup: the string seen at a point (bridge: near the end, thin and bright).
      const pos = Math.max(1, Math.round(v.len * (0.06 + (1 - pickup) * 0.2)));
      const size = v.buf.length;
      for (let i = 0; i < n; i++) {
        const rp = v.w - v.len, ri = Math.floor(rp), fr = rp - ri;
        const a = v.buf[(ri + size) % size], b = v.buf[(ri + 1 + size) % size];
        let out = a + (b - a) * fr;
        // Pinch harmonic vibrato: a little wobble once it's sounding.
        if (v.squeal && v.t > 0.12) out *= 1 + Math.sin(v.t * 2 * Math.PI * 5.5) * 0.04;
        v.lp += k * (out - v.lp);
        v.buf[v.w] = v.lp * g;
        v.w = (v.w + 1) % size;
        const picked = out - v.buf[(v.w - pos - 1 + size * 2) % size] * 0.6;
        // Release: a fret hand lifting (fast), so chugs and stabs stop when they should.
        if (v.rel) v.env *= v.mute ? 0.9985 : 0.9993;
        bl[i] += picked * vg * v.env;
        v.t += 1 / sr;
      }
    }
    this.voices = this.voices.filter((v) => v.env > 0.0005 && (v.held || v.rel));
    // ---- amp
    const mode = Math.round(p.amp ?? 1), gain = p.gain ?? 0.5, tone = p.tone ?? 0.55;
    const drive = [1.2 + gain * 5, 3 + gain * 40, 12 + gain * 260][mode] ?? 10;
    const tightF = [90, 140, 190][mode] ?? 120; // the lows tightened before the amp, more for more gain
    this.pre.set("peak", 800, 0.7, mode === 2 ? 6 : 3, sr * 2);
    this.up.set("lp", sr * 0.45, 0.7, 0, sr * 2);
    this.down.set("lp", sr * 0.42, 0.7, 0, sr * 2);
    this.scoop.set("peak", 650, 0.9, mode === 2 ? -5 - gain * 3 : mode === 1 ? -1.5 : 0, sr);
    this.treble.set("high", 2800, 0.7, -6 + tone * 12, sr);
    this.bassEq.set("low", 120, 0.7, mode === 2 ? 2 : 1, sr);
    // Cab: closed-back 4x12.
    this.cabHp.set("hp", 100, 0.7, 0, sr);
    this.cabRes.set("peak", 120, 1.4, 2, sr);
    this.cabPres.set("peak", 2400 + tone * 1400, 1.1, 3 + tone * 2, sr);
    this.cabLp.set("lp", 4800 + tone * 1800, 0.8, 0, sr);
    this.cabLp2.set("lp", 6500 + tone * 2000, 0.7, 0, sr);
    const outGain = [0.42, 0.39, 0.43][mode] ?? 0.4; // the three amps about equally loud
    for (let i = 0; i < n; i++) {
      let x = this.tight.hp(bl[i], tightF, sr);
      // Two half-samples through the clipping stages (2x oversampling).
      let y = 0;
      for (let k = 0; k < 2; k++) {
        const xi = this.up.run(k === 0 ? (this.last + x) * 0.5 : x) * 2;
        let s = this.pre.run(xi) * drive;
        s = Math.tanh(s + 0.15 * s * s / (1 + Math.abs(s))) ; // a little asymmetry: even harmonics
        if (mode === 2) s = Math.tanh(this.stage2.lp(s, 6000, sr * 2) * 3.2);
        y = this.down.run(s);
      }
      this.last = x;
      x = this.bassEq.run(this.scoop.run(this.treble.run(y)));
      x = this.cabLp2.run(this.cabLp.run(this.cabPres.run(this.cabRes.run(this.cabHp.run(x)))));
      x = this.dc.hp(x, 20, sr) * outGain;
      bl[i] = x;
    }
    // ---- width: the other side hears a second take (slightly later, slightly detuned).
    const width = p.width ?? 0.5, d = this.dbl, dl = d.length;
    for (let i = 0; i < n; i++) {
      d[this.dw] = bl[i];
      this.dph += 0.37 / sr;
      const delay = (0.011 + 0.0025 * Math.sin(this.dph * 2 * Math.PI)) * sr;
      const rp = this.dw - delay, ri = Math.floor(rp), fr = rp - ri;
      const a = d[(ri + dl) % dl], b = d[(ri + 1 + dl) % dl];
      br[i] = a + (b - a) * fr;
      this.dw = (this.dw + 1) % dl;
    }
    const level = (p.level ?? 0.6), roomLv = p.room ?? 0.15;
    for (let i = 0; i < n; i++) {
      const dry = bl[i], take2 = br[i];
      // Width 0: one amp in the middle; 1: the two takes hard left and right.
      bl[i] = dry * (1 - width * 0.35) + take2 * width * 0.15;
      br[i] = dry * (1 - width) + take2 * width * 0.95;
    }
    if (roomLv > 0.01) {
      const il = this.il, ir = this.ir;
      il.set(bl.subarray(0, n)); ir.set(br.subarray(0, n));
      this.room.process(il, ir, n, 0.35, 1);
      for (let i = 0; i < n; i++) { bl[i] += (il[i] - bl[i] * 0.65) * roomLv * 1.4; br[i] += (ir[i] - br[i] * 0.65) * roomLv * 1.4; }
    }
    for (let i = 0; i < n; i++) { L[i0 + i] += bl[i] * level; R[i0 + i] += br[i] * level; }
  }
}
