// DSP for Pixel (chip), Glint (FM), Morph (wavetable) and Grab (sampler).
// Runs in the AudioWorklet.

import { ADSR, SVF, TAU, blep, mtof, smooth, voiceMod } from "./units";
import { velGain, type InstrumentDSP } from "./instruments-dsp";
import { DRUM_BASE_NOTE } from "../instruments";
import { JUMP_STEPS, M_RATIOS, C_RATIOS, SAMPLER_PADS, WT_FRAMES, WT_LEVELS, WT_SIZE } from "../instruments3";

const panL = (p: number) => Math.cos(((p + 1) * Math.PI) / 4);
const panR = (p: number) => Math.sin(((p + 1) * Math.PI) / 4);

/** Shared polyphony bookkeeping: find a voice for a new note, stealing released ones first. */
interface BaseVoice { pitch: number; held: boolean; age: number; amp: ADSR }
function claim<V extends BaseVoice>(voices: V[], max: number, pitch: number, make: () => V, counter: number): V {
  let v = voices.find((x) => x.pitch === pitch && x.held);
  if (!v) {
    if (voices.length >= max) {
      const rel = voices.filter((x) => !x.held);
      const victim = (rel.length ? rel : voices).reduce((a, b) => (a.age < b.age ? a : b));
      voices.splice(voices.indexOf(victim), 1);
    }
    v = make();
    voices.push(v);
  }
  v.age = counter;
  v.held = true;
  return v;
}

// ---------------------------------------------------------------- Pixel: 8-bit chip

interface ChipVoice extends BaseVoice { vel: number; ph: number; t: number; lfsr: number; noiseOut: number; noiseAcc: number; pan: number }

export class ChipDSP implements InstrumentDSP {
  private voices: ChipVoice[] = [];
  private counter = 0;
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    const v = claim(this.voices, 6, pitch, () => ({ pitch, held: true, age: 0, amp: new ADSR(), vel: 1, ph: 0, t: 0, lfsr: 1, noiseOut: 1, noiseAcc: 0, pan: 0 }), ++this.counter);
    v.vel = vel / 127; v.t = 0; v.ph = 0;
    v.pan = ((this.counter % 3) - 1) * 0.25;
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    const wave = Math.round(p.wave ?? 0);
    const steps = JUMP_STEPS[Math.round(p.jump ?? 0)] ?? [0];
    const jumpRate = p.jumpRate ?? 24, sweep = p.sweep ?? 0, sweepT = p.sweepTime ?? 0.08;
    const vibD = (p.vibDepth ?? 0) * 0.6, vibR = p.vibRate ?? 6;
    const a = p.attack ?? 0.002, d = p.decay ?? 0.3, s = p.sustain ?? 0.6, r = p.release ?? 0.12;
    const crush = p.crush ?? 0.3, levels = Math.pow(2, 8 - crush * 5);
    const level = (p.level ?? 0.55) * 0.3;
    // Pulse width from the toolkit scales the chosen duty (0.5 = as chosen).
    const duty = Math.max(0.03, Math.min(0.97, (wave === 1 ? 0.25 : wave === 2 ? 0.125 : 0.5) * (voiceMod.pw / 0.5)));
    for (let i = i0; i < i1; i++) {
      let l = 0, rr = 0;
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        // Jump: cycle chord tones at a fixed rate (the classic chip arpeggio); sweep: slide in from an offset.
        const jumpSemis = steps[Math.floor(v.t * jumpRate) % steps.length];
        const sweepSemis = sweep * Math.exp(-v.t / sweepT);
        const vib = vibD * Math.sin(TAU * vibR * Math.max(0, v.t - 0.15));
        const f = mtof(v.pitch + jumpSemis + sweepSemis + vib) * voiceMod.pitch;
        const dt = Math.min(0.5, f / sr);
        let x: number;
        if (wave <= 2) {
          x = (v.ph < duty ? 1 : -1) + blep(v.ph, dt) - blep((v.ph + 1 - duty) % 1, dt);
        } else if (wave === 3) {
          // 4-bit stepped triangle, like the old sound chips.
          x = Math.round((1 - 4 * Math.abs(v.ph - 0.5)) * 7.5) / 7.5;
        } else {
          // 15-bit LFSR noise, clocked faster for higher notes.
          v.noiseAcc += (f * 8) / sr;
          while (v.noiseAcc >= 1) {
            v.noiseAcc -= 1;
            const bit = (v.lfsr ^ (v.lfsr >> 1)) & 1;
            v.lfsr = (v.lfsr >> 1) | (bit << 14);
            v.noiseOut = v.lfsr & 1 ? 1 : -1;
          }
          x = v.noiseOut;
        }
        v.ph += dt;
        if (v.ph >= 1) v.ph -= 1;
        v.t += 1 / sr;
        // 16-step volume, as on the hardware.
        const env = Math.ceil(v.amp.next(a, d, s, r, sr) * 15) / 15;
        const y = x * env * velGain(v.vel);
        l += y * panL(v.pan); rr += y * panR(v.pan);
      }
      if (crush > 0.01) { l = Math.round(l * levels) / levels; rr = Math.round(rr * levels) / levels; }
      L[i] += l * level;
      R[i] += rr * level;
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}

// ---------------------------------------------------------------- Glint: two-operator FM

interface FmVoice extends BaseVoice { vel: number; pc: number[]; pm: number; fb: number; t: number }

export class FmDSP implements InstrumentDSP {
  private voices: FmVoice[] = [];
  private counter = 0;
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    const v = claim(this.voices, 8, pitch, () => ({ pitch, held: true, age: 0, amp: new ADSR(), vel: 1, pc: [0, 0], pm: 0, fb: 0, t: 0 }), ++this.counter);
    v.vel = vel / 127; v.t = 0;
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    const rc = Number(C_RATIOS[Math.round(p.ratioC ?? 1)] ?? 1), rm = Number(M_RATIOS[Math.round(p.ratioM ?? 6)] ?? 3.5);
    const index = p.index ?? 3, idxDecay = p.indexDecay ?? 0.8, idxSus = p.indexSus ?? 0.15;
    const fbAmt = (p.feedback ?? 0.05) * 1.5, velIdx = p.velIndex ?? 0.6;
    const det = (p.detune ?? 0.3) * 0.004;
    const a = p.attack ?? 0.002, d = p.decay ?? 1.6, s = p.sustain ?? 0, r = p.release ?? 1.2;
    const level = (p.level ?? 0.6) * 0.3;
    for (let i = i0; i < i1; i++) {
      let l = 0, rr = 0;
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        const f = mtof(v.pitch) * voiceMod.pitch;
        const idx = index * (idxSus + (1 - idxSus) * Math.exp(-v.t / idxDecay)) * (1 - velIdx + velIdx * v.vel);
        v.pm += (f * rm) / sr;
        if (v.pm >= 1) v.pm -= 1;
        const mod = Math.sin(TAU * v.pm + v.fb * fbAmt);
        v.fb = mod;
        const env = v.amp.next(a, d, s, r, sr) * velGain(v.vel);
        // Two carriers detuned a hair apart for a wide stereo image.
        for (let c = 0; c < 2; c++) {
          v.pc[c] += (f * rc * (1 + (c ? det : -det))) / sr;
          if (v.pc[c] >= 1) v.pc[c] -= 1;
        }
        l += Math.sin(TAU * v.pc[0] + idx * mod) * env;
        rr += Math.sin(TAU * v.pc[1] + idx * mod) * env;
        v.t += 1 / sr;
      }
      L[i] += l * level;
      R[i] += rr * level;
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}

// ---------------------------------------------------------------- Morph: wavetable

interface WtVoice extends BaseVoice { vel: number; ph: number[]; t: number; f: SVF[] }

export class WavetableDSP implements InstrumentDSP {
  private voices: WtVoice[] = [];
  private counter = 0;
  private lfo = 0;
  private cut = 9000;
  /** mips[level] = 33 frames x 2048 samples, band-limited for that level. Sent by the main thread. */
  mips: Float32Array[] | null = null;
  constructor(public params: Record<string, number>, private sr: number) {}

  setMips(m: Float32Array[]) { this.mips = m; }

  noteOn(pitch: number, vel: number) {
    const v = claim(this.voices, 8, pitch, () => ({ pitch, held: true, age: 0, amp: new ADSR(), vel: 1, ph: [Math.random(), Math.random(), Math.random()], t: 0, f: [new SVF(), new SVF()] }), ++this.counter);
    v.vel = vel / 127; v.t = 0;
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  /** One sample from the table at frame position `pos` (0..32) and phase 0..1, band-limited for `freq`. */
  private read(pos: number, phase: number, freq: number): number {
    const mips = this.mips!;
    const maxH = this.sr / (2 * freq);
    const level = Math.max(0, Math.min(WT_LEVELS - 1, Math.ceil(Math.log2(1024 / Math.max(1, maxH)))));
    const t = mips[level];
    const f0 = Math.min(WT_FRAMES - 2, Math.floor(pos)), ff = pos - f0;
    const x = phase * WT_SIZE, i0 = Math.floor(x) % WT_SIZE, i1 = (i0 + 1) % WT_SIZE, fr = x - Math.floor(x);
    const a = t[f0 * WT_SIZE + i0] + (t[f0 * WT_SIZE + i1] - t[f0 * WT_SIZE + i0]) * fr;
    const b = t[(f0 + 1) * WT_SIZE + i0] + (t[(f0 + 1) * WT_SIZE + i1] - t[(f0 + 1) * WT_SIZE + i0]) * fr;
    return a + (b - a) * ff;
  }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    if (!this.mips) return;
    const p = this.params, sr = this.sr;
    const pos0 = p.pos ?? 0.2, envAmt = p.envAmt ?? 0.4, envDecay = p.envDecay ?? 0.8;
    const lfoAmt = (p.lfoAmt ?? 0.15) * 0.5, lfoRate = p.lfoRate ?? 0.5;
    const n = Math.round(p.unison ?? 1) + 1;
    const det = (p.detune ?? 0.25) * 0.012;
    const a = p.attack ?? 0.01, d = p.decay ?? 0.6, s = p.sustain ?? 0.7, r = p.release ?? 0.6;
    const res = p.reso ?? 0.15;
    const level = ((p.level ?? 0.55) * 0.55) / Math.sqrt(n);
    for (let i = i0; i < i1; i++) {
      this.lfo = (this.lfo + lfoRate / sr) % 1;
      const lfo = Math.sin(TAU * this.lfo) * lfoAmt;
      this.cut = smooth(this.cut, p.cutoff ?? 9000, 0.002);
      let l = 0, rr = 0;
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        const pos = Math.max(0, Math.min(1, pos0 + envAmt * Math.exp(-v.t / envDecay) + lfo)) * (WT_FRAMES - 1);
        const f = mtof(v.pitch) * voiceMod.pitch;
        const env = v.amp.next(a, d, s, r, sr) * velGain(v.vel);
        let vl = 0, vr = 0;
        for (let u = 0; u < n; u++) {
          const off = n === 1 ? 0 : (u / (n - 1)) * 2 - 1;
          const fu = f * (1 + off * det);
          v.ph[u] = (v.ph[u] + fu / sr) % 1;
          const x = this.read(pos, v.ph[u], fu);
          vl += x * panL(off * 0.8); vr += x * panR(off * 0.8);
        }
        l += v.f[0].lp(vl, this.cut, res, sr) * env;
        rr += v.f[1].lp(vr, this.cut, res, sr) * env;
        v.t += 1 / sr;
      }
      L[i] += l * level * 1.41;
      R[i] += rr * level * 1.41;
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}

// ---------------------------------------------------------------- Grab: sampler pads

interface PadVoice { part: number; pos: number; rate: number; amp: number; decayK: number; vel: number; releasing: boolean; held: boolean }

export class SamplerDSP implements InstrumentDSP {
  private voices: PadVoice[] = [];
  samples: Float32Array[] = [];
  rates: number[] = [];
  constructor(public params: Record<string, number>, private sr: number) {}

  setSamples(s: Float32Array[], rates: number[]) { this.samples = s; this.rates = rates; }

  noteOn(pitch: number, vel: number) {
    const part = pitch - DRUM_BASE_NOTE;
    const data = this.samples[part];
    if (part < 0 || part >= SAMPLER_PADS || !data?.length) return;
    const p = this.params;
    for (const v of this.voices) if (v.part === part) v.releasing = true; // a pad retriggers itself
    const rev = (p[`p${part}rev`] ?? 0) >= 0.5;
    const start = (p[`p${part}start`] ?? 0) * data.length;
    this.voices.push({
      part, vel: velGain(vel / 127), amp: 1, held: true, releasing: false,
      pos: rev ? data.length - 2 - start : start, // reversed starts one step inside the end
      rate: Math.pow(2, (p[`p${part}tune`] ?? 0) / 12) * ((this.rates[part] ?? this.sr) / this.sr) * (rev ? -1 : 1),
      decayK: Math.exp(-4.6 / ((p[`p${part}decay`] ?? 10) * this.sr)),
    });
    if (this.voices.length > 24) this.voices.shift();
  }
  noteOff(pitch: number) {
    const part = pitch - DRUM_BASE_NOTE;
    for (const v of this.voices) if (v.part === part && v.held) {
      v.held = false;
      const mode = Math.round(this.params[`p${part}mode`] ?? 0);
      if (mode >= 1) v.releasing = true; // gate and loop stop when the note ends
    }
  }
  allOff() { for (const v of this.voices) v.releasing = true; }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, master = p.level ?? 0.8;
    const relK = Math.exp(-6.9 / (0.02 * this.sr));
    for (const v of this.voices) {
      const data = this.samples[v.part];
      if (!data) { v.amp = 0; continue; }
      const level = (p[`p${v.part}level`] ?? 0.8) * v.vel * master * 0.6;
      const pan = p[`p${v.part}pan`] ?? 0;
      const gl = panL(pan) * level, gr = panR(pan) * level;
      const loop = Math.round(p[`p${v.part}mode`] ?? 0) === 2;
      const startPos = (p[`p${v.part}start`] ?? 0) * data.length;
      for (let i = i0; i < i1; i++) {
        if (v.pos < 0 || v.pos >= data.length - 1) {
          if (loop && !v.releasing) v.pos = v.rate > 0 ? startPos : data.length - 2 - startPos;
          else { v.amp = 0; break; }
        }
        const ip = Math.floor(v.pos), fr = v.pos - ip;
        const x = (data[ip] + (data[ip + 1] - data[ip]) * fr) * v.amp;
        L[i] += x * gl;
        R[i] += x * gr;
        v.pos += v.rate;
        v.amp *= v.releasing ? relK : v.decayK;
        if (v.amp < 1e-4) { v.amp = 0; break; }
      }
    }
    this.voices = this.voices.filter((v) => v.amp >= 1e-4);
  }
}
