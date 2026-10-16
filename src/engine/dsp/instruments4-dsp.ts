// DSP for the Phase 4 instruments (new ones). Runs in the AudioWorklet.

import { ADSR, OnePole, SVF, TAU, mtof, voiceMod } from "./units";
import { velGain, type InstrumentDSP } from "./instruments-dsp";
import { claim } from "./instruments3-dsp";

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
