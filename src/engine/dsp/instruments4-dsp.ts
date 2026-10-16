// DSP for the Phase 4 instruments (new ones). Runs in the AudioWorklet.

import { ADSR, OnePole, SVF, TAU, mtof, voiceMod } from "./units";
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
