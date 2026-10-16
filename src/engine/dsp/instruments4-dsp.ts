// DSP for the Phase 4 instruments (new ones). Runs in the AudioWorklet.

import { ADSR, Ladder, OnePole, SVF, TAU, blep, mtof, smooth, voiceMod } from "./units";
import { velGain, type InstrumentDSP } from "./instruments-dsp";
import { claim } from "./instruments3-dsp";
import { Reverb } from "./fx-dsp";

const panL = (p: number) => Math.cos(((p + 1) * Math.PI) / 4);
const panR = (p: number) => Math.sin(((p + 1) * Math.PI) / 4);

let seed = 4242;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// ---------------------------------------------------------------- Tine: FM electric piano

interface TineVoice { pitch: number; held: boolean; age: number; amp: ADSR; vel: number; t: number; pc: number; pm: number; pb: number; off: number }

/**
 * Tine: the bell-and-bark electric piano, in FM. A tine (carrier + a modulator at the same ratio
 * whose index falls fast: the bell), a high "ping" operator for the strike, a felt release thump.
 * Bark (the character control) drives the amp, sends velocity to the FM index and lifts the mids,
 * so hard notes growl. Tremolo is off, mono (level) or stereo (auto-pan).
 */
export class TineDSP implements InstrumentDSP {
  private voices: TineVoice[] = [];
  private counter = 0;
  private trem = 0;
  private toneL = new OnePole();
  private toneR = new OnePole();
  private midL = new SVF();
  private midR = new SVF();
  private thumps: { t: number; g: number; pitch: number }[] = [];
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    const v = claim(this.voices, 12, pitch, () => ({ pitch, held: true, age: 0, amp: new ADSR(), vel: 1, t: 0, pc: 0, pm: 0, pb: 0, off: 0 }), ++this.counter);
    v.vel = vel / 127; v.t = 0; v.off = 0;
    v.amp.gate(true);
  }
  noteOff(pitch: number) {
    for (const v of this.voices) if (v.pitch === pitch && v.held) {
      v.held = false; v.amp.gate(false);
      // Key-off: the damper's soft thump, quieter for high notes.
      if ((this.params.keyOff ?? 0.3) > 0.01) this.thumps.push({ t: 0, g: (this.params.keyOff ?? 0.3) * (0.4 + 0.6 * v.vel), pitch });
    }
  }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    const bark = p.bark ?? 0.35, tone = p.tone ?? 0.55;
    const tremMode = Math.round(p.trem ?? 0), tremRate = p.tremRate ?? 4.5, tremDepth = p.tremDepth ?? 0.4;
    const bell = p.bell ?? 0.35, idx0 = p.index ?? 1.4;
    const decay = p.decay ?? 3, release = p.release ?? 0.18;
    const level = (p.level ?? 0.6) * 0.45;
    const drive = 1 + bark * 3, dn = Math.tanh(drive);
    const cut = 1200 * Math.pow(12, tone);
    for (let i = i0; i < i1; i++) {
      this.trem = (this.trem + tremRate / sr) % 1;
      const lfo = Math.sin(TAU * this.trem);
      let l = 0, r = 0;
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        const f = mtof(v.pitch) * voiceMod.pitch;
        // Low notes ring longer, like real tines.
        const dk = decay * Math.pow(2, (60 - v.pitch) / 24);
        const env = v.amp.next(0.002, dk, 0, release, sr) * velGain(v.vel);
        const vi = v.vel * (1 + bark * 1.5);
        const idx = idx0 * vi * (0.25 + 0.75 * Math.exp(-v.t / 0.25)) + bark * v.vel * 1.2 * Math.exp(-v.t / 0.08);
        v.pm += f / sr; if (v.pm >= 1) v.pm -= 1;
        v.pb += (f * 14) / sr; if (v.pb >= 1) v.pb -= 1;
        v.pc += f / sr; if (v.pc >= 1) v.pc -= 1;
        const ping = Math.sin(TAU * v.pb) * bell * v.vel * Math.exp(-v.t / 0.03);
        const x = Math.sin(TAU * v.pc + idx * Math.sin(TAU * v.pm)) + ping * 0.5;
        const pan = tremMode === 2 ? lfo * tremDepth : 0;
        l += x * env * panL(pan); r += x * env * panR(pan);
        v.t += 1 / sr;
      }
      for (const k of this.thumps) {
        const e = Math.exp(-k.t / 0.02) * k.g * 0.25;
        const th = (Math.sin(TAU * k.t * mtof(k.pitch - 24)) * 0.6 + noise() * 0.4) * e;
        l += th; r += th;
        k.t += 1 / sr;
      }
      // Tone (a low-pass), Bark's mid lift and drive, then the mono tremolo.
      l = this.toneL.lp(l, cut, sr); r = this.toneR.lp(r, cut, sr);
      if (bark > 0.01) {
        l += this.midL.lp(l, 900, 0.5, sr) * bark * 0.8;
        r += this.midR.lp(r, 900, 0.5, sr) * bark * 0.8;
        l = Math.tanh(l * drive) / dn; r = Math.tanh(r * drive) / dn;
      }
      const g = tremMode === 1 ? 1 - tremDepth * 0.5 * (1 + lfo) : 1;
      L[i] += l * g * level;
      R[i] += r * g * level;
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
    this.thumps = this.thumps.filter((k) => k.t < 0.15);
  }
}

// ---------------------------------------------------------------- Pluck: physical modelling

/** Pluck's bodies: strings (Karplus-Strong) first, then bars and drums (modal). */
export const PLUCK_STRINGS = 4;
/** Modal bodies: partial ratios at Wood (0) and at Metal (1); Wood <-> Metal moves between them. */
const MODAL: { wood: number[]; metal: number[] }[] = [
  { wood: [1, 5.9, 16.7, 3, 8, 12], metal: [1, 5.4, 9.2, 13.3, 17.9, 22.1] }, // kalimba
  { wood: [1, 3.93, 9.9, 17.6, 2, 6], metal: [1, 2.76, 5.4, 8.93, 13.34, 4] }, // marimba (metal: glock-like)
  { wood: [1, 2, 3, 3.9, 5.1, 6], metal: [1, 2, 3.01, 4.3, 5.2, 6.6] }, // steel drum
  { wood: [1, 2, 3, 4.2, 5.4, 6.8], metal: [0.5, 1, 1.19, 1.56, 2, 2.66] }, // bell
];

interface PluckVoice {
  pitch: number; held: boolean; age: number; amp: ADSR; vel: number; t: number;
  buf: Float32Array; w: number; len: number; lp: number; ap: number; apX: number; damp: number;
  ph: number[]; pan: number;
}

/**
 * Pluck: plucked and struck things. Strings are Karplus-Strong (a noise burst shaped by the pick,
 * circulating in a tuned delay with a loop filter); bars and drums are a bank of decaying partials.
 * Pick: where and how hard it's plucked (position comb, brightness, noise). Wood <-> Metal: partial
 * ratios harmonic -> inharmonic and highs that ring as long as the lows (strings: dispersion).
 * Damp: a darker loop, shorter strings, and a quick palm-mute on release.
 */
export class PluckDSP implements InstrumentDSP {
  private voices: PluckVoice[] = [];
  private counter = 0;
  private room: Reverb;
  private bl = new Float32Array(128);
  private br = new Float32Array(128);
  private il = new Float32Array(128);
  private ir = new Float32Array(128);
  constructor(public params: Record<string, number>, private sr: number) {
    this.room = new Reverb(sr, 0.8);
  }

  noteOn(pitch: number, vel: number) {
    const p = this.params, sr = this.sr;
    const v = claim(this.voices, 8, pitch, () => ({
      pitch, held: true, age: 0, amp: new ADSR(), vel: 1, t: 0, buf: new Float32Array(4096), w: 0, len: 100, lp: 0, ap: 0, apX: 0, damp: 0,
      ph: [0, 0, 0, 0, 0, 0], pan: 0,
    }), ++this.counter);
    v.vel = vel / 127; v.t = 0; v.damp = 0; v.pan = ((this.counter % 3) - 1) * 0.3;
    v.amp.gate(true);
    const body = Math.round(p.body ?? 0);
    if (body < PLUCK_STRINGS) {
      // Fill the delay with the pluck: noise and a smooth pulse, brightened by Pick, combed at the pick position.
      const f = mtof(pitch) * voiceMod.pitch;
      v.len = Math.max(2, Math.min(4000, sr / f));
      const n = Math.ceil(v.len), pick = p.pick ?? 0.5;
      const pos = Math.max(1, Math.round(n * (0.5 - pick * 0.42)));
      const bright = 0.15 + pick * 0.8;
      let z = 0;
      const tmp = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = noise() * (0.4 + pick * 0.6) + Math.sin(Math.PI * i / n) * (1 - pick * 0.5);
        z += bright * (x - z);
        tmp[i] = z;
      }
      for (let i = 0; i < n; i++) v.buf[i] = (tmp[i] - (i >= pos ? tmp[i - pos] : 0)) * 1.8;
      v.w = n % v.buf.length; v.lp = 0; v.ap = 0; v.apX = 0;
    } else v.ph = v.ph.map(() => Math.random() * 0.1);
  }
  noteOff(pitch: number) {
    for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); v.damp = 1; }
  }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr, n = i1 - i0;
    const body = Math.round(p.body ?? 0), isString = body < PLUCK_STRINGS;
    const pick = p.pick ?? 0.5, metal = p.metal ?? 0.2, damp = p.damp ?? 0.25;
    const decay = (p.decay ?? 2) * (1 - damp * 0.7);
    const level = (p.level ?? 0.6) * 1.0, roomLv = p.room ?? 0.2;
    // Strings: loop brightness per body (guitar, nylon, harp, bass), lowered by Damp; Metal adds dispersion.
    const bodyBright = [0.55, 0.35, 0.6, 0.3][Math.min(3, body)] ?? 0.5;
    const loopK = Math.max(0.05, Math.min(0.98, bodyBright + (p.bright ?? 0) * 0.3 - damp * 0.4));
    const disp = metal * 0.5;
    const rel = 1 - damp * 0.9; // palm-mute: how much of the ring survives a release
    const modal = MODAL[Math.max(0, body - PLUCK_STRINGS)] ?? MODAL[0];
    const ratios = modal.wood.map((w, k) => w + (modal.metal[k] - w) * metal);
    if (this.bl.length < n) { this.bl = new Float32Array(n); this.br = new Float32Array(n); this.il = new Float32Array(n); this.ir = new Float32Array(n); }
    const bl = this.bl, br = this.br;
    bl.fill(0, 0, n); br.fill(0, 0, n);
    // The loop filter and the allpass add delay: take it off the string length so notes stay in tune.
    const loopDelay = (1 - loopK) / loopK + (disp > 0.001 ? (1 + disp) / (1 - disp) : 0);
    for (const v of this.voices) {
      if (!v.amp.active) continue;
      const f = mtof(v.pitch) * voiceMod.pitch;
      if (isString) v.len = Math.max(2, Math.min(4000, sr / f - loopDelay));
      const vg = velGain(v.vel);
      // Feedback for the decay time; damping on release.
      const g = Math.exp(-6.9 / (f * Math.max(0.05, decay)));
      for (let i = 0; i < n; i++) {
        const env = v.amp.next(0.001, 30, 1, 0.08 + rel * decay, sr);
        let x: number;
        if (isString) {
          const size = v.buf.length, d = v.len, rp = v.w - d;
          const i0r = Math.floor(rp), fr = rp - i0r;
          const a = v.buf[(i0r + size) % size], b = v.buf[(i0r + 1 + size) % size];
          const out = a + (b - a) * fr;
          v.lp += loopK * (out - v.lp);
          // A first-order allpass for stiffness (Metal): slightly inharmonic overtones.
          const apOut = -disp * v.lp + v.apX + disp * v.ap;
          v.apX = v.lp; v.ap = apOut;
          const fb = (disp > 0.001 ? apOut : v.lp) * g * (v.damp ? 1 - damp * 0.02 : 1);
          v.buf[v.w] = fb;
          v.w = (v.w + 1) % size;
          x = out;
        } else {
          x = 0;
          for (let k = 0; k < 6; k++) {
            v.ph[k] += (f * ratios[k]) / sr;
            const highs = k / 5, dk = decay * (1 / (1 + k * (1.6 - metal * 1.3)));
            const ak = [1, 0.5, 0.3, 0.2, 0.14, 0.1][k] * (1 - highs * (1 - pick) * 0.8);
            x += Math.sin(TAU * v.ph[k]) * ak * Math.exp((-6.9 * v.t) / dk); // Decay is the time to -60 dB, as for strings
          }
          x += noise() * pick * 0.4 * Math.exp(-v.t / 0.004); // the mallet click
        }
        const y = x * env * vg;
        bl[i] += y * panL(v.pan); br[i] += y * panR(v.pan);
        v.t += 1 / sr;
      }
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
    // Room: only the reverb's own sound is added (it keeps 65% of its input).
    this.il.set(bl.subarray(0, n)); this.ir.set(br.subarray(0, n));
    if (roomLv > 0.01) this.room.process(this.il, this.ir, n, 0.4, 1);
    for (let i = 0; i < n; i++) {
      const wl = roomLv > 0.01 ? (this.il[i] - bl[i] * 0.65) * roomLv * 1.6 : 0, wr = roomLv > 0.01 ? (this.ir[i] - br[i] * 0.65) * roomLv * 1.6 : 0;
      L[i0 + i] += (bl[i] + wl) * level;
      R[i0 + i] += (br[i] + wr) * level;
    }
  }
}

// ---------------------------------------------------------------- Wheelhouse: tonewheel organ

/** Drawbar footages as harmonics of the 8' pitch: 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1'. */
export const DRAWBAR_RATIOS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
const SINE_N = 4096;
const SINE = Float32Array.from({ length: SINE_N + 1 }, (_, i) => Math.sin((TAU * i) / SINE_N));
const sinT = (ph: number) => { const x = (ph - Math.floor(ph)) * SINE_N, i = x | 0; return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i); };

interface OrganVoice { pitch: number; held: boolean; age: number; amp: ADSR; vel: number; t: number; ph: Float64Array; perc: boolean }

/**
 * Wheelhouse: an additive tonewheel organ. Nine drawbars (sines at the classic footages), a key click,
 * single-trigger percussion (2nd or 3rd harmonic), a scanner vibrato / chorus, and a rotating speaker
 * (a horn for the highs with doppler and pan, a drum for the lows) that speeds up and slows down.
 * Drive (the character control): preamp overdrive, a louder horn, more key click.
 */
export class OrganDSP implements InstrumentDSP {
  private voices: OrganVoice[] = [];
  private counter = 0;
  private vibBuf = new Float32Array(1024);
  private vw = 0;
  private vibPh = 0;
  private hornSpd = 0.8;
  private drumSpd = 0.7;
  private hornPh = 0;
  private drumPh = 0;
  private split = new OnePole();
  private hornBuf = new Float32Array(1024);
  private hw = 0;
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    // Percussion is single-trigger: only when no other key is held.
    const perc = !this.voices.some((v) => v.held);
    const v = claim(this.voices, 16, pitch, () => ({ pitch, held: true, age: 0, amp: new ADSR(), vel: 1, t: 0, ph: new Float64Array(10), perc: false }), ++this.counter);
    v.vel = vel / 127; v.t = 0; v.perc = perc;
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    const bars = DRAWBAR_RATIOS.map((_, k) => { const b = p[`db${k}`] ?? 0; return b < 0.5 ? 0 : Math.pow(10, ((b - 8) * 3) / 20); });
    const drive = p.drive ?? 0.25;
    const percMode = Math.round(p.perc ?? 0), percRatio = percMode === 2 ? 3 : 2, percDecay = (p.percFast ?? 1) >= 0.5 ? 0.2 : 1, percLv = percMode ? 0.5 : 0;
    const click = (p.click ?? 0.3) * (1 + drive);
    const leak = (p.leak ?? 0.1) * 0.01;
    const vc = Math.round(p.vibChorus ?? 0); // 0 off, 1-3 vibrato, 4-6 chorus
    const vibDepth = vc ? [0, 0.0007, 0.0013, 0.0022][((vc - 1) % 3) + 1] * sr : 0, chorus = vc >= 4;
    const rot = Math.round(p.rotary ?? 1); // 0 stop, 1 slow, 2 fast
    const hornTarget = rot === 0 ? 0 : rot === 1 ? 0.8 : 6.8, drumTarget = rot === 0 ? 0 : rot === 1 ? 0.7 : 5.9;
    const gain = 1 + drive * 5, dn = Math.tanh(gain);
    const level = (p.level ?? 0.6) * 0.65;
    const hornLv = 0.7 + drive * 0.5;
    for (let i = i0; i < i1; i++) {
      let x = 0;
      for (const v of this.voices) {
        if (!v.amp.active) continue;
        const f = mtof(v.pitch) * voiceMod.pitch;
        const env = v.amp.next(0.004, 0.1, 1, 0.012, sr);
        let s = 0;
        for (let k = 0; k < 9; k++) {
          v.ph[k] += (f * DRAWBAR_RATIOS[k]) / sr;
          if (bars[k] > 0) s += sinT(v.ph[k]) * bars[k];
          else if (leak) s += sinT(v.ph[k]) * leak;
        }
        if (percLv && v.perc) { v.ph[9] += (f * percRatio) / sr; s += sinT(v.ph[9]) * percLv * Math.exp(-v.t / percDecay); }
        if (click > 0.01 && v.t < 0.006) s += noise() * click * 0.5 * (1 - v.t / 0.006);
        x += s * env;
        v.t += 1 / sr;
      }
      x = Math.tanh(x * 0.25 * gain) / dn;
      // Scanner vibrato / chorus: a short delay swept at ~7 Hz (chorus mixes in the dry signal).
      if (vibDepth > 0) {
        this.vibBuf[this.vw] = x;
        this.vibPh = (this.vibPh + 6.9 / sr) % 1;
        const d = 2 + vibDepth * (1 + Math.sin(TAU * this.vibPh)), pos = (this.vw - d + 1024) % 1024, k = Math.floor(pos), fr = pos - k;
        const y = this.vibBuf[k] + (this.vibBuf[(k + 1) % 1024] - this.vibBuf[k]) * fr;
        this.vw = (this.vw + 1) % 1024;
        x = chorus ? (x + y) * 0.6 : y;
      }
      // The rotating speaker: speeds glide (the horn spins up faster than the drum).
      this.hornSpd += (hornTarget - this.hornSpd) * (1 / (0.7 * sr));
      this.drumSpd += (drumTarget - this.drumSpd) * (1 / (2.5 * sr));
      this.hornPh = (this.hornPh + this.hornSpd / sr) % 1;
      this.drumPh = (this.drumPh + this.drumSpd / sr) % 1;
      const lo = this.split.lp(x, 800, sr), hi = x - lo;
      this.hornBuf[this.hw] = hi;
      const hs = Math.sin(TAU * this.hornPh), hd = 8 + 6 * hs, hpos = (this.hw - hd + 1024) % 1024, hk = Math.floor(hpos);
      const horn = (this.hornBuf[hk] + (this.hornBuf[(hk + 1) % 1024] - this.hornBuf[hk]) * (hpos - hk)) * (1 - 0.3 * Math.cos(TAU * this.hornPh)) * hornLv;
      this.hw = (this.hw + 1) % 1024;
      const ds = Math.sin(TAU * this.drumPh), drum = lo * (1 - 0.2 * ds);
      L[i] += (horn * (0.5 + 0.45 * hs) + drum * (0.55 + 0.1 * ds)) * level * 1.4;
      R[i] += (horn * (0.5 - 0.45 * hs) + drum * (0.55 - 0.1 * ds)) * level * 1.4;
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}

// ---------------------------------------------------------------- Anthem: supersaw

interface SawVoice { pitch: number; held: boolean; age: number; amp: ADSR; vel: number; t: number; ph: Float64Array; sub: number; f: SVF[]; from: number }

/**
 * Anthem: the huge festival supersaw, polyphonic. Twist (the character control) sets how many saws
 * (1-9), how far apart they're detuned and spread, with the level compensated so it gets bigger, not
 * louder. Diffuse smears it wider (a short modulated delay per side), Bottom adds a sub an octave
 * down, Shine is its own big reverb. Pump and Repeat come from the shared performer.
 */
export class AnthemDSP implements InstrumentDSP {
  private voices: SawVoice[] = [];
  private counter = 0;
  private last = 60;
  private room: Reverb;
  private bl = new Float32Array(128);
  private br = new Float32Array(128);
  private il = new Float32Array(128);
  private ir = new Float32Array(128);
  private dL = new Float32Array(2048);
  private dR = new Float32Array(2048);
  private dw = 0;
  private dph = 0;
  constructor(public params: Record<string, number>, private sr: number) {
    this.room = new Reverb(sr, 1.8);
  }

  noteOn(pitch: number, vel: number) {
    const v = claim(this.voices, 10, pitch, () => ({
      pitch, held: true, age: 0, amp: new ADSR(), vel: 1, t: 0, ph: Float64Array.from({ length: 9 }, () => Math.random()), sub: 0, f: [new SVF(), new SVF()], from: pitch,
    }), ++this.counter);
    v.vel = vel / 127; v.t = 0; v.from = this.last; this.last = pitch;
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr, n = i1 - i0;
    const twist = p.twist ?? 0.6, diffuse = p.diffuse ?? 0.3, bottom = p.bottom ?? 0.2, shine = p.shine ?? 0.3;
    const count = 1 + Math.round(twist * 8), det = 0.02 + twist * 0.5; // semitones each side at the edge
    const spread = Math.min(1, 0.2 + twist * 0.9), comp = 1 / Math.sqrt(count);
    const a = p.attack ?? 0.01, d = p.decay ?? 0.5, s = p.sustain ?? 0.85, r = p.release ?? 0.35;
    const cut = p.cutoff ?? 9000, fenv = p.fenv ?? 0.2, fdec = p.fdecay ?? 0.4, res = p.reso ?? 0.1;
    const glide = p.glide ?? 0;
    const level = (p.level ?? 0.6) * 1.0;
    if (this.bl.length < n) { this.bl = new Float32Array(n); this.br = new Float32Array(n); this.il = new Float32Array(n); this.ir = new Float32Array(n); }
    const bl = this.bl, br = this.br;
    bl.fill(0, 0, n); br.fill(0, 0, n);
    // Per block: each saw's detune ratio and pan gains (the stack's shape only changes with Twist).
    const ratio = new Float64Array(count), gl = new Float64Array(count), gr = new Float64Array(count);
    for (let k = 0; k < count; k++) {
      const off = count === 1 ? 0 : (k / (count - 1)) * 2 - 1; // -1..1 across the stack
      ratio[k] = Math.pow(2, (off * det * (0.6 + 0.4 * Math.abs(off))) / 12);
      gl[k] = panL(off * spread); gr[k] = panR(off * spread);
    }
    for (const v of this.voices) {
      if (!v.amp.active) continue;
      const gliding = glide > 0.005 && v.from !== v.pitch;
      let f0 = mtof(v.pitch) * voiceMod.pitch;
      for (let i = 0; i < n; i++) {
        if (gliding) f0 = mtof(v.pitch + (v.from - v.pitch) * Math.exp(-v.t / glide)) * voiceMod.pitch;
        const env = v.amp.next(a, d, s, r, sr) * velGain(v.vel);
        let l = 0, rr = 0;
        const inc = f0 / sr;
        for (let k = 0; k < count; k++) {
          let ph = v.ph[k] + inc * ratio[k];
          if (ph >= 1) ph -= 1;
          v.ph[k] = ph;
          const x = 2 * ph - 1 - blep(ph, inc * ratio[k]); // band-limited: no aliasing grit up high
          l += x * gl[k]; rr += x * gr[k];
        }
        v.sub += (f0 * 0.5) / sr; if (v.sub >= 1) v.sub -= 1;
        const sub = Math.sin(TAU * v.sub) * bottom * 1.2;
        const fc = Math.min(sr * 0.45, cut * Math.pow(2, fenv * 5 * Math.exp(-v.t / fdec)));
        bl[i] += (v.f[0].lp(l * comp, fc, res, sr) + sub) * env;
        br[i] += (v.f[1].lp(rr * comp, fc, res, sr) + sub) * env;
        v.t += 1 / sr;
      }
    }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
    // Diffuse: each side through its own slowly-moving short delay, mixed in.
    const len = this.dL.length;
    for (let i = 0; i < n; i++) {
      if (diffuse > 0.01) {
        this.dL[this.dw] = bl[i]; this.dR[this.dw] = br[i];
        this.dph = (this.dph + 0.23 / sr) % 1;
        const tap = (buf: Float32Array, dly: number) => { const pos = (this.dw - dly + len) % len, k = Math.floor(pos); return buf[k] + (buf[(k + 1) % len] - buf[k]) * (pos - k); };
        const m = Math.sin(TAU * this.dph) * 0.002 * sr;
        bl[i] = bl[i] * (1 - diffuse * 0.4) + tap(this.dR, 0.017 * sr + m) * diffuse * 0.7;
        br[i] = br[i] * (1 - diffuse * 0.4) + tap(this.dL, 0.023 * sr - m) * diffuse * 0.7;
        this.dw = (this.dw + 1) % len;
      }
    }
    // Shine: only the reverb's own sound is added.
    this.il.set(bl.subarray(0, n)); this.ir.set(br.subarray(0, n));
    if (shine > 0.01) this.room.process(this.il, this.ir, n, 0.55 + shine * 0.4, 1);
    for (let i = 0; i < n; i++) {
      const wl = shine > 0.01 ? (this.il[i] - bl[i] * 0.65) * shine * 1.4 : 0, wr = shine > 0.01 ? (this.ir[i] - br[i] * 0.65) * shine * 1.4 : 0;
      L[i0 + i] += (bl[i] + wl) * level;
      R[i0 + i] += (br[i] + wr) * level;
    }
  }
}

// ---------------------------------------------------------------- Patchwork: semi-modular mono

/** Patch jacks a cable (MG 1, MG 2, EG) can go to. */
export const PATCH_JACKS = ["Off", "Pitch", "PW", "VCO 2 pitch", "VCO 1 level", "VCO 2 level", "Noise level", "Cutoff", "VCA", "MG 1 rate", "MG 2 rate"];

/**
 * Patchwork: a little patchable mono synth for deep basses. VCO 1 (saw), VCO 2 (pulse), noise, a
 * resonant ladder filter, an AR envelope and two MGs (LFOs). MG 1, MG 2 and the EG each go to one
 * jack with an amount. Drive (the character control): overdrive into the filter, saturation after it,
 * and a low shelf so it gets fatter, not thinner.
 */
export class PatchworkDSP implements InstrumentDSP {
  private held: number[] = [];
  private freq = 110;
  private target = 110;
  private gate = false;
  private eg = 0;
  private velNow = 1;
  private o1 = 0;
  private o2 = 0;
  private mg = [0, 0];
  private sh = [0, 0];
  private filt = new Ladder();
  private low = new OnePole();
  private dc = new OnePole();
  private cut = 800;
  private mod = new Float64Array(11);
  private src = [0, 0, 0];
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    const legato = this.held.length > 0;
    this.held = this.held.filter((p) => p !== pitch);
    this.held.push(pitch);
    this.target = mtof(pitch);
    if (!legato || (this.params.glide ?? 0.02) < 0.005) this.freq = this.target;
    this.velNow = vel / 127;
    this.gate = true;
  }
  noteOff(pitch: number) {
    this.held = this.held.filter((p) => p !== pitch);
    if (this.held.length) this.target = mtof(this.held[this.held.length - 1]);
    else this.gate = false;
  }
  allOff() { this.held = []; this.gate = false; }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr;
    if (!this.gate && this.eg < 1e-5) return;
    const lv1 = p.vco1 ?? 0.8, lv2 = p.vco2 ?? 0.5, lvN = p.noise ?? 0;
    const semi2 = p.vco2Semi ?? 7, det2 = p.vco2Detune ?? 0.08;
    const peak = Math.min(0.96, p.peak ?? 0.4), drive = p.drive ?? 0.3;
    const atk = p.attack ?? 0.005, rel = p.release ?? 0.2;
    const aK = 1 - Math.exp(-1 / (Math.max(0.001, atk) * sr)), rK = 1 - Math.exp(-1 / (Math.max(0.005, rel) * sr));
    const glideK = 1 - Math.exp(-1 / (Math.max(0.001, p.glide ?? 0.02) * sr));
    const routes = [Math.round(p.mg1To ?? 0), Math.round(p.mg2To ?? 0), Math.round(p.egTo ?? 0)];
    const amts = [p.mg1Amt ?? 0.3, p.mg2Amt ?? 0.3, p.egAmt ?? 0.5];
    const shapes = [Math.round(p.mg1Shape ?? 0), Math.round(p.mg2Shape ?? 0)];
    const g = 1 + drive * 5, gn = Math.tanh(g);
    const level = (p.level ?? 0.6) * 0.85;
    for (let i = i0; i < i1; i++) {
      this.freq *= Math.pow(this.target / this.freq, glideK);
      this.eg += ((this.gate ? 1 : 0) - this.eg) * (this.gate ? aK : rK);
      // Modulation sums per jack.
      const mod = this.mod, src = this.src;
      mod.fill(0);
      src[2] = this.eg;
      for (let m = 0; m < 2; m++) {
        let rate = (m === 0 ? p.mg1Rate ?? 4 : p.mg2Rate ?? 0.5);
        const rj = m === 0 ? 9 : 10;
        for (let c = 0; c < 3; c++) if (routes[c] === rj && c !== m) rate *= Math.pow(2, amts[c] * 3 * (c === 2 ? this.eg : this.mgVal(c)));
        const prev = this.mg[m];
        this.mg[m] = (this.mg[m] + rate / sr) % 1;
        if (this.mg[m] < prev) this.sh[m] = Math.random() * 2 - 1;
        src[m] = this.mgVal(m, shapes[m]);
      }
      for (let c = 0; c < 3; c++) if (routes[c]) mod[routes[c]] += amts[c] * src[c];
      const f0 = this.freq * voiceMod.pitch * Math.pow(2, mod[1]);
      const f2 = f0 * Math.pow(2, (semi2 + det2 + mod[3] * 12) / 12);
      const pw = Math.max(0.05, Math.min(0.95, 0.5 + mod[2] * 0.45));
      const d1 = f0 / sr, d2 = f2 / sr;
      this.o1 = (this.o1 + d1) % 1; this.o2 = (this.o2 + d2) % 1;
      const s1 = 2 * this.o1 - 1 - blep(this.o1, d1);
      const s2 = (this.o2 < pw ? 1 : -1) + blep(this.o2, d2) - blep((this.o2 + 1 - pw) % 1, d2);
      const clamp = (x: number) => Math.max(0, Math.min(1, x));
      let x = s1 * clamp(lv1 + mod[4]) + s2 * clamp(lv2 + mod[5]) * 0.8 + noise() * clamp(lvN + mod[6]) * 0.7;
      x = Math.tanh(x * g * 0.6) / gn; // Drive into the filter
      this.cut = smooth(this.cut, p.cutoff ?? 800, 0.002);
      const fc = Math.min(sr * 0.42, this.cut * Math.pow(2, mod[7] * 5));
      let y = this.filt.process(x, fc, peak, sr) * (1 + peak * 1.5);
      y = Math.tanh(y * (1 + drive * 1.5));
      y += this.low.lp(y, 120, sr) * drive * 0.8; // Drive's low shelf
      const vca = this.eg * Math.max(0, 1 + mod[8] * 0.8) * velGain(this.velNow);
      y = this.dc.hp(y, 20, sr) * vca * level;
      L[i] += y; R[i] += y;
    }
  }

  /** An MG's current value, -1..1: triangle, saw, square or sample-and-hold. */
  private mgVal(m: number, shape = Math.round(this.params[m === 0 ? "mg1Shape" : "mg2Shape"] ?? 0)): number {
    const ph = this.mg[m] ?? 0;
    switch (shape) {
      case 1: return 1 - 2 * ph;
      case 2: return ph < 0.5 ? 1 : -1;
      case 3: return this.sh[m] ?? 0;
      default: return 1 - 4 * Math.abs(ph - 0.5);
    }
  }
}

// ---------------------------------------------------------------- Vox: formant synth

/** Vowels on the pad: x = back (u, o) to front (i, e), y = closed (u, i) to open (a). Formants F1-F3 in Hz. */
const VOX_VOWELS: { x: number; y: number; f: [number, number, number] }[] = [
  { x: 0, y: 0, f: [325, 700, 2530] }, // u
  { x: 1, y: 0, f: [270, 2300, 3000] }, // i
  { x: 0, y: 0.6, f: [450, 800, 2830] }, // o
  { x: 1, y: 0.6, f: [400, 2000, 2550] }, // e
  { x: 0.5, y: 1, f: [800, 1150, 2900] }, // a
];
/** The formants at a pad position: an inverse-distance blend of the five vowels. */
export function vowelFormants(x: number, y: number): [number, number, number] {
  let w = 0;
  const out: [number, number, number] = [0, 0, 0];
  for (const v of VOX_VOWELS) {
    const d = (v.x - x) ** 2 + (v.y - y) ** 2, k = 1 / (d * d + 1e-4);
    w += k;
    for (let n = 0; n < 3; n++) out[n] += v.f[n] * k;
  }
  return out.map((f) => f / w) as [number, number, number];
}

interface VoxVoice {
  pitch: number; held: boolean; age: number; amp: ADSR; vel: number; t: number;
  ph: Float64Array; vib: Float64Array; vibRate: Float64Array; lo: number[]; bd: number[];
}

/**
 * Vox: voices without singers. Each note is a few glottal pulses (Choir: 1-5, detuned, each with its own
 * vibrato) plus breath noise, through three formant band-passes set by the vowel pad. Throat (the
 * character control): the formants slide from child to giant, the pulse gets rounder or buzzier, and a
 * low resonance grows. A hidden vowel LFO makes basses talk.
 */
export class VoxDSP implements InstrumentDSP {
  private voices: VoxVoice[] = [];
  private counter = 0;
  private vlfo = 0;
  private low = new SVF();
  /** The glottal pulse shape for the current Throat, as a table (rebuilt only when Throat moves). */
  private pulse = new Float32Array(1025);
  private pulseBuzz = -1;
  constructor(public params: Record<string, number>, private sr: number) {}

  noteOn(pitch: number, vel: number) {
    const v = claim(this.voices, 8, pitch, () => ({
      pitch, held: true, age: 0, amp: new ADSR(), vel: 1, t: 0,
      ph: Float64Array.from({ length: 5 }, () => Math.random()), vib: Float64Array.from({ length: 5 }, () => Math.random()),
      vibRate: Float64Array.from({ length: 5 }, () => 4.5 + Math.random() * 1.8), lo: [0, 0, 0], bd: [0, 0, 0],
    }), ++this.counter);
    v.vel = vel / 127; v.t = 0;
    v.amp.gate(true);
  }
  noteOff(pitch: number) { for (const v of this.voices) if (v.pitch === pitch && v.held) { v.held = false; v.amp.gate(false); } }
  allOff() { for (const v of this.voices) { v.held = false; v.amp.gate(false); } }

  render(L: Float32Array, R: Float32Array, i0: number, i1: number) {
    const p = this.params, sr = this.sr, n = i1 - i0;
    const throat = p.throat ?? 0.5, breath = p.breath ?? 0.15, choir = Math.max(1, Math.min(5, Math.round(p.choir ?? 1)));
    const a = p.attack ?? 0.05, r = p.release ?? 0.4;
    const vibDepth = (p.vibrato ?? 0.3) * 0.006;
    const lfoAmt = p.vowelLfo ?? 0, lfoRate = p.vowelRate ?? 2;
    this.vlfo = (this.vlfo + (lfoRate * n) / sr) % 1;
    const sway = Math.sin(TAU * this.vlfo) * lfoAmt;
    const x = Math.max(0, Math.min(1, (p.vowelX ?? 0.5) + sway * 0.5)), y = Math.max(0, Math.min(1, (p.vowelY ?? 0.8) - Math.abs(sway) * 0.4));
    const shift = Math.pow(2, (0.5 - throat) * 1.1);
    const F = vowelFormants(x, y).map((f) => Math.min(sr * 0.4, f * shift));
    const fk = F.map((f) => 2 * Math.sin((Math.PI * f) / sr)), damp = [0.12, 0.09, 0.08], gains = [1, 0.55, 0.3];
    const buzz = 1 + throat * 3; // rounder (low throat) to buzzier pulses
    if (buzz !== this.pulseBuzz) {
      this.pulseBuzz = buzz;
      for (let k = 0; k <= 1024; k++) this.pulse[k] = Math.pow(1 - k / 1024, buzz) - 1 / (buzz + 1);
    }
    const pulse = this.pulse;
    const level = (p.level ?? 0.6) * 1.1 / Math.sqrt(choir);
    for (const v of this.voices) {
      if (!v.amp.active) continue;
      const f0 = mtof(v.pitch) * voiceMod.pitch;
      for (let i = 0; i < n; i++) {
        const env = v.amp.next(a, 0.3, 1, r, sr) * velGain(v.vel);
        let src = 0;
        for (let c = 0; c < choir; c++) {
          v.vib[c] = (v.vib[c] + v.vibRate[c] / sr) % 1;
          const det = choir === 1 ? 0 : ((c / (choir - 1)) * 2 - 1) * 0.008;
          const fc = f0 * (1 + det + Math.sin(TAU * v.vib[c]) * vibDepth * Math.min(1, v.t / 0.35));
          v.ph[c] = (v.ph[c] + fc / sr) % 1;
          // A glottal pulse: a falling ramp raised to a power (higher = sharper, buzzier).
          const xi = v.ph[c] * 1024, ki = xi | 0;
          src += pulse[ki] + (pulse[ki + 1] - pulse[ki]) * (xi - ki);
        }
        src = src * 1.6 + noise() * breath * 0.9;
        let y3 = 0;
        for (let k = 0; k < 3; k++) { // Chamberlin band-pass per formant
          v.lo[k] += fk[k] * v.bd[k];
          const hi = src - v.lo[k] - damp[k] * 2 * v.bd[k];
          v.bd[k] += fk[k] * hi;
          y3 += v.bd[k] * gains[k] * damp[k] * 2;
        }
        // The body: the fundamental itself, so low (talking bass) notes carry; more with a bigger throat.
        y3 += Math.sin(TAU * v.ph[0]) * (0.1 + throat * 0.5) * Math.min(1, 300 / f0);
        const out = y3 * env * level;
        L[i0 + i] += out; R[i0 + i] += out;
        v.t += 1 / sr;
      }
    }
    // Throat's low resonance (a gentle boost around 200 Hz).
    if (throat > 0.55) for (let i = i0; i < i1; i++) { const b = this.low.lp(L[i], 220, 0.6, sr) * (throat - 0.55) * 1.2; L[i] += b; R[i] += b; }
    this.voices = this.voices.filter((v) => v.amp.active || v.held);
  }
}
