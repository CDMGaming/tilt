// Renders the default "Kitbox" drum kit to public/kit/*.wav.
// Every sound is synthesised here from scratch, so the kit is ours and CC0.
// Run: deno run -A tools/make-kit.ts

const SR = 48000;
const OUT = new URL("../public/kit/", import.meta.url);

type Gen = (t: number, i: number) => number;

function render(seconds: number, gen: Gen): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = gen(i / SR, i);
  return out;
}

let seed = 12345;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 31 - 1;
};

/** RBJ biquad, processes a whole buffer. */
function biquad(x: Float32Array, type: "lp" | "hp" | "bp", f: number, q: number): Float32Array {
  const w = (2 * Math.PI * f) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === "lp") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === "hp") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const env = (t: number, decay: number) => Math.exp((-t * 4.6) / decay);
const mix = (...xs: Float32Array[]) => {
  const n = Math.max(...xs.map((x) => x.length));
  const o = new Float32Array(n);
  for (const x of xs) for (let i = 0; i < x.length; i++) o[i] += x[i];
  return o;
};
const gain = (x: Float32Array, g: number) => x.map((v) => v * g);
const shape = (x: Float32Array, f: (t: number) => number) => x.map((v, i) => v * f(i / SR));

function kick(len: number, f0: number, f1: number, sweep: number, decay: number, drive: number): Float32Array {
  let ph = 0;
  return render(len, (t) => {
    const f = f1 + (f0 - f1) * Math.exp(-t / sweep);
    ph += (2 * Math.PI * f) / SR;
    const click = t < 0.004 ? (1 - t / 0.004) * 0.5 * noise() : 0;
    return Math.tanh((Math.sin(ph) * env(t, decay) + click) * drive) / Math.tanh(drive);
  });
}

// Classic metallic cluster: six detuned square waves.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.7);
function metal(len: number): Float32Array {
  const ph = METAL.map(() => Math.random());
  return render(len, () => {
    let s = 0;
    for (let k = 0; k < METAL.length; k++) {
      ph[k] = (ph[k] + METAL[k] / SR) % 1;
      s += ph[k] < 0.5 ? 1 : -1;
    }
    return s / METAL.length;
  });
}

function tone(len: number, f0: number, f1: number, sweep: number, decay: number): Float32Array {
  let ph = 0;
  return render(len, (t) => {
    const f = f1 + (f0 - f1) * Math.exp(-t / sweep);
    ph += (2 * Math.PI * f) / SR;
    return Math.sin(ph) * env(t, decay);
  });
}

const white = (len: number) => render(len, () => noise());

const kit: Record<string, Float32Array> = {
  "kick-deep": kick(0.9, 150, 46, 0.035, 0.6, 1.2),
  "kick-punch": kick(0.5, 230, 55, 0.02, 0.3, 2.5),
  "kick-boom": kick(2.0, 120, 40, 0.05, 1.6, 1.4),
  "snare-crack": mix(
    gain(tone(0.3, 330, 200, 0.02, 0.09), 0.6),
    gain(shape(biquad(white(0.35), "hp", 1800, 0.7), (t) => env(t, 0.18)), 0.7),
  ),
  "snare-body": mix(
    gain(tone(0.4, 260, 175, 0.03, 0.16), 0.8),
    gain(shape(biquad(white(0.4), "bp", 2500, 0.6), (t) => env(t, 0.25)), 0.6),
  ),
  clap: gain(shape(biquad(white(0.45), "bp", 1200, 1.2), (t) => {
    const bursts = [0, 0.011, 0.022].reduce((a, s) => a + (t >= s && t < s + 0.01 ? env(t - s, 0.01) : 0), 0);
    return bursts + (t > 0.03 ? env(t - 0.03, 0.22) * 0.8 : 0);
  }), 1.6),
  rim: mix(gain(tone(0.08, 1700, 1700, 1, 0.025), 0.5), gain(tone(0.08, 480, 480, 1, 0.04), 0.5)),
  "hat-closed": gain(shape(biquad(metal(0.15), "hp", 7000, 0.7), (t) => env(t, 0.05)), 1.4),
  "hat-open": gain(shape(biquad(metal(0.8), "hp", 6500, 0.7), (t) => env(t, 0.45)), 1.2),
  "hat-pedal": gain(shape(biquad(metal(0.25), "bp", 5000, 1), (t) => env(t, 0.1)), 1.2),
  "tom-low": mix(tone(0.8, 140, 85, 0.06, 0.5), gain(shape(biquad(white(0.1), "lp", 2000, 0.7), (t) => env(t, 0.03)), 0.2)),
  "tom-high": mix(tone(0.6, 260, 170, 0.05, 0.35), gain(shape(biquad(white(0.1), "lp", 3000, 0.7), (t) => env(t, 0.03)), 0.2)),
  cowbell: gain(shape(biquad(mix(
    render(0.5, (t) => (Math.sin(2 * Math.PI * 562 * t) > 0 ? 1 : -1) * 0.5),
    render(0.5, (t) => (Math.sin(2 * Math.PI * 845 * t) > 0 ? 1 : -1) * 0.5),
  ), "bp", 900, 2), (t) => env(t, 0.3)), 1.4),
  shaker: gain(shape(biquad(white(0.18), "hp", 5000, 0.7), (t) => Math.min(1, t / 0.03) * env(t, 0.09)), 1.2),
  crash: gain(shape(biquad(mix(metal(2.2), gain(white(2.2), 0.6)), "hp", 4500, 0.7), (t) => env(t, 1.6)), 1.0),
  zap: tone(0.25, 2400, 90, 0.03, 0.18),
};

function wav16(data: Float32Array): Uint8Array {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0 ? 0.89 / peak : 1; // normalise to about -1 dBFS
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * norm)) * 32767, true);
  return new Uint8Array(buf);
}

await Deno.mkdir(OUT, { recursive: true });
for (const [name, data] of Object.entries(kit)) {
  // 2 ms fade-out at the very end so truncation never clicks.
  const f = Math.round(0.002 * SR);
  for (let i = 0; i < f; i++) data[data.length - 1 - i] *= i / f;
  await Deno.writeFile(new URL(`${name}.wav`, OUT), wav16(data));
  console.log(`${name}.wav  ${(data.length / SR).toFixed(2)}s`);
}
await Deno.writeTextFile(new URL("LICENSE.txt", OUT), "These drum sounds were synthesised by tools/make-kit.ts for Rollbox.\nReleased under CC0 1.0 (public domain dedication).\n");
