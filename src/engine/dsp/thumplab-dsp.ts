// Thump Lab: an analog-style drum machine, all synthesis. Eight parts, each a compact module
// (kick, snare, clap, closed hat, open hat, low tom, high tom, perc), and a Model switch that
// re-voices every part at once (the hidden voicing below). Runs in the AudioWorklet.

import { OnePole, TAU } from "./units";
import { velGain, type InstrumentDSP } from "./instruments-dsp";
import { DRUM_BASE_NOTE } from "../instruments";

const panL = (p: number) => Math.cos(((p + 1) * Math.PI) / 4);
const panR = (p: number) => Math.sin(((p + 1) * Math.PI) / 4);

let seed = 77777;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

/** RBJ biquad, coefficients set once per hit. */
class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  set(type: "bp" | "hp" | "lp", f: number, q: number, sr: number) {
    const w = (TAU * Math.min(f, sr * 0.45)) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    if (type === "bp") { this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0; }
    else if (type === "hp") { this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = (1 + c) / 2 / a0; }
    else { this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = (1 - c) / 2 / a0; }
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** The hidden voicing each Model sets (what the one ★ switch moves). */
interface Voicing {
  kick: { tune: number; bend: number; bendT: number; click: number; drive: number; decay: number; soft: number };
  snare: { tone2: number; toneMix: number; nzLo: number; nzSpan: number; sweep: number; nzLp: number; gain: number };
  clap: { bursts: number; bp: number; q: number };
  hat: { metal: number; bp: number; hp: number; ratios: number; gain: number };
  tom: { bend: number; bendT: number; nzHp: number };
  perc: { bright: number };
}

/** Deep (big, boomy, metallic) · Club (punchy, clicky, noisy) · Tiny (small, tight, bright) · Parlour (soft rhythm box) · Hex (electronic sweeps). */
export const MODEL_NAMES = ["Deep", "Club", "Tiny", "Parlour", "Hex"];
const MODELS: Voicing[] = [
  { kick: { tune: 0.85, bend: 0.45, bendT: 0.04, click: 0.15, drive: 0.5, decay: 1.6, soft: 0 },
    snare: { tone2: 1.5, toneMix: 1.3, nzLo: 1500, nzSpan: 5000, sweep: 0, nzLp: 12000, gain: 0.55 },
    clap: { bursts: 4, bp: 1100, q: 1.4 }, hat: { metal: 0.35, bp: 8000, hp: 6500, ratios: 1, gain: 1.9 },
    tom: { bend: 0.5, bendT: 0.09, nzHp: 0 }, perc: { bright: 0.9 } },
  { kick: { tune: 1, bend: 1, bendT: 0.025, click: 1, drive: 1, decay: 1, soft: 0 },
    snare: { tone2: 1.62, toneMix: 1, nzLo: 400, nzSpan: 6000, sweep: 0, nzLp: 16000, gain: 0.62 },
    clap: { bursts: 3, bp: 1300, q: 1.1 }, hat: { metal: -0.15, bp: 9500, hp: 7000, ratios: 1.2, gain: 1.0 },
    tom: { bend: 1, bendT: 0.06, nzHp: 0 }, perc: { bright: 1.1 } },
  { kick: { tune: 1.35, bend: 0.7, bendT: 0.015, click: 0.6, drive: 0.7, decay: 0.55, soft: 0 },
    snare: { tone2: 1.75, toneMix: 0.7, nzLo: 2500, nzSpan: 7000, sweep: 0, nzLp: 16000, gain: 0.95 },
    clap: { bursts: 3, bp: 1700, q: 1.3 }, hat: { metal: 0.15, bp: 10500, hp: 8000, ratios: 1.35, gain: 1.6 },
    tom: { bend: 0.7, bendT: 0.04, nzHp: 0 }, perc: { bright: 1.25 } },
  { kick: { tune: 1.15, bend: 0.12, bendT: 0.03, click: 0, drive: 0, decay: 0.75, soft: 700 },
    snare: { tone2: 1, toneMix: 0.55, nzLo: 700, nzSpan: 2200, sweep: 0, nzLp: 5000, gain: 1 },
    clap: { bursts: 2, bp: 900, q: 0.9 }, hat: { metal: -0.45, bp: 6000, hp: 4500, ratios: 0.9, gain: 0.65 },
    tom: { bend: 0.2, bendT: 0.05, nzHp: 0 }, perc: { bright: 0.8 } },
  { kick: { tune: 1, bend: 2, bendT: 0.09, click: 0.8, drive: 1, decay: 0.9, soft: 0 },
    snare: { tone2: 1.4, toneMix: 1.2, nzLo: 900, nzSpan: 5000, sweep: 1, nzLp: 14000, gain: 0.5 },
    clap: { bursts: 4, bp: 1500, q: 2 }, hat: { metal: 0.1, bp: 9000, hp: 7000, ratios: 1.1, gain: 1.8 },
    tom: { bend: 2.6, bendT: 0.18, nzHp: 1500 }, perc: { bright: 1 } },
];

/** The six square oscillators of a metallic hat (ratios of the classic analog cymbal circuit). */
const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];

interface Voice {
  part: number; t: number; vel: number; acc: number; alive: boolean; fade: number;
  ph: number; ph2: number; sq: number[];
  f1: Biquad; f2: Biquad; lp: OnePole; lp2: OnePole; room: number;
}

export const THUMP_PARTS = 8;

export class ThumpLabDSP implements InstrumentDSP {
  private voices: (Voice | null)[] = Array(THUMP_PARTS).fill(null);
  constructor(public params: Record<string, number>, private sr: number) {}

  private get v(): Voicing { return MODELS[Math.max(0, Math.min(MODELS.length - 1, Math.round(this.params.model ?? 1)))]; }

  noteOn(pitch: number, vel: number) {
    const part = pitch - DRUM_BASE_NOTE;
    if (part < 0 || part >= THUMP_PARTS) return;
    const p = this.params, sr = this.sr, m = this.v;
    const voice: Voice = {
      part, t: 0, vel: velGain(vel / 127), acc: vel >= 100 ? p.accent ?? 0.3 : 0, alive: true, fade: 1,
      ph: 0, ph2: 0, sq: HAT_F.map(() => Math.random()), f1: new Biquad(), f2: new Biquad(), lp: new OnePole(), lp2: new OnePole(), room: 0,
    };
    if (part === 2) voice.f1.set("bp", m.clap.bp * (0.6 + (p.cTone ?? 0.5) * 0.9), m.clap.q, sr);
    if (part === 3 || part === 4) {
      const tone = part === 3 ? p.hTone ?? 0.5 : p.oTone ?? 0.5;
      voice.f1.set("bp", m.hat.bp * (0.75 + tone * 0.5), 0.9, sr);
      voice.f2.set("hp", m.hat.hp * (0.8 + tone * 0.4), 0.7, sr);
    }
    if (part === 7) {
      const type = Math.round(p.pType ?? 0), f = (p.pTune ?? 800) * m.perc.bright;
      if (type === 1) voice.f1.set("bp", f * 3.2, 2.5, sr); // cowbell body
      else voice.f1.set("hp", type === 0 ? 450 : 900, 0.7, sr);
    }
    // A closed hat chokes the open one.
    if (part === 3 && this.voices[4]?.alive) this.voices[4]!.fade = 0.999;
    this.voices[part] = voice;
  }
  noteOff() { /* one-shots */ }
  allOff() { for (const v of this.voices) if (v) v.alive = false; }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr, m = this.v, master = (p.level ?? 0.85) * 0.42;
    for (const v of this.voices) {
      if (!v || !v.alive) continue;
      const pan = [p.kPan, p.sPan, p.cPan, p.hPan, p.oPan, p.ltPan, p.htPan, p.pPan][v.part] ?? 0;
      const gl = panL(pan) * 1.41, gr = panR(pan) * 1.41;
      const accGain = 1 + v.acc * 0.7;
      for (let i = i0; i < i1; i++) {
        const t = v.t;
        let x = 0;
        switch (v.part) {
          case 0: { // kick: sine with a pitch drop, a click on top, Boost = drive + weight
            const k = m.kick, decay = (p.kDecay ?? 0.5) * k.decay;
            const f = (p.kTune ?? 50) * k.tune * (1 + (p.kBend ?? 0.5) * k.bend * 6 * Math.exp(-t / k.bendT));
            v.ph += f / sr;
            const env = Math.exp((-t * 4.6) / decay);
            x = Math.sin(TAU * v.ph) * env;
            const click = (p.kClick ?? 0.4) * k.click;
            if (t < 0.004 && click > 0) x += (noise() * 0.6 + Math.sin(TAU * t * 1800)) * click * (1 - t / 0.004);
            if (k.soft) x = v.lp.lp(x, k.soft + f * 4, sr) * 1.3;
            const g = 1 + ((p.kBoost ?? 0.3) + v.acc * 0.4) * 6 * k.drive;
            x = (Math.tanh(x * g) / Math.tanh(g)) * (1 + (p.kBoost ?? 0.3) * 0.25) * (p.kLevel ?? 0.9);
            if (env < 1e-4) v.alive = false;
            break;
          }
          case 1: { // snare: two tones + noise (Snappy), Punch = the attack, Tone = noise colour
            const s = m.snare, decay = p.sDecay ?? 0.22;
            const f = (p.sTune ?? 190) * (1 + s.sweep * 2.5 * Math.exp(-t / 0.05));
            v.ph += f / sr; v.ph2 += (f * s.tone2) / sr;
            const tone = (Math.sin(TAU * v.ph) + Math.sin(TAU * v.ph2) * 0.5) * Math.exp((-t * 4.6) / (decay * 0.5)) * s.toneMix;
            let nz = v.lp2.lp(noise(), s.nzLp, sr);
            nz = (nz - v.lp.lp(nz, s.nzLo + (p.sTone ?? 0.5) * s.nzSpan, sr)) * Math.exp((-t * 4.6) / decay);
            const snap = p.sSnappy ?? 0.6;
            x = (tone * (1 - snap * 0.6) + nz * snap * 1.3) * (1 + (p.sPunch ?? 0.3) * 2.5 * Math.exp(-t / 0.007)) * s.gain * (p.sLevel ?? 0.75);
            if (t > decay * 1.6) v.alive = false;
            break;
          }
          case 2: { // clap: a few quick hand hits (Spread = their spacing), then a tail and a room
            const c = m.clap, decay = p.cDecay ?? 0.3, gap = 0.004 + (p.cSpread ?? 0.5) * 0.014;
            const last = (c.bursts - 1) * gap;
            let env = 0;
            for (let b = 0; b < c.bursts; b++) { const tb = t - b * gap; if (tb >= 0) env = Math.max(env, Math.exp(-tb / (b === c.bursts - 1 ? decay * 0.22 : 0.0035))); }
            const n = noise();
            x = v.f1.run(n) * env * 2.4;
            v.room = v.room * 0.9993 + n * (t > last ? 0.04 : 0); // a short diffuse tail
            x += v.lp.lp(v.room, 2500, sr) * (p.cRoom ?? 0.3) * Math.exp((-(t - last) * 4.6) / (decay * 2.5)) * 2;
            x *= p.cLevel ?? 0.7;
            if (t > last + decay * 2.6) v.alive = false;
            break;
          }
          case 3: case 4: { // hats: six detuned squares (Metal) against noise, band-passed; Tone = brightness
            const closed = v.part === 3, decay = closed ? p.hDecay ?? 0.06 : p.oDecay ?? 0.35;
            const metal = Math.max(0, Math.min(1, (closed ? p.hMetal ?? 0.6 : p.oMetal ?? 0.6) + m.hat.metal));
            let sq = 0;
            for (let k = 0; k < 6; k++) { v.sq[k] = (v.sq[k] + (HAT_F[k] * m.hat.ratios) / sr) % 1; sq += v.sq[k] < 0.5 ? 1 : -1; }
            const src = (sq / 6) * metal * 1.8 + noise() * (1 - metal) * 0.8;
            const env = Math.exp((-t * 4.6) / decay) * (t < 0.0015 ? t / 0.0015 : 1);
            x = v.f2.run(v.f1.run(src)) * env * 3.2 * m.hat.gain * (closed ? p.hLevel ?? 0.55 : p.oLevel ?? 0.5);
            if (t > 0.002 && env < 1e-4) v.alive = false;
            break;
          }
          case 5: case 6: { // toms: a pitched sine with a bend, a little noise
            const lo = v.part === 5, tm = m.tom;
            const decay = lo ? p.ltDecay ?? 0.45 : p.htDecay ?? 0.35;
            const f = (lo ? p.ltTune ?? 100 : p.htTune ?? 170) * (1 + (lo ? p.ltBend ?? 0.4 : p.htBend ?? 0.4) * tm.bend * 1.5 * Math.exp(-t / tm.bendT));
            v.ph += f / sr;
            const env = Math.exp((-t * 4.6) / decay);
            let nz = v.lp.lp(noise(), 3000, sr);
            if (tm.nzHp) nz -= v.lp2.lp(nz, tm.nzHp, sr);
            x = (Math.sin(TAU * v.ph) + nz * (lo ? p.ltNoise ?? 0.15 : p.htNoise ?? 0.15) * 2) * env * (lo ? p.ltLevel ?? 0.7 : p.htLevel ?? 0.7);
            if (env < 1e-4) v.alive = false;
            break;
          }
          default: { // perc: rim, cowbell or clave; Depth / Speed = a pitch wobble
            const type = Math.round(p.pType ?? 0), decay = p.pDecay ?? 0.12;
            const wob = (p.pSpeed ?? 0) > 0 ? Math.pow(2, ((p.pDepth ?? 0) * Math.sin(TAU * t * (p.pSpeed ?? 0) * 30)) / 2) : 1;
            const f = (p.pTune ?? 800) * m.perc.bright * wob;
            let env: number;
            if (type === 1) { // cowbell: two squares a fifth-ish apart, a fast drop then a ring
              v.ph = (v.ph + (f * 0.675) / sr) % 1; v.ph2 = (v.ph2 + f / sr) % 1;
              env = (0.6 * Math.exp(-t / 0.012) + 0.4) * Math.exp((-t * 4.6) / (decay * 2.5));
              x = v.f1.run(((v.ph < 0.5 ? 1 : -1) + (v.ph2 < 0.5 ? 1 : -1)) * 0.5) * env * 2.2;
            } else if (type === 2) { // clave: a short bright sine
              v.ph += (f * 3.1) / sr;
              env = Math.exp((-t * 4.6) / (decay * 0.5));
              x = Math.sin(TAU * v.ph) * env;
            } else { // rim: a sharp tone + a click
              v.ph += (f * 2.1) / sr;
              env = Math.exp((-t * 4.6) / (decay * 0.35));
              x = v.f1.run(Math.sin(TAU * v.ph) * env + noise() * Math.exp(-t / 0.0015) * 0.8);
            }
            x *= p.pLevel ?? 0.6;
            if (env < 1e-4) v.alive = false;
          }
        }
        if (v.fade < 1) { v.fade *= 0.997; if (v.fade < 1e-3) v.alive = false; x *= v.fade; }
        x *= v.vel * accGain * master;
        L[i] += x * gl;
        R[i] += x * gr;
        v.t += 1 / sr;
        if (!v.alive) break;
      }
    }
  }
}
