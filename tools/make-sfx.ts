// Renders Grab's built-in sound effects to public/sfx/*.wav.
// Every sound is synthesised here, so they're ours and CC0.
// Run: deno run -A tools/make-sfx.ts

const SR = 48000;
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
for (const [name, data] of Object.entries(sfx)) {
  const f = Math.round(0.003 * SR);
  for (let i = 0; i < f; i++) data[data.length - 1 - i] *= i / f;
  await Deno.writeFile(new URL(`${name}.wav`, OUT), wav16(data));
  console.log(`${name}.wav  ${(data.length / SR).toFixed(2)}s`);
}
await Deno.writeTextFile(new URL("LICENSE.txt", OUT), "These sound effects were synthesised by tools/make-sfx.ts for TILT.\nReleased under CC0 1.0 (public domain dedication).\n");
