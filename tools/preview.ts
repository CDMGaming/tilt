// Audio previews of an instrument's presets, rendered offline through the same chain the
// worklet uses (instrument DSP, hidden voicing toolkit, built-in effect), plus a loudness table.
//   deno run -A --sloppy-imports tools/preview.ts <kind> <outDir> [--no-wav]

import { INSTRUMENTS, KIT_SAMPLES, presetParams } from "../src/engine/instruments.ts";
import type { InstrumentKind } from "../src/engine/model.ts";
import { AcidDSP, DrumsDSP, PolyDSP, type InstrumentDSP } from "../src/engine/dsp/instruments-dsp.ts";
import { LeadDSP, PadDSP, WobbleDSP } from "../src/engine/dsp/instruments2-dsp.ts";
import { ThumpLabDSP } from "../src/engine/dsp/thumplab-dsp.ts";
import { ChipDSP, FmDSP } from "../src/engine/dsp/instruments3-dsp.ts";
import { Toolkit } from "../src/engine/dsp/toolkit-dsp.ts";
import { makeFx } from "../src/engine/dsp/fx-dsp.ts";
import { hasToolkit } from "../src/engine/toolkit.ts";
import { encodeWav } from "../src/engine/wav.ts";

const SR = 44100;
const kind = Deno.args[0] as InstrumentKind, out = Deno.args[1], wavs = !Deno.args.includes("--no-wav");
const BPM = 125, step = 60 / BPM / 4;
const TARGET = -18.5; // dB: every preset of an instrument should sit about here

type Ev = { t: number; len: number; pitch: number; vel: number };

/** A phrase that shows the instrument's idea: an acid line with accents and slides; held chords for arps. */
function phrase(params: Record<string, number>): Ev[] {
  if (kind === "acid") {
    if (params.arpOn >= 0.5) return [36, 43, 48].flatMap((p) => [{ t: 0, len: step * 15.5, pitch: p, vel: 100 }, { t: step * 16, len: step * 15.5, pitch: p - 2, vel: 100 }]);
    // 2 bars: [step, pitch, length in steps, accent, slide into the next]
    const line: [number, number, number, number][] = [
      [0, 36, 1, 1], [2, 36, 1, 0], [3, 48, 1, 0], [4, 39, 2.2, 0], [6, 36, 1, 1], [8, 43, 1, 0], [9, 46, 2.2, 0], [11, 48, 1, 1],
      [12, 36, 1, 0], [14, 34, 1, 0], [16, 36, 1, 1], [18, 48, 1, 0], [19, 36, 1, 0], [20, 41, 2.2, 0], [22, 43, 1, 1], [24, 36, 1, 0],
      [26, 39, 1, 0], [27, 41, 2.2, 1], [29, 43, 1, 0], [30, 46, 1, 0],
    ];
    return line.map(([s, pitch, l, acc]) => ({ t: s * step, len: l * step * 0.6, pitch, vel: acc ? 120 : 90 }));
  }
  if (kind === "analog" || kind === "drums") {
    // 2 bars: [part, 16th steps, velocity]; the second bar ends with a tom fill.
    const bar: [number, number[], number][] = [[0, [0, 4, 8, 12], 115], [1, [4, 12], 105], [3, [0, 2, 4, 6, 8, 10, 12, 14], 80], [4, [2, 10], 95], [7, [3, 11], 85], [2, [12], 90]];
    const out: Ev[] = [];
    for (let b = 0; b < 2; b++) for (const [part, steps, vel] of bar) for (const s of steps) {
      if (b === 1 && s >= 12 && part !== 0) continue;
      out.push({ t: (b * 16 + s) * step, len: step, pitch: 36 + part, vel });
    }
    [[5, 12], [5, 13], [6, 14], [6, 15]].forEach(([part, s]) => out.push({ t: (16 + s) * step, len: step, pitch: 36 + part, vel: 100 }));
    return out;
  }
  return [{ t: 0, len: 1.5, pitch: 60, vel: 100 }];
}

/** Kitbox's sounds, read from public/kit (16-bit mono WAVs at 32 kHz). */
const KIT_RATE = 32000;
const kitSounds = kind === "drums" ? KIT_SAMPLES.map((name) => {
  const b = Deno.readFileSync(new URL(`../public/kit/${name}.wav`, import.meta.url)), v = new DataView(b.buffer);
  const n = (b.length - 44) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768;
  return x;
}) : [];

function dspFor(params: Record<string, number>, clock: { bpm: number; zero: number }): InstrumentDSP {
  switch (kind) {
    case "drums": { const d = new DrumsDSP(params, kitSounds, SR); d.samplesRate = KIT_RATE; return d; }
    case "acid": return new AcidDSP(params, SR, clock);
    case "lead": return new LeadDSP(params, SR);
    case "analog": return new ThumpLabDSP(params, SR);
    case "wobble": return new WobbleDSP(params, SR, clock);
    case "pad": return new PadDSP(params, SR);
    case "chip": return new ChipDSP(params, SR);
    case "fm": return new FmDSP(params, SR);
    default: return new PolyDSP(params, SR);
  }
}

export function render(params: Record<string, number>, seconds = 32 * step + 0.6) {
  const clock = { bpm: BPM, zero: 0 };
  const dsp = dspFor(params, clock);
  const voice = hasToolkit(kind) ? new Toolkit(kind, params, SR, clock, dsp) : dsp;
  const ifxType = Math.round(params["ifx:type"] ?? 0), fx = ifxType ? makeFx(ifxType, SR) : null;
  const n = Math.round(seconds * SR), L = new Float32Array(n), R = new Float32Array(n);
  const evs = phrase(params).flatMap((e) => [{ t: e.t, on: true, e }, { t: e.t + e.len, on: false, e }]).sort((a, b) => a.t - b.t || Number(a.on) - Number(b.on));
  let k = 0;
  const B = 128;
  for (let i0 = 0; i0 < n; i0 += B) {
    const t = i0 / SR, i1 = Math.min(n, i0 + B);
    while (k < evs.length && evs[k].t <= t) { const x = evs[k++]; if (x.on) voice.noteOn(x.e.pitch, x.e.vel, t); else voice.noteOff(x.e.pitch, t); }
    const l = new Float32Array(i1 - i0), r = new Float32Array(i1 - i0);
    voice.render(l, r, 0, i1 - i0, t);
    fx?.process(l, r, i1 - i0, params["ifx:a"] ?? 0.5, params["ifx:b"] ?? 0.5, t, clock);
    L.set(l, i0); R.set(r, i0);
  }
  return [L, R];
}

/** Loudness in dB (RMS over the sounding part, a rough stand-in for LUFS) and peak. */
export function measure([L, R]: Float32Array[]) {
  let sum = 0, cnt = 0, peak = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    peak = Math.max(peak, a);
    if (a > 1e-4) { sum += (L[i] * L[i] + R[i] * R[i]) / 2; cnt++; }
  }
  return { db: 10 * Math.log10(sum / Math.max(1, cnt) + 1e-12), peak };
}

if (import.meta.main) {
  if (wavs) Deno.mkdirSync(out, { recursive: true });
  const rows: string[] = [];
  INSTRUMENTS[kind].presets.forEach((p, i) => {
    let s = 7;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const audio = render(presetParams(kind, i));
    const m = measure(audio);
    const lv = presetParams(kind, i).level ?? 1, want = Math.min(1, lv * Math.pow(10, (TARGET - m.db) / 20));
    rows.push(`${String(i + 1).padStart(2)} ${p.name.padEnd(18)} ${m.db.toFixed(1).padStart(6)} dB  peak ${m.peak.toFixed(2)}  level ${lv.toFixed(2)} -> ${want.toFixed(2)}`);
    if (wavs) Deno.writeFileSync(`${out}/${String(i + 1).padStart(2, "0")}-${p.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.wav`, encodeWav({ numberOfChannels: 2, sampleRate: SR, length: audio[0].length, getChannelData: (c: number) => audio[c] } as unknown as AudioBuffer));
  });
  console.log(rows.join("\n"));
}
