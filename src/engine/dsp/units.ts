// Small DSP building blocks. Runs inside the AudioWorklet (no DOM, no allocation per sample).

export const TAU = Math.PI * 2;

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** PolyBLEP residual for band-limited saw/square. */
export function blep(t: number, dt: number): number {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/**
 * Set by the voice toolkit around each synth's render: a pitch multiplier (its LFO, pitch
 * envelope, glide) and the pulse width square waves use. 1 and 0.5 when nothing is on.
 */
export const voiceMod = { pitch: 1, pw: 0.5 };

/** Band-limited oscillator. wave: 0 saw, 1 square (pulse width from voiceMod.pw), 2 triangle, 3 sine. */
export class Osc {
  phase = Math.random();
  private tri = 0;
  next(freq: number, sr: number, wave: number): number {
    const dt = Math.min(0.5, freq / sr);
    const t = this.phase;
    let y: number;
    switch (wave) {
      case 0: y = 2 * t - 1 - blep(t, dt); break;
      case 1: {
        const pw = voiceMod.pw;
        y = (t < pw ? 1 : -1) + blep(t, dt) - blep((t + 1 - pw) % 1, dt);
        if (pw !== 0.5) y -= 2 * pw - 1; // keep a narrow pulse centred (no DC)
        break;
      }
      case 2: {
        let sq = t < 0.5 ? 1 : -1;
        sq += blep(t, dt);
        sq -= blep((t + 0.5) % 1, dt);
        // Leaky-integrated square = band-limited triangle.
        this.tri = dt * 4 * sq + (1 - dt * 0.05) * this.tri;
        y = this.tri;
        break;
      }
      default: y = Math.sin(TAU * t);
    }
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    return y;
  }
}

/** Zero-delay-feedback state variable filter (lowpass output). */
export class SVF {
  private ic1 = 0;
  private ic2 = 0;
  lp(x: number, cutoff: number, res: number, sr: number): number {
    const g = Math.tan(Math.PI * Math.min(cutoff, sr * 0.45) / sr);
    const k = 2 - 1.98 * res; // res 0..1
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }
  reset() { this.ic1 = this.ic2 = 0; }
}

/** 4-pole resonant ladder with a saturating input: the acid bass's filter. */
export class Ladder {
  private s = [0, 0, 0, 0];
  private i = [0, 0, 0, 0];
  process(x: number, cutoff: number, res: number, sr: number): number {
    const f = Math.min(0.99, (cutoff / (sr * 0.5)) * 1.16);
    const fb = res * 4.0 * (1 - 0.15 * f * f);
    let input = Math.tanh(x - this.s[3] * fb);
    input *= 0.35013 * (f * f) * (f * f);
    const s = this.s, i = this.i;
    s[0] = input + 0.3 * i[0] + (1 - f) * s[0]; i[0] = input;
    s[1] = s[0] + 0.3 * i[1] + (1 - f) * s[1]; i[1] = s[0];
    s[2] = s[1] + 0.3 * i[2] + (1 - f) * s[2]; i[2] = s[1];
    s[3] = s[2] + 0.3 * i[3] + (1 - f) * s[3]; i[3] = s[2];
    return s[3];
  }
  reset() { this.s.fill(0); this.i.fill(0); }
}

/** One-pole filter: lp() and hp(). */
export class OnePole {
  private z = 0;
  lp(x: number, cutoff: number, sr: number): number {
    const a = 1 - Math.exp((-TAU * cutoff) / sr);
    this.z += a * (x - this.z);
    return this.z;
  }
  hp(x: number, cutoff: number, sr: number): number {
    return x - this.lp(x, cutoff, sr);
  }
}

/** ADSR with exponential-ish segments. Times in seconds. */
export class ADSR {
  value = 0;
  stage: 0 | 1 | 2 | 3 | 4 = 0; // idle, attack, decay, sustain, release
  gate(on: boolean) {
    if (on) { this.fast = false; this.stage = 1; }
    else if (this.stage !== 0) this.stage = 4;
  }
  /** Force a quick fade (voice steal / choke). */
  kill() { this.stage = 4; this.fast = true; }
  private fast = false;
  next(a: number, d: number, s: number, r: number, sr: number): number {
    switch (this.stage) {
      case 1:
        this.value += 1 / Math.max(1, a * sr);
        if (this.value >= 1) { this.value = 1; this.stage = 2; }
        break;
      case 2:
        this.value += (s - this.value) * (1 - Math.exp(-4.6 / Math.max(1, d * sr)));
        if (Math.abs(this.value - s) < 1e-4) this.stage = 3;
        break;
      case 3:
        this.value = s;
        break;
      case 4: {
        const rt = this.fast ? 0.004 : r;
        this.value *= Math.exp(-6.9 / Math.max(1, rt * sr));
        if (this.value < 1e-4) { this.value = 0; this.stage = 0; this.fast = false; }
        break;
      }
    }
    return this.value;
  }
  get active() { return this.stage !== 0; }
}

/** Exponential smoothing for parameter changes (avoids zipper noise). */
export function smooth(cur: number, target: number, coef: number): number {
  return cur + (target - cur) * coef;
}
