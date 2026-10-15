// The shared voice toolkit in the worklet: a layer around a synth's own DSP.
//  - Before each block it writes the synth's working params (the base values, with LFOs, the
//    velocity-to-filter amount and the like applied), and sets voiceMod.pitch / .pw, which the
//    synths read for pitch (LFO, pitch envelope, glide) and pulse width.
//  - Notes pass through it: velocity sensitivity, voice mode (mono / legato with glide),
//    unison, and the envelopes / LFO key sync they start.
//  - After the synth renders, it runs the extra filter (with its own ADSR and key tracking),
//    LFO amp / pan, and on leads Pump and Repeat.
// Anything switched off costs nothing: each stage checks first.

import { DEST, LEAD_KINDS, LFO_SYNC_BEATS, POLY_KINDS, REPEAT_BEATS, TONE_PARAM } from "../toolkit";
import { fromUnit, paramDef, toUnit, type ParamDef } from "../instruments";
import type { InstrumentKind } from "../model";
import type { Clock, InstrumentDSP } from "./instruments-dsp";
import { ADSR, TAU, voiceMod } from "./units";

/** A state-variable filter that gives every response from one set of states (Cytomic / Simper form). */
class Multi {
  private ic1 = 0;
  private ic2 = 0;
  /** mode 1 LP, 3 HP, 4 BP, 5 notch (LP24 = two LP stages). a1..a3 and k are shared per sample. */
  run(x: number, a1: number, a2: number, a3: number, k: number, mode: number): number {
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (mode === 3) return x - k * v1 - v2;
    if (mode === 4) return v1 * k;
    if (mode === 5) return x - k * v1;
    return v2;
  }
}

class Lfo {
  ph = Math.random();
  sh = 0;
  private cycle = 0;
  /** Value -1..1 at time t; `noteT` is the last note-on (key sync for a synced LFO). */
  value(shape: number, rate: number, syncIdx: number, key: boolean, t: number, dt: number, noteT: number, clock: Clock): number {
    const beats = LFO_SYNC_BEATS[syncIdx] ?? 0;
    let wrapped = false;
    if (beats > 0) {
      const pos = Math.max(0, ((t - (key ? noteT : clock.zero)) * clock.bpm) / 60 / beats);
      const c = Math.floor(pos);
      wrapped = c !== this.cycle;
      this.cycle = c;
      this.ph = pos - c;
    } else {
      this.ph += rate * dt;
      if (this.ph >= 1) { this.ph -= Math.floor(this.ph); wrapped = true; }
    }
    if (shape === 4 && wrapped) this.sh = Math.random() * 2 - 1; // sample and hold: a new value each cycle
    const p = this.ph;
    switch (shape) {
      case 1: return 1 - 4 * Math.abs(p - 0.5);
      case 2: return 2 * p - 1;
      case 3: return p < 0.5 ? 1 : -1;
      case 4: return this.sh;
      default: return Math.sin(TAU * p);
    }
  }
}

export class Toolkit {
  /** The synth reads these: the base params with this block's modulation applied. */
  readonly eff: Record<string, number> = {};
  private poly: boolean;
  private lead: boolean;
  private tone?: ParamDef;
  private cutoffDef?: ParamDef;
  // notes
  private held: number[] = [];
  private unisonOf = new Map<number, number[]>();
  private monoBase: number | null = null;
  private offset = 0; // mono / legato: semitones from monoBase, gliding toward `offsetTarget`
  private offsetTarget = 0;
  private lastPitch = 60;
  private lastVel = 0.8;
  private noteT = -1e9;
  // modulation state
  private lfo1 = new Lfo();
  private lfo2 = new Lfo();
  private penv = 0;
  private fenv = new ADSR();
  private fL = new Multi(); private fR = new Multi(); private fL2 = new Multi(); private fR2 = new Multi();
  private filtOct = 0;
  private ampMul = 1; private ampNow = 1;
  private panOff = 0; private panNow = 0;
  // repeat
  private repL = new Float32Array(1); private repR = new Float32Array(1);

  constructor(kind: InstrumentKind, public base: Record<string, number>, private sr: number, private clock: Clock, private dsp: InstrumentDSP) {
    this.poly = POLY_KINDS.includes(kind);
    this.lead = LEAD_KINDS.includes(kind);
    const t = TONE_PARAM[kind];
    this.tone = t ? paramDef(kind, t.id) : undefined;
    this.cutoffDef = paramDef(kind, "cutoff");
    Object.assign(this.eff, base);
    dsp.params = this.eff;
  }

  private num(id: string, def: number) { const v = this.base[id]; return v === undefined ? def : v; }

  // ------------------------------------------------------------ notes

  noteOn(pitch: number, vel: number, t: number) {
    const va = this.num("tk:velAmp", 1);
    vel = va >= 0.999 ? vel : Math.round(127 * (1 - va) + vel * va);
    this.lastPitch = pitch;
    this.lastVel = vel / 127;
    this.noteT = t;
    if (this.num("tk:pAmt", 0) !== 0) this.penv = 1;
    if (this.num("tk:fType", 0) > 0) this.fenv.gate(true);
    if (this.num("tk:l1Key", 0) >= 0.5) this.lfo1.ph = 0;
    if (this.num("tk:l2Key", 0) >= 0.5) this.lfo2.ph = 0;
    const mode = this.poly ? Math.round(this.num("tk:mode", 0)) : 0;
    this.held = this.held.filter((p) => p !== pitch);
    if (mode === 0) { this.held.push(pitch); this.on(pitch, vel, t); return; }
    const glide = this.num("tk:glide", 0) > 0.001;
    this.held.push(pitch);
    if (this.monoBase === null) { this.monoBase = pitch; this.offset = this.offsetTarget = 0; this.on(pitch, vel, t); return; }
    const from = this.monoBase + this.offset;
    if (mode === 1) {
      // Mono: a new note retriggers; with glide it slides in from the note that was sounding.
      this.off(this.monoBase, t);
      this.monoBase = pitch;
      this.offset = glide ? from - pitch : 0;
      this.offsetTarget = 0;
      this.on(pitch, vel, t);
    } else {
      // Legato: no retrigger; the sounding voice moves to the new pitch (gliding when Glide is up).
      this.offsetTarget = pitch - this.monoBase;
      if (!glide) this.offset = this.offsetTarget;
    }
  }

  noteOff(pitch: number, t: number) {
    const mode = this.poly ? Math.round(this.num("tk:mode", 0)) : 0;
    const wasTop = this.held[this.held.length - 1] === pitch;
    this.held = this.held.filter((p) => p !== pitch);
    if (!this.held.length && this.num("tk:fType", 0) > 0) this.fenv.gate(false);
    if (mode === 0) { this.off(pitch, t); return; }
    if (this.monoBase === null || !wasTop) return;
    const glide = this.num("tk:glide", 0) > 0.001;
    if (!this.held.length) { this.off(this.monoBase, t); this.monoBase = null; this.offset = this.offsetTarget = 0; return; }
    const back = this.held[this.held.length - 1];
    if (mode === 1) {
      const from = this.monoBase + this.offset;
      this.off(this.monoBase, t);
      this.monoBase = back;
      this.offset = glide ? from - back : 0;
      this.offsetTarget = 0;
      this.on(back, Math.round(this.lastVel * 127), t);
    } else {
      this.offsetTarget = back - this.monoBase;
      if (!glide) this.offset = this.offsetTarget;
    }
  }

  allOff() {
    this.held = [];
    this.unisonOf.clear();
    this.monoBase = null;
    this.offset = this.offsetTarget = 0;
    this.fenv.gate(false);
    this.dsp.allOff();
  }

  /** Unison: the note as 1-4 slightly detuned voices of the synth. */
  private on(pitch: number, vel: number, t: number) {
    const n = this.poly ? Math.max(1, Math.min(4, Math.round(this.num("tk:uni", 1)))) : 1;
    if (n === 1) { this.unisonOf.delete(pitch); this.dsp.noteOn(pitch, vel, t); return; }
    const det = this.num("tk:uniDet", 0.3) * 0.3; // up to 30 cents each side
    const list: number[] = [];
    for (let k = 0; k < n; k++) list.push(pitch + ((k / (n - 1)) * 2 - 1) * det);
    this.unisonOf.set(pitch, list);
    // Stacked voices add up: each plays softer, so the stack is about as loud as one note (gain ~ vel^1.7).
    const v = Math.max(1, Math.round(vel * Math.pow(n, -1 / 3.4)));
    for (const p of list) this.dsp.noteOn(p, v, t);
  }
  private off(pitch: number, t: number) {
    const list = this.unisonOf.get(pitch);
    this.unisonOf.delete(pitch);
    for (const p of list ?? [pitch]) this.dsp.noteOff(p, t);
  }

  // ------------------------------------------------------------ per block

  render(L: Float32Array, R: Float32Array, i0: number, i1: number, t0: number) {
    this.prepare(t0 + i0 / this.sr, (i1 - i0) / this.sr);
    this.dsp.render(L, R, i0, i1, t0);
    voiceMod.pitch = 1;
    voiceMod.pw = 0.5;
    this.post(L, R, i0, i1, t0);
  }

  private prepare(t: number, dt: number) {
    const b = this.base, eff = this.eff;
    Object.assign(eff, b);
    let semis = 0, filtOct = 0, ampMul = 1, panOff = 0, toneOff = 0;
    let pw = this.num("tk:pw", 0.5);
    for (const n of [1, 2] as const) {
      const dest = Math.round(this.num(`tk:l${n}Dest`, 0)), amt0 = this.num(`tk:l${n}Amt`, 0);
      if (!dest || !amt0) continue;
      const delay = this.num(`tk:l${n}Delay`, 0);
      const amt = delay > 0 ? amt0 * Math.min(1, Math.max(0, (t - this.noteT) / delay)) : amt0;
      const v = (n === 1 ? this.lfo1 : this.lfo2).value(Math.round(this.num(`tk:l${n}Shape`, 0)), this.num(`tk:l${n}Rate`, 2),
        Math.round(this.num(`tk:l${n}Sync`, 0)), this.num(`tk:l${n}Key`, 0) >= 0.5, t, dt, this.noteT, this.clock);
      switch (dest) {
        case DEST.pitch: semis += v * amt * 12; break;
        case DEST.filter: filtOct += v * amt * 4; break;
        case DEST.amp: ampMul *= 1 - Math.abs(amt) * (0.5 - 0.5 * v * Math.sign(amt)); break;
        case DEST.pan: panOff += v * amt; break;
        case DEST.pw: pw += v * amt * 0.45; break;
        case DEST.tone: toneOff += v * amt * 0.5; break;
      }
    }
    // Pitch envelope, and mono / legato glide.
    const pAmt = this.num("tk:pAmt", 0);
    if (pAmt !== 0 && this.penv > 1e-4) { semis += pAmt * this.penv; this.penv *= Math.exp((-4.6 * dt) / this.num("tk:pDec", 0.08)); }
    if (this.offset !== this.offsetTarget) {
      const g = this.num("tk:glide", 0);
      this.offset = g > 0.001 ? this.offsetTarget + (this.offset - this.offsetTarget) * Math.exp((-4.6 * dt) / g) : this.offsetTarget;
      if (Math.abs(this.offset - this.offsetTarget) < 1e-3) this.offset = this.offsetTarget;
    }
    semis += this.offset;
    const vf = this.num("tk:velFilt", 0);
    if (vf) filtOct += (this.lastVel * 2 - 1) * vf * 3;
    voiceMod.pitch = semis ? Math.pow(2, semis / 12) : 1;
    voiceMod.pw = Math.max(0.05, Math.min(0.95, pw));
    // Filter modulation goes to the extra filter when it's on, otherwise to the synth's own cutoff.
    this.filtOct = filtOct;
    if (filtOct && this.num("tk:fType", 0) === 0 && this.cutoffDef) {
      const d = this.cutoffDef, oct = Math.log2(d.max / d.min);
      eff.cutoff = fromUnit(d, toUnit(d, b.cutoff ?? d.def) + filtOct / oct);
    }
    if (toneOff && this.tone) { const d = this.tone; eff[d.id] = fromUnit(d, toUnit(d, b[d.id] ?? d.def) + toneOff); }
    this.ampMul = ampMul;
    this.panOff = panOff;
  }

  private post(L: Float32Array, R: Float32Array, i0: number, i1: number, t0: number) {
    const sr = this.sr;
    // The extra filter, with its own envelope and key tracking.
    const ft = Math.round(this.num("tk:fType", 0));
    if (ft > 0) {
      const cut = this.num("tk:fCut", 3000), res = this.num("tk:fRes", 0.2), envAmt = this.num("tk:fEnv", 0) * 6;
      const track = this.num("tk:fTrack", 0.5) * (this.lastPitch - 60) / 12;
      const A = this.num("tk:fA", 0.005), D = this.num("tk:fD", 0.3), S = this.num("tk:fS", 0.4), Rl = this.num("tk:fR", 0.3);
      const k = 2 - 2 * res, mode = ft === 2 ? 1 : ft;
      for (let i = i0; i < i1; i++) {
        const env = envAmt ? this.fenv.next(A, D, S, Rl, sr) : 0;
        const fc = Math.max(20, Math.min(sr * 0.45, cut * Math.pow(2, env * envAmt + this.filtOct + track)));
        const g = Math.tan((Math.PI * fc) / sr), a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
        let l = this.fL.run(L[i], a1, a2, a3, k, mode), r = this.fR.run(R[i], a1, a2, a3, k, mode);
        if (ft === 2) { l = this.fL2.run(l, a1, a2, a3, 1.4, 1); r = this.fR2.run(r, a1, a2, a3, 1.4, 1); }
        L[i] = l; R[i] = r;
      }
    }
    // LFO to amp / pan (smoothed so block steps never click).
    if (this.ampMul !== 1 || this.ampNow !== 1 || this.panOff || this.panNow) {
      for (let i = i0; i < i1; i++) {
        this.ampNow += (this.ampMul - this.ampNow) * 0.01;
        this.panNow += (Math.max(-1, Math.min(1, this.panOff)) - this.panNow) * 0.01;
        const a = ((this.panNow + 1) * Math.PI) / 4;
        const l = L[i] * this.ampNow, r = R[i] * this.ampNow;
        L[i] = (this.panNow ? l * Math.cos(a) * 1.414 : l);
        R[i] = (this.panNow ? r * Math.sin(a) * 1.414 : r);
      }
      if (Math.abs(this.ampNow - 1) < 1e-4 && this.ampMul === 1) this.ampNow = 1;
      if (Math.abs(this.panNow) < 1e-4 && !this.panOff) this.panNow = 0;
    }
    if (!this.lead) return;
    const bps = this.clock.bpm / 60;
    // Repeat: each beat's first slice (1/8, 1/16, 1/32) plays again through the rest of the beat.
    const rep = this.num("tk:repeat", 0);
    if (rep > 0) {
      const div = REPEAT_BEATS[Math.round(this.num("tk:repDiv", 1))] ?? 0.25;
      const sliceLen = Math.max(1, Math.round((div / bps) * sr));
      if (this.repL.length < sliceLen) { this.repL = new Float32Array(sliceLen); this.repR = new Float32Array(sliceLen); }
      const perBeat = Math.max(1, Math.round(1 / div));
      for (let i = i0; i < i1; i++) {
        let pos = (t0 + i / sr - this.clock.zero) * bps / div;
        if (pos < 0) pos = 0;
        const slice = Math.floor(pos), at = Math.min(sliceLen - 1, Math.floor((pos - slice) * sliceLen));
        if (slice % perBeat === 0) { this.repL[at] = L[i]; this.repR[at] = R[i]; continue; }
        L[i] = L[i] * (1 - rep) + this.repL[at] * rep;
        R[i] = R[i] * (1 - rep) + this.repR[at] * rep;
      }
    }
    // Pump: ducks on every beat and swells back, like a sidechained compressor.
    const pump = this.num("tk:pump", 0);
    if (pump > 0) {
      for (let i = i0; i < i1; i++) {
        let ph = ((t0 + i / sr - this.clock.zero) * bps) % 1;
        if (ph < 0) ph += 1;
        const g = 1 - pump * 0.9 * Math.pow(1 - ph, 2.5);
        L[i] *= g; R[i] *= g;
      }
    }
  }
}
