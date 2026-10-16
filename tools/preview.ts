// Audio previews of an instrument's presets, rendered offline through the same chain the
// worklet uses (instrument DSP, hidden voicing toolkit, built-in effect), plus a loudness table.
//   deno run -A --sloppy-imports tools/preview.ts <kind> <outDir> [--no-wav]

import { INSTRUMENTS, KIT_SAMPLES, presetParams } from "../src/engine/instruments.ts";
import type { InstrumentKind, Song, Track } from "../src/engine/model.ts";
import { expandPitch } from "../src/engine/timeline.ts";
import { AcidDSP, DrumsDSP, PolyDSP, type InstrumentDSP } from "../src/engine/dsp/instruments-dsp.ts";
import { LeadDSP, PadDSP, WobbleDSP } from "../src/engine/dsp/instruments2-dsp.ts";
import { ThumpLabDSP } from "../src/engine/dsp/thumplab-dsp.ts";
import { ChipDSP, FmDSP, SamplerDSP, WavetableDSP } from "../src/engine/dsp/instruments3-dsp.ts";
import { buildMips, parseWav } from "../src/engine/wavetable.ts";
import { AnthemDSP, OrganDSP, PatchworkDSP, PluckDSP, TineDSP, VoxDSP } from "../src/engine/dsp/instruments4-dsp.ts";
import { Toolkit } from "../src/engine/dsp/toolkit-dsp.ts";
import { makeFx } from "../src/engine/dsp/fx-dsp.ts";
import { hasToolkit } from "../src/engine/toolkit.ts";
import { encodeWav } from "../src/engine/wav.ts";

const SR = 44100;
const kind = Deno.args[0] as InstrumentKind, out = Deno.args[1], wavs = !Deno.args.includes("--no-wav");
const BPM = 125, step = 60 / BPM / 4;
const TARGET = -16; // dB short-term max: every preset of an instrument should sit about here

type Ev = { t: number; len: number; pitch: number; vel: number };

/** A phrase that shows the instrument's idea: an acid line with accents and slides; held chords for arps. */
function phrase(params: Record<string, number>): Ev[] {
  if (kind === "wobble" || kind === "patch") {
    // A bass line held long enough to hear the wobble: two bars, a slide in the second.
    return [[0, 36, 7.5], [8, 36, 3.5], [12, 39, 3.5], [16, 34, 7.5], [24, 36, 8.5], [32, 43, 0]].filter(([, , l]) => l > 0)
      .map(([s0, pitch, l]) => ({ t: s0 * step, len: l * step, pitch, vel: 100 }));
  }
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
  if (kind === "sampler") {
    // Each pad once, then a little pattern on the first four.
    return [...Array.from({ length: 8 }, (_, i) => ({ t: i * 2 * step, len: 1.5 * step, pitch: 36 + i, vel: 100 })),
      ...[0, 2, 1, 3, 0, 1, 2, 3].map((p0, i) => ({ t: (16 + i * 2) * step, len: 1.5 * step, pitch: 36 + p0, vel: 100 }))];
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
  if (kind === "pluck") {
    // An arpeggio, a held chord, then a low line (the basses play an octave down).
    const lo = Math.round(params.body ?? 0) === 3 ? -24 : 0;
    return [...[60, 63, 67, 72, 67, 63].map((pitch, i) => ({ t: i * 2 * step, len: 1.8 * step, pitch: pitch + lo, vel: 100 })),
      ...[60, 64, 67].map((pitch) => ({ t: 14 * step, len: 8 * step, pitch: pitch + lo, vel: 90 })),
      ...[48, 51, 55, 53].map((pitch, i) => ({ t: (24 + i * 2) * step, len: 1.8 * step, pitch: pitch + lo, vel: 110 }))];
  }
  if (kind === "vox") {
    // Basses play a low line; everything else a held chord, then a short melody.
    if ((params.release ?? 1) < 0.25 && (params.throat ?? 0) >= 0.7) return [[0, 36, 3.5], [4, 36, 1.5], [6, 39, 1.5], [8, 41, 3.5], [12, 43, 3.5], [16, 36, 7.5], [24, 34, 7]].map(([s0, pitch, l]) => ({ t: s0 * step, len: l * step, pitch, vel: 100 }));
    return [...[60, 63, 67].map((pitch) => ({ t: 0, len: 14 * step, pitch, vel: 100 })),
      ...[[16, 72, 2], [18, 75, 2], [20, 79, 4], [24, 77, 6]].map(([s0, pitch, l]) => ({ t: s0 * step, len: l * step, pitch, vel: 100 }))];
  }
  if (kind === "anthem") {
    // A chord bar, then the lead line.
    return [...[60, 63, 67].map((pitch) => ({ t: 0, len: 7.5 * step, pitch, vel: 100 })), ...[56, 60, 63].map((pitch) => ({ t: 8 * step, len: 7.5 * step, pitch, vel: 100 })),
      ...[[16, 72, 2], [18, 75, 2], [20, 79, 3.5], [24, 77, 2], [26, 75, 6]].map(([s0, pitch, l]) => ({ t: s0 * step, len: l * step, pitch, vel: 100 }))];
  }
  if (kind === "organ") {
    // Held chords (the rotary and vibrato need time), then a short riff.
    const ch = (t0: number, l: number, ps: number[]) => ps.map((pitch) => ({ t: t0 * step, len: l * step, pitch, vel: 100 }));
    const lo = (params.db2 ?? 0) === 6 && (params.db0 ?? 0) === 8 && (params.db3 ?? 0) === 0 && (params.db1 ?? 0) === 6 ? -12 : 0;
    return [...ch(0, 7.5, [48, 55, 60, 63].map((x) => x + lo)), ...ch(8, 7.5, [44, 51, 56, 60].map((x) => x + lo)),
      ...[[16, 60], [18, 63], [20, 65], [21, 66], [22, 67], [24, 70], [26, 67], [28, 63]].map(([s0, pitch]) => ({ t: s0 * step, len: 1.6 * step, pitch: pitch + lo, vel: 100 }))];
  }
  if (kind === "epiano") {
    // Comping: two voiced chords, then a short melody on top.
    const ch = (t0: number, l: number, ps: number[], vel = 90) => ps.map((pitch) => ({ t: t0 * step, len: l * step, pitch, vel }));
    return [...ch(0, 6, [48, 55, 58, 63]), ...ch(8, 6, [44, 51, 55, 60], 70), ...ch(16, 3, [46, 53, 56, 62], 110),
      ...[[20, 70], [22, 72], [24, 75], [26, 74], [28, 70]].map(([s0, pitch]) => ({ t: s0 * step, len: 1.8 * step, pitch, vel: 100 }))];
  }
  if (kind === "poly") {
    // Two chords: i then VI in C minor (Chordette expands each key into a chord itself).
    const track = { kind: "poly", params } as unknown as Track, song = { key: 0, scale: "minor" } as unknown as Song;
    return [[48, 0], [44, 16]].flatMap(([root, s]) => expandPitch(song, track, root).map((pitch) => ({ t: s * step, len: 14 * step, pitch, vel: 100 })));
  }
  if (kind === "chip") {
    // A short tune: separate notes, a held note (jumps and runs need time), a low note.
    const line: [number, number, number][] = [[0, 72, 1.5], [2, 76, 1.5], [4, 79, 3.5], [8, 84, 1.5], [10, 79, 1.5], [12, 76, 3.5], [16, 72, 7.5], [24, 48, 6]];
    return line.map(([st, pitch, l]) => ({ t: st * step, len: l * step, pitch, vel: 100 }));
  }
  if (kind === "wave" && (params.attack ?? 0) > 0.3) {
    // A slow pad: hold a chord for two bars so it can open up.
    return [60, 63, 67].map((pitch) => ({ t: 0, len: 30 * step, pitch, vel: 100 }));
  }
  if (kind === "lead" || kind === "wave") {
    // A lead line: short notes, then a slide (overlapping notes) and a long held note.
    const line: [number, number, number][] = [[0, 72, 2], [2, 75, 2], [4, 79, 1], [5, 77, 1], [6, 75, 2.5], [8, 72, 2], [10, 70, 1], [11, 72, 5], [16, 79, 2.5], [18, 84, 6], [24, 82, 2], [26, 79, 6]];
    return line.map(([st, pitch, l]) => ({ t: st * step, len: l * step, pitch, vel: 100 }));
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

const mipCache: Float32Array[][] = [];
let currentPreset = 0;
function readWav16(url: URL): Float32Array {
  const b = Deno.readFileSync(url), v = new DataView(b.buffer), n = (b.length - 44) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768;
  return x;
}

function dspFor(params: Record<string, number>, clock: { bpm: number; zero: number }): InstrumentDSP {
  switch (kind) {
    case "wave": {
      const w = new WavetableDSP(params, SR), t = Math.round(params.table ?? 0);
      mipCache[t] ??= buildMips(parseWav(Deno.readFileSync(new URL(`../public/wavetables/wavetable0${t + 1}.wav`, import.meta.url)).buffer).data);
      w.setMips(mipCache[t]);
      return w;
    }
    case "epiano": return new TineDSP(params, SR);
    case "pluck": return new PluckDSP(params, SR);
    case "organ": return new OrganDSP(params, SR);
    case "anthem": return new AnthemDSP(params, SR);
    case "patch": return new PatchworkDSP(params, SR);
    case "vox": return new VoxDSP(params, SR);
    case "sampler": {
      const d = new SamplerDSP(params, SR);
      const refs = INSTRUMENTS.sampler.presets[currentPreset]?.samples ?? [];
      d.setSamples(refs.map((r) => readWav16(new URL(`../public/sfx/${r.slice(4)}.wav`, import.meta.url))), refs.map(() => 32000));
      return d;
    }
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

/**
 * Loudness: `db` is the RMS over the sounding part; `st` the loudest 400 ms (short-term max, closer to
 * how loud a plucky or decaying sound feels, and what the level matching uses); and the peak.
 */
export function measure([L, R]: Float32Array[]) {
  let sum = 0, cnt = 0, peak = 0;
  const w = Math.round(0.4 * SR), e = new Float64Array(L.length + 1);
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i])), p = (L[i] * L[i] + R[i] * R[i]) / 2;
    peak = Math.max(peak, a);
    if (a > 1e-4) { sum += p; cnt++; }
    e[i + 1] = e[i] + p;
  }
  let best = 0;
  for (let i = 0; i + w <= L.length; i += 441) best = Math.max(best, (e[i + w] - e[i]) / w);
  return { db: 10 * Math.log10(sum / Math.max(1, cnt) + 1e-12), st: 10 * Math.log10(best + 1e-12), peak };
}

if (import.meta.main) {
  if (wavs) Deno.mkdirSync(out, { recursive: true });
  const rows: string[] = [];
  INSTRUMENTS[kind].presets.forEach((p, i) => {
    currentPreset = i;
    let s = 7;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const audio = render(presetParams(kind, i));
    const m = measure(audio);
    const lv = presetParams(kind, i).level ?? 1, want = Math.min(1, lv * Math.pow(10, (TARGET - m.st) / 20));
    rows.push(`${String(i + 1).padStart(2)} ${p.name.padEnd(18)} ${m.st.toFixed(1).padStart(6)} dB st (${m.db.toFixed(1)} rms)  peak ${m.peak.toFixed(2)}  level ${lv.toFixed(2)} -> ${want.toFixed(2)}`);
    if (wavs) Deno.writeFileSync(`${out}/${String(i + 1).padStart(2, "0")}-${p.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.wav`, encodeWav({ numberOfChannels: 2, sampleRate: SR, length: audio[0].length, getChannelData: (c: number) => audio[c] } as unknown as AudioBuffer));
  });
  console.log(rows.join("\n"));
}
