// Renders Kitbox's kits to public/kit/<kit>-<part>.wav: 12 kits x 8 parts (kick, snare, clap,
// closed hat, open hat, tom, rim, perc). Every sound is synthesised here from scratch, so the
// kits are ours and CC0. The kit and part order must match KITS / KIT_PARTS in src/engine/instruments.ts.
// Run: deno run -A tools/make-kit.ts

const SR = 32000;
const OUT = new URL("../public/kit/", import.meta.url);

type Buf = Float32Array;
type Gen = (t: number, i: number) => number;

function render(seconds: number, gen: Gen): Buf {
  const n = Math.round(seconds * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = gen(i / SR, i);
  return out;
}

let seed = 12345;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };

/** RBJ biquad over a whole buffer. */
function bq(x: Buf, type: "lp" | "hp" | "bp", f: number, q = 0.7): Buf {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === "lp") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === "hp") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const env = (t: number, decay: number) => Math.exp((-t * 4.6) / decay);
const mix = (...xs: Buf[]) => { const o = new Float32Array(Math.max(...xs.map((x) => x.length))); for (const x of xs) for (let i = 0; i < x.length; i++) o[i] += x[i]; return o; };
const gain = (x: Buf, g: number) => x.map((v) => v * g);
const shape = (x: Buf, f: (t: number) => number) => x.map((v, i) => v * f(i / SR));
const drive = (x: Buf, g: number) => x.map((v) => Math.tanh(v * g) / Math.tanh(g));
/** Lo-fi: fewer bits and a lower sample rate (sample and hold). */
const crush = (x: Buf, bits: number, hold: number) => { const q = 2 ** (bits - 1); let h = 0; return x.map((v, i) => (i % hold === 0 ? (h = Math.round(v * q) / q) : h)); };
const white = (len: number) => render(len, () => noise());
const decayed = (x: Buf, d: number, attack = 0) => shape(x, (t) => (attack && t < attack ? t / attack : 1) * env(t, d));

/** A sine (or square) with an exponential pitch sweep from f0 to f1. */
function tone(len: number, f0: number, f1: number, sweep: number, decay: number, square = false): Buf {
  let ph = 0;
  return render(len, (t) => {
    ph += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t / sweep))) / SR;
    return (square ? (Math.sin(ph) >= 0 ? 0.6 : -0.6) : Math.sin(ph)) * env(t, decay);
  });
}

function kick(len: number, f0: number, f1: number, sweep: number, decay: number, drv: number, click = 0.5): Buf {
  let ph = 0;
  return render(len, (t) => {
    ph += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t / sweep))) / SR;
    const c = t < 0.004 ? (1 - t / 0.004) * click * noise() : 0;
    return Math.tanh((Math.sin(ph) * env(t, decay) + c) * drv) / Math.tanh(drv);
  });
}

/** The metallic cluster: six detuned squares. */
function metal(len: number, scale = 1.7): Buf {
  const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * scale), ph = fs.map(() => Math.random());
  return render(len, () => { let s = 0; for (let k = 0; k < 6; k++) { ph[k] = (ph[k] + fs[k] / SR) % 1; s += ph[k] < 0.5 ? 1 : -1; } return s / 6; });
}

/** Hand claps: a few quick noise bursts, then a tail. */
function clap(len: number, bp: number, bursts: number, gap: number, tail: number): Buf {
  const last = (bursts - 1) * gap;
  return gain(shape(bq(white(len), "bp", bp, 1.2), (t) => {
    let e = 0;
    for (let b = 0; b < bursts; b++) { const s = b * gap; if (t >= s && t < s + gap) e = Math.max(e, env(t - s, 0.012)); }
    return e + (t > last ? env(t - last, tail) * 0.8 : 0);
  }), 1.6);
}

const hat = (len: number, d: number, hp: number, metalMix: number, scale = 1.7) =>
  decayed(bq(mix(gain(metal(len, scale), metalMix), gain(white(len), 1 - metalMix)), "hp", hp), d);
const snare = (len: number, f0: number, f1: number, toneD: number, nzF: number, nzType: "hp" | "bp", nzD: number, toneG = 0.7, nzG = 0.7) =>
  mix(gain(tone(len, f0, f1, 0.02, toneD), toneG), gain(decayed(bq(white(len), nzType, nzF, 0.7), nzD), nzG));
const cowbell = (len: number, f: number, d: number) => decayed(bq(mix(
  render(len, (t) => (Math.sin(2 * Math.PI * f * t) > 0 ? 0.5 : -0.5)),
  render(len, (t) => (Math.sin(2 * Math.PI * f * 1.5 * t) > 0 ? 0.5 : -0.5)),
), "bp", f * 1.6, 2), d);
const rim = (f = 1700) => mix(gain(tone(0.08, f, f, 1, 0.025), 0.5), gain(tone(0.08, 480, 480, 1, 0.04), 0.5));
const shaker = (len = 0.18, d = 0.09) => decayed(bq(white(len), "hp", 5000), d, 0.03);
const lofi = (x: Buf) => bq(crush(x, 7, 3), "lp", 5000);

/** Each kit: kick, snare, clap, closed hat, open hat, tom, rim, perc. */
const KITS: Record<string, Buf[]> = {
  classic: [kick(0.9, 150, 46, 0.035, 0.6, 1.2), snare(0.3, 330, 200, 0.09, 1800, "hp", 0.18), clap(0.45, 1200, 3, 0.011, 0.22),
    hat(0.15, 0.05, 7000, 1), hat(0.8, 0.45, 6500, 1), mix(tone(0.8, 140, 85, 0.06, 0.5), gain(decayed(bq(white(0.1), "lp", 2000), 0.03), 0.2)),
    rim(), cowbell(0.5, 562, 0.3)],
  house: [kick(0.6, 200, 50, 0.025, 0.4, 2), snare(0.3, 220, 180, 0.08, 3000, "bp", 0.2), clap(0.5, 1500, 4, 0.009, 0.3),
    hat(0.1, 0.045, 8000, 0.3), hat(0.6, 0.35, 7000, 0.35), tone(0.5, 180, 120, 0.05, 0.4), rim(2000), shaker()],
  techno: [kick(0.55, 180, 48, 0.018, 0.35, 3.5), snare(0.35, 200, 170, 0.07, 1500, "hp", 0.25, 0.5, 0.9), clap(0.4, 1100, 3, 0.01, 0.2),
    hat(0.08, 0.03, 8500, 0.8), hat(0.7, 0.5, 8000, 0.8), tone(0.4, 150, 100, 0.04, 0.3), rim(1900),
    decayed(bq(mix(metal(1.2, 2.6), gain(tone(1.2, 5200, 5200, 1, 0.8), 0.2)), "hp", 3000), 0.9)],
  trap: [kick(2.0, 110, 38, 0.06, 1.8, 1.3, 0.2), snare(0.25, 240, 200, 0.06, 2500, "hp", 0.15, 0.5, 0.9), gain(clap(0.4, 1500, 3, 0.008, 0.25), 1.1),
    hat(0.06, 0.025, 9000, 0.6, 2), hat(0.8, 0.6, 8500, 0.6, 2), tone(1.0, 120, 90, 0.08, 0.9), rim(), tone(0.15, 900, 700, 0.03, 0.08)],
  electro: [kick(0.7, 300, 50, 0.03, 0.5, 1.6), mix(gain(tone(0.3, 180, 160, 0.02, 0.08), 0.6), gain(shape(bq(white(0.3), "bp", 2000), (t) => (t < 0.18 ? 1 : 0) * env(t, 0.4)), 0.7)),
    clap(0.45, 1200, 3, 0.011, 0.22), hat(0.12, 0.05, 7000, 0.9), hat(0.6, 0.4, 6500, 0.9), tone(0.45, 400, 120, 0.08, 0.35),
    tone(0.06, 2500, 2500, 1, 0.03), tone(0.25, 2400, 90, 0.03, 0.18)],
  lofi: [lofi(kick(0.6, 120, 50, 0.03, 0.4, 1)), lofi(snare(0.35, 210, 180, 0.1, 1500, "bp", 0.25)), lofi(clap(0.4, 1000, 3, 0.012, 0.2)),
    lofi(hat(0.1, 0.05, 3000, 0.2)), lofi(hat(0.5, 0.35, 3000, 0.2)), lofi(tone(0.5, 150, 110, 0.05, 0.4)), lofi(rim(1500)), lofi(shaker(0.25, 0.12))],
  minimal: [kick(0.35, 250, 60, 0.012, 0.18, 1.5, 0.8), mix(gain(tone(0.12, 400, 380, 0.01, 0.05), 0.6), gain(decayed(bq(white(0.12), "hp", 2000), 0.08), 0.5)),
    clap(0.2, 1400, 2, 0.008, 0.1), decayed(bq(white(0.04), "hp", 7000), 0.015), hat(0.25, 0.18, 7500, 0.5), tone(0.2, 220, 200, 0.02, 0.15),
    tone(0.08, 1200, 1000, 0.01, 0.05), decayed(bq(white(0.03), "bp", 4000, 2), 0.01)],
  industrial: [kick(0.6, 160, 45, 0.03, 0.5, 6), drive(mix(snare(0.35, 200, 160, 0.1, 1200, "hp", 0.25), gain(decayed(metal(0.35, 1.1), 0.15), 0.4)), 4),
    drive(clap(0.4, 800, 3, 0.012, 0.25), 3), drive(hat(0.12, 0.06, 6000, 1, 1.3), 3), drive(hat(0.9, 0.6, 5000, 0.7, 1.3), 2),
    mix(tone(0.5, 180, 120, 0.05, 0.4), gain(decayed(metal(0.5, 0.8), 0.3), 0.3)), drive(decayed(bq(metal(0.4, 1.4), "bp", 2000, 3), 0.3), 2),
    drive(decayed(bq(mix(metal(1, 1.9), white(1)), "hp", 3000), 0.5), 2.5)],
  garage: [kick(0.5, 190, 52, 0.022, 0.32, 1.8), snare(0.25, 260, 220, 0.06, 2000, "hp", 0.14, 0.6, 0.8), clap(0.35, 1300, 3, 0.01, 0.18),
    hat(0.08, 0.035, 9000, 0.5), hat(0.4, 0.25, 8500, 0.5), tone(0.35, 210, 170, 0.04, 0.25), rim(2200), shaker(0.15, 0.07)],
  boombap: [bq(kick(0.5, 140, 55, 0.03, 0.35, 1.5), "lp", 3000), bq(snare(0.4, 200, 180, 0.18, 1800, "bp", 0.3, 0.8, 0.8), "lp", 7000),
    clap(0.3, 1100, 2, 0.01, 0.15), bq(hat(0.1, 0.05, 5000, 0.3), "lp", 9000), bq(hat(0.5, 0.35, 5000, 0.3), "lp", 9000),
    tone(0.5, 160, 130, 0.05, 0.4), rim(1500), decayed(bq(mix(metal(0.3, 3), gain(white(0.3), 0.6)), "hp", 6000), 0.15, 0.005)],
  disco: [kick(0.6, 130, 52, 0.03, 0.42, 1.2), snare(0.35, 230, 200, 0.08, 2200, "bp", 0.22), clap(0.5, 1300, 4, 0.01, 0.25),
    hat(0.12, 0.06, 8000, 0.2), hat(0.7, 0.55, 7500, 0.2), tone(0.8, 300, 100, 0.15, 0.6), rim(), cowbell(0.5, 600, 0.25)],
  chip: [tone(0.3, 120, 40, 0.04, 0.25, true), decayed(crush(white(0.2), 4, 6), 0.15), decayed(crush(white(0.25), 4, 4), 0.12, 0.004),
    decayed(crush(white(0.05), 4, 2), 0.03), decayed(crush(white(0.3), 4, 2), 0.2), tone(0.3, 300, 150, 0.06, 0.25, true),
    tone(0.05, 1000, 1000, 1, 0.03, true), render(0.2, (t) => (Math.sin(2 * Math.PI * (t < 0.05 ? 1500 : 3000) * t) >= 0 ? 0.6 : -0.6) * env(t, 0.15))],
};

function wav16(data: Buf): Uint8Array {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0 ? 0.89 / peak : 1; // about -1 dBFS
  const buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * norm)) * 32767, true);
  return new Uint8Array(buf);
}

const PARTS = ["kick", "snare", "clap", "chat", "ohat", "tom", "rim", "perc"];
for (const f of Deno.readDirSync(OUT)) if (f.name.endsWith(".wav")) Deno.removeSync(new URL(f.name, OUT));
for (const [kit, sounds] of Object.entries(KITS)) {
  if (sounds.length !== 8) throw new Error(`${kit}: ${sounds.length} sounds`);
  sounds.forEach((data, i) => {
    // Trim the silent tail, then a 2 ms fade so truncation never clicks.
    let end = data.length;
    while (end > SR * 0.02 && Math.abs(data[end - 1]) < 1e-3) end--;
    const d = data.slice(0, end), f = Math.round(0.002 * SR);
    for (let k = 0; k < f; k++) d[d.length - 1 - k] *= k / f;
    Deno.writeFileSync(new URL(`${kit}-${PARTS[i]}.wav`, OUT), wav16(d));
  });
}
Deno.writeTextFileSync(new URL("LICENSE.txt", OUT), "These drum sounds were synthesised by tools/make-kit.ts for TILT.\nReleased under CC0 1.0 (public domain dedication).\n");
console.log(Object.keys(KITS).length, "kits");
