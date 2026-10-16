// Renders Grab's built-in sound effects to public/sfx/*.wav.
// Every sound is synthesised here, so they're ours and CC0.
// Run: deno run -A tools/make-sfx.ts

const SR = 32000;
const OUT = new URL("../public/sfx/", import.meta.url);
let seed = 777;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
const TAU = Math.PI * 2;

function render(seconds: number, gen: (t: number, i: number) => number): Float32Array {
  const n = Math.round(seconds * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = gen(i / SR, i);
  return out;
}

/** One-pole low-pass with a cutoff that may change per sample. */
function lp() { let z = 0; return (x: number, f: number) => (z += (1 - Math.exp((-TAU * f) / SR)) * (x - z)); }
function hp() { const l = lp(); return (x: number, f: number) => x - l(x, f); }
const saw = (ph: number) => 2 * (ph % 1) - 1;
const sq = (ph: number) => (ph % 1 < 0.5 ? 1 : -1);

/** RBJ band-pass (constant peak) with fixed frequency: returns a per-sample filter. */
function bp(f: number, q: number) {
  const w = (TAU * f) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number) => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

/** Vowel formants (F1, F2, F3) for the vocal chops. */
const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1150, 2900], o: [450, 800, 2830], e: [400, 2000, 2550], i: [270, 2300, 3000], u: [325, 700, 2530],
};
/** A sung vowel (or a glide between two): a buzzy source through three formant band-passes. */
function vox(len: number, f0: number, from: string, to = from, opts: { glide?: number; vib?: number; breath?: number; pitchTo?: number } = {}): Float32Array {
  const A = VOWELS[from], B = VOWELS[to];
  let ph = 0;
  const res = [0, 1, 2].map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  return render(len, (t) => {
    const k = Math.min(1, t / (opts.glide ?? len));
    const f = (opts.pitchTo ? f0 * Math.pow(opts.pitchTo / f0, t / len) : f0) * (1 + (opts.vib ?? 0.01) * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.3));
    ph += f / SR;
    const src = saw(ph) * 0.6 + sq(ph * 2) * 0.1 + noise() * (opts.breath ?? 0.05);
    let y = 0;
    for (let n = 0; n < 3; n++) {
      const fc = A[n] + (B[n] - A[n]) * k, q = [6, 9, 11][n], g = [1, 0.6, 0.35][n];
      const w = (TAU * fc) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
      const r = res[n];
      const out = (al / a0) * src - (al / a0) * r.x2 - ((-2 * c) / a0) * r.y1 - ((1 - al) / a0) * r.y2;
      r.x2 = r.x1; r.x1 = src; r.y2 = r.y1; r.y1 = out;
      y += out * g;
    }
    return y * 3 * Math.min(1, t / 0.03) * (t > len - 0.12 ? Math.max(0, (len - t) / 0.12) : 1);
  });
}

/** A chord stab: the notes through a decaying low-pass; `wave` picks saw / square / organ. */
function stab(len: number, freqs: number[], opts: { wave?: "saw" | "sq" | "organ"; cut?: number; decay?: number; detune?: number; drop?: number } = {}): Float32Array {
  const f1 = lp(); const ph = freqs.flatMap(() => [Math.random(), Math.random()]);
  return render(len, (t) => {
    const bend = opts.drop ? Math.pow(2, (-opts.drop * Math.min(1, t / 0.25)) / 12) : 1;
    let x = 0;
    freqs.forEach((f, k) => {
      for (let d = 0; d < 2; d++) {
        const fd = f * bend * (1 + (d ? 1 : -1) * (opts.detune ?? 0.004));
        ph[k * 2 + d] += fd / SR;
        const p = ph[k * 2 + d];
        x += opts.wave === "sq" ? sq(p) * 0.6 : opts.wave === "organ" ? Math.sin(TAU * p) + Math.sin(TAU * p * 2) * 0.5 + Math.sin(TAU * p * 4) * 0.25 : saw(p);
      }
    });
    x /= freqs.length * 2;
    return f1(x, (opts.cut ?? 600) + 6000 * Math.exp(-t / 0.1)) * Math.exp(-t / (opts.decay ?? 0.25)) * Math.min(1, t / 0.004) * 1.8;
  });
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const chord = (root: number, iv: number[]) => iv.map((x) => mtof(root + x));

/** A struck membrane: a pitched sine with a drop, plus a little noise. */
function drum(len: number, f: number, drop: number, decay: number, nz = 0.2, nzF = 2000): Float32Array {
  const h = hp(); let ph = 0;
  return render(len, (t) => {
    ph += (f * (1 + drop * Math.exp(-t / 0.02))) / SR;
    return Math.sin(TAU * ph) * Math.exp(-t / decay) + h(noise(), nzF) * nz * Math.exp(-t / 0.015);
  });
}

const sfx: Record<string, Float32Array> = {
  // Noise + detuned saws rising over 2 s, getting brighter.
  riser: (() => {
    const f1 = lp(); let p1 = 0, p2 = 0;
    return render(2, (t) => {
      const k = t / 2, f = 110 * Math.pow(8, k);
      p1 += f / SR; p2 += (f * 1.012) / SR;
      const x = (saw(p1) + saw(p2)) * 0.3 + noise() * 0.5;
      return f1(x, 300 + 9000 * k * k) * (0.2 + 0.8 * k) * (t > 1.95 ? (2 - t) / 0.05 : 1);
    });
  })(),
  // Deep boom with a noisy crack on top.
  impact: (() => {
    const h = hp(); let ph = 0;
    return render(2.2, (t) => {
      ph += (40 + 120 * Math.exp(-t / 0.08)) / SR;
      return Math.tanh(Math.sin(TAU * ph) * Math.exp(-t / 0.7) * 1.8) + h(noise(), 1500) * Math.exp(-t / 0.08) * 0.7;
    });
  })(),
  // Fast falling square: pew.
  laser: (() => {
    let ph = 0;
    return render(0.35, (t) => { ph += (3000 * Math.exp(-t / 0.06) + 120) / SR; return (ph % 1 < 0.5 ? 0.6 : -0.6) * Math.exp(-t / 0.15); });
  })(),
  // Falling filtered noise, the opposite of the riser.
  downlifter: (() => {
    const f1 = lp();
    return render(1.6, (t) => f1(noise(), 8000 * Math.pow(0.02, t / 1.6) + 100) * Math.exp(-t / 0.9) * 1.2);
  })(),
  // A chord whose speed collapses, like a tape stopping.
  "tape-stop": (() => {
    const ph = [0, 0, 0];
    return render(1.4, (t) => {
      const speed = Math.max(0, 1 - Math.pow(t / 1.3, 1.6));
      return [220, 261.6, 329.6].reduce((a, f, k) => { ph[k] += (f * speed) / SR; return a + saw(ph[k]) * 0.22; }, 0) * Math.min(1, speed * 3);
    });
  })(),
  // Stacked detuned saws: a big stab of brass.
  horn: (() => {
    const f1 = lp(); const ph = new Array(6).fill(0);
    return render(0.9, (t) => {
      const fs = [233, 234.5, 293.7, 295, 349.2, 350.6];
      const x = fs.reduce((a, f, k) => { ph[k] += f / SR; return a + saw(ph[k]); }, 0) / 6;
      return f1(x, 900 + 3500 * Math.exp(-t / 0.25)) * Math.min(1, t / 0.02) * (t > 0.75 ? (0.9 - t) / 0.15 : 1) * 1.4;
    });
  })(),
  // Stuttering bit-crushed blips.
  glitch: (() => {
    let ph = 0, hold = 0;
    return render(0.6, (t, i) => {
      const seg = Math.floor(t / 0.05);
      const f = [880, 220, 1760, 440, 3520, 110, 660, 1320, 330, 2640, 550, 990][seg % 12];
      ph += f / SR;
      if (i % (4 + (seg % 5) * 6) === 0) hold = Math.round(Math.sin(TAU * ph) * 4) / 4;
      return hold * (seg % 3 === 2 ? 0 : 0.7) * Math.exp(-(t % 0.05) / 0.03);
    });
  })(),
  // A short minor-7th chord stab.
  stab: (() => {
    const f1 = lp(); const ph = [0, 0, 0, 0];
    return render(0.6, (t) => {
      const x = [220, 261.6, 329.6, 392].reduce((a, f, k) => { ph[k] += f / SR; return a + saw(ph[k]); }, 0) / 4;
      return f1(x, 600 + 5000 * Math.exp(-t / 0.08)) * Math.exp(-t / 0.18) * 1.6;
    });
  })(),
  // A sine sweeping up an octave and a half.
  "sweep-up": (() => { let ph = 0; return render(0.8, (t) => { ph += (200 * Math.pow(3, t / 0.8)) / SR; return Math.sin(TAU * ph) * 0.6 * Math.min(1, t / 0.05) * (t > 0.7 ? (0.8 - t) / 0.1 : 1); }); })(),
  // A burst of white noise with a hard decay.
  "noise-hit": (() => { const h = hp(); return render(0.5, (t) => h(noise(), 600) * Math.exp(-t / 0.09) * 0.9); })(),

  // ---- more FX
  boom: (() => { let ph = 0; return render(2.5, (t) => { ph += (32 + 60 * Math.exp(-t / 0.15)) / SR; return Math.tanh(Math.sin(TAU * ph) * Math.exp(-t / 1.1) * 2.2); }); })(),
  zap: (() => { let ph = 0; return render(0.3, (t) => { ph += (200 + 4000 * Math.exp(-t / 0.02)) / SR; return Math.sin(TAU * ph) * Math.exp(-t / 0.1); }); })(),
  whoosh: (() => { const f1 = lp(); return render(1.2, (t) => f1(noise(), 400 + 6000 * Math.sin((Math.PI * t) / 1.2)) * Math.sin((Math.PI * t) / 1.2) * 1.4); })(),
  "reverse-cymbal": (() => { const h = hp(); return render(1.8, (t) => h(noise(), 5000) * Math.pow(t / 1.8, 2.5) * (t > 1.75 ? (1.8 - t) / 0.05 : 1)); })(),
  siren: (() => { let ph = 0; return render(1.6, (t) => { ph += (700 + 300 * Math.sin(TAU * 2.5 * t)) / SR; return sq(ph) * 0.5 * Math.min(1, t / 0.02) * (t > 1.5 ? (1.6 - t) / 0.1 : 1); }); })(),
  bubble: (() => { let ph = 0; return render(0.25, (t) => { ph += (500 * Math.pow(4, t / 0.25)) / SR; return Math.sin(TAU * ph) * Math.exp(-t / 0.08); }); })(),
  alarm: (() => { let ph = 0; return render(1.2, (t) => { ph += (Math.floor(t / 0.15) % 2 ? 880 : 660) / SR; return sq(ph) * 0.45 * (t > 1.15 ? (1.2 - t) / 0.05 : 1); }); })(),
  coin: (() => { let ph = 0; return render(0.45, (t) => { ph += (t < 0.07 ? 988 : 1319) / SR; return sq(ph) * 0.5 * Math.exp(-Math.max(0, t - 0.07) / 0.15); }); })(),
  drop: (() => { let ph = 0; return render(0.6, (t) => { ph += (1200 * Math.pow(0.12, t / 0.6)) / SR; return Math.sin(TAU * ph) * Math.exp(-t / 0.3); }); })(),
  thunder: (() => { const f1 = lp(), f2 = lp(); return render(3, (t) => f1(noise(), 300) * (Math.exp(-t / 1.2) + 0.6 * Math.exp(-Math.abs(t - 0.4) / 0.15)) * 4 + f2(noise(), 2500) * Math.exp(-t / 0.05) * 0.5); })(),

  // ---- vocal chops (synthesised formants, no recordings)
  "vox-ah": vox(0.8, 220, "a"),
  "vox-oh": vox(0.8, 220, "o"),
  "vox-ee": vox(0.8, 262, "i"),
  "vox-oo": vox(0.8, 196, "u"),
  "vox-hey": vox(0.45, 247, "e", "i", { glide: 0.35, breath: 0.25 }),
  "vox-yeah": vox(0.7, 220, "i", "a", { glide: 0.3, pitchTo: 196 }),
  "vox-choir": (() => {
    const a = vox(2.2, 220, "a", "a", { vib: 0.012 }), b = vox(2.2, 277, "a", "o", { vib: 0.014 }), c = vox(2.2, 330, "o", "a", { vib: 0.011 });
    return a.map((v, i) => (v + b[i] + c[i]) / 2.2);
  })(),
  "vox-chop-up": vox(0.35, 196, "u", "a", { glide: 0.2, pitchTo: 330 }),
  "vox-chop-down": vox(0.35, 330, "a", "u", { glide: 0.25, pitchTo: 196 }),
  "vox-breath": (() => { const f = bp(1200, 1.5); return render(0.6, (t) => f(noise()) * Math.sin((Math.PI * t) / 0.6) * 2.5); })(),

  // ---- chord stabs (in C, so a pad Tune transposes them)
  "stab-major": stab(0.7, chord(60, [0, 4, 7, 12])),
  "stab-minor": stab(0.7, chord(60, [0, 3, 7, 12])),
  "stab-seventh": stab(0.8, chord(60, [0, 4, 7, 10]), { cut: 900, decay: 0.3 }),
  "stab-organ": stab(0.6, chord(60, [0, 4, 7, 12]), { wave: "organ", decay: 0.4, cut: 3000 }),
  "stab-brass": stab(0.8, chord(60, [0, 7, 12, 16]), { cut: 500, decay: 0.35, detune: 0.006 }),
  "stab-hit": (() => {
    const a = stab(0.9, chord(48, [0, 7, 12, 15, 19, 24]), { cut: 1200, decay: 0.3, detune: 0.008 }), h = hp();
    return a.map((v, i) => v + h(noise(), 1800) * Math.exp(-(i / SR) / 0.04) * 0.6);
  })(),
  "stab-piano": (() => {
    const ph = [0, 0, 0, 0]; const fs = chord(60, [0, 4, 7, 12]);
    return render(1.2, (t) => fs.reduce((a, f, k) => { ph[k] += f / SR; return a + (Math.sin(TAU * ph[k]) + Math.sin(TAU * ph[k] * 2) * 0.4 * Math.exp(-t / 0.15) + Math.sin(TAU * ph[k] * 3) * 0.2 * Math.exp(-t / 0.08)) * 0.25; }, 0) * Math.exp(-t / 0.5) * Math.min(1, t / 0.003));
  })(),
  "stab-bell": stab(1, chord(72, [0, 4, 7, 11]), { wave: "organ", decay: 0.6, cut: 6000 }),
  "stab-rave": stab(0.6, chord(60, [0, 3, 7, 10]), { decay: 0.25, detune: 0.012, drop: 2, cut: 1500 }),
  "stab-sus": stab(0.7, chord(60, [0, 5, 7, 12]), { wave: "sq", decay: 0.3, cut: 1000 }),

  // ---- hand percussion
  snap: (() => { const f = bp(2200, 2); return render(0.15, (t) => f(noise()) * Math.exp(-t / 0.012) * 3); })(),
  clap: (() => {
    const f = bp(1300, 1.2);
    return render(0.4, (t) => f(noise()) * ([0, 0.009, 0.018].reduce((a, s0) => a + (t >= s0 && t < s0 + 0.009 ? Math.exp(-(t - s0) / 0.004) : 0), 0) + (t > 0.027 ? Math.exp(-(t - 0.027) / 0.12) * 0.8 : 0)) * 2.5);
  })(),
  shaker: (() => { const h = hp(); return render(0.2, (t) => h(noise(), 6000) * Math.min(1, t / 0.04) * Math.exp(-t / 0.06) * 1.5); })(),
  tamb: (() => { const f = bp(7000, 3); let ph = 0; return render(0.4, (t) => { ph += 6100 / SR; return (f(noise()) * 1.5 + sq(ph) * 0.15) * Math.exp(-t / 0.12); }); })(),
  conga: drum(0.5, 200, 0.4, 0.18, 0.1),
  bongo: drum(0.3, 380, 0.3, 0.09, 0.12),
  woodblock: (() => { const f = bp(1800, 8); let ph = 0; return render(0.15, (t) => { ph += 1800 / SR; return (Math.sin(TAU * ph) + f(noise()) * 0.5) * Math.exp(-t / 0.025); }); })(),
  triangle: (() => { let ph = 0; return render(1.5, (t) => { ph += 4200 / SR; return (Math.sin(TAU * ph) + Math.sin(TAU * ph * 2.76) * 0.4) * Math.exp(-t / 0.5) * 0.6; }); })(),
  cowbell: (() => { const f = bp(900, 2.5); let a = 0, b = 0; return render(0.5, (t) => { a += 540 / SR; b += 800 / SR; return f((sq(a) + sq(b)) * 0.5) * (0.6 * Math.exp(-t / 0.01) + 0.4) * Math.exp(-t / 0.2) * 2; }); })(),
  scratch: (() => { const f1 = lp(); return render(0.5, (t) => { const m = Math.abs(Math.sin(TAU * 4 * t)); return f1(noise() * m, 800 + m * 3000) * 2; }); })(),
};

function wav16(data: Float32Array): Uint8Array {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0 ? 0.89 / peak : 1;
  const buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * norm)) * 32767, true);
  return new Uint8Array(buf);
}

await Deno.mkdir(OUT, { recursive: true });
for (const f of Deno.readDirSync(OUT)) if (f.name.endsWith(".wav")) Deno.removeSync(new URL(f.name, OUT));
for (const [name, data] of Object.entries(sfx)) {
  const f = Math.round(0.003 * SR);
  for (let i = 0; i < f; i++) data[data.length - 1 - i] *= i / f;
  await Deno.writeFile(new URL(`${name}.wav`, OUT), wav16(data));
  console.log(`${name}.wav  ${(data.length / SR).toFixed(2)}s`);
}
await Deno.writeTextFile(new URL("LICENSE.txt", OUT), "These sound effects were synthesised by tools/make-sfx.ts for TILT.\nReleased under CC0 1.0 (public domain dedication).\n");
