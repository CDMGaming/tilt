// Stress test for every instrument: a dense, loud chord (or every drum part at once) on every preset.
// Reports the worst peak at the track output (the mixer's default gain included) and the CPU cost
// as a share of real time for one track, so crackle (clipping or dropouts) can be found and fixed.
//   deno run -A --sloppy-imports tools/stress.ts [kind]

import { INSTRUMENTS, KIT_SAMPLES, presetParams } from "../src/engine/instruments.ts";
import type { InstrumentKind } from "../src/engine/model.ts";
import { AcidDSP, DrumsDSP, PolyDSP, type InstrumentDSP } from "../src/engine/dsp/instruments-dsp.ts";
import { LeadDSP, PadDSP, WobbleDSP } from "../src/engine/dsp/instruments2-dsp.ts";
import { ThumpLabDSP } from "../src/engine/dsp/thumplab-dsp.ts";
import { ChipDSP, FmDSP, SamplerDSP, WavetableDSP } from "../src/engine/dsp/instruments3-dsp.ts";
import { AnthemDSP, OrganDSP, PluckDSP, TineDSP } from "../src/engine/dsp/instruments4-dsp.ts";
import { Toolkit } from "../src/engine/dsp/toolkit-dsp.ts";
import { makeFx } from "../src/engine/dsp/fx-dsp.ts";
import { hasToolkit } from "../src/engine/toolkit.ts";
import { buildMips, parseWav } from "../src/engine/wavetable.ts";

const SR = 48000, MIX = 0.8 * 0.8 * 1.25; // the mixer's default fader (0.8, squared curve)
const wav16 = (url: URL) => { const b = Deno.readFileSync(url), v = new DataView(b.buffer), n = (b.length - 44) / 2, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768; return x; };
const kit = KIT_SAMPLES.map((n) => wav16(new URL(`../public/kit/${n}.wav`, import.meta.url)));
const mips: Float32Array[][] = [];

function dsp(kind: InstrumentKind, params: Record<string, number>, preset: number): InstrumentDSP {
  const clock = { bpm: 125, zero: 0 };
  switch (kind) {
    case "drums": { const d = new DrumsDSP(params, kit, SR); d.samplesRate = 32000; return d; }
    case "analog": return new ThumpLabDSP(params, SR);
    case "acid": return new AcidDSP(params, SR, clock);
    case "lead": return new LeadDSP(params, SR);
    case "wobble": return new WobbleDSP(params, SR, clock);
    case "pad": return new PadDSP(params, SR);
    case "chip": return new ChipDSP(params, SR);
    case "fm": return new FmDSP(params, SR);
    case "wave": {
      const w = new WavetableDSP(params, SR), t = Math.round(params.table ?? 0);
      mips[t] ??= buildMips(parseWav(Deno.readFileSync(new URL(`../public/wavetables/wavetable0${t + 1}.wav`, import.meta.url)).buffer).data);
      w.setMips(mips[t]);
      return w;
    }
    case "sampler": {
      const d = new SamplerDSP(params, SR), refs = INSTRUMENTS.sampler.presets[preset]?.samples ?? [];
      d.setSamples(refs.map((r) => wav16(new URL(`../public/sfx/${r.slice(4)}.wav`, import.meta.url))), refs.map(() => 32000));
      return d;
    }
    case "epiano": return new TineDSP(params, SR);
    case "pluck": return new PluckDSP(params, SR);
    case "organ": return new OrganDSP(params, SR);
    case "anthem": return new AnthemDSP(params, SR);
    default: return new PolyDSP(params, SR);
  }
}

export function stress(kind: InstrumentKind) {
  const drums = !!INSTRUMENTS[kind].drumParts;
  // Synths: a wide 6-note chord at full velocity (Chordette expands each key itself, so 3 keys). Drums: every part.
  const notes = drums ? [36, 37, 38, 39, 40, 41, 42, 43] : kind === "poly" ? [48, 55] : [48, 55, 60, 64];
  let worst = { peak: 0, name: "" }, cpu = 0;
  const peaks: { name: string; peak: number; level: number }[] = [];
  INSTRUMENTS[kind].presets.forEach((p, i) => {
    let s = 9;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const params = presetParams(kind, i);
    if (p.samples && kind !== "sampler") void 0;
    const clock = { bpm: 125, zero: 0 };
    const d = dsp(kind, params, i);
    const voice = hasToolkit(kind) ? new Toolkit(kind, params, SR, clock, d) : d;
    const it = Math.round(params["ifx:type"] ?? 0), fx = it ? makeFx(it, SR) : null;
    const n = SR * 2, L = new Float32Array(128), R = new Float32Array(128);
    let peak = 0;
    const t0 = performance.now();
    for (let i0 = 0; i0 < n; i0 += 128) {
      const t = i0 / SR;
      if (i0 === 0 || i0 === SR / 2 * 2 - (SR % 128)) for (const pitch of notes) voice.noteOn(pitch, 110, t);
      if (Math.abs(t - 1.5) < 128 / SR) for (const pitch of notes) voice.noteOff(pitch, t);
      L.fill(0); R.fill(0);
      voice.render(L, R, 0, 128, t);
      fx?.process(L, R, 128, params["ifx:a"] ?? 0.5, params["ifx:b"] ?? 0.5, t, clock);
      for (let k = 0; k < 128; k++) peak = Math.max(peak, Math.abs(L[k]) * MIX, Math.abs(R[k]) * MIX);
    }
    const ms = performance.now() - t0;
    cpu = Math.max(cpu, ms / 2000);
    if (peak > worst.peak) worst = { peak, name: p.name };
    peaks.push({ name: p.name, peak, level: params.level ?? 1 });
  });
  return { worst, cpu, peaks };
}

if (import.meta.main) {
  const json = Deno.args.includes("--json");
  const kinds = (Deno.args[0] && !Deno.args[0].startsWith("--") ? [Deno.args[0]] : Object.keys(INSTRUMENTS)) as InstrumentKind[];
  if (json) { console.log(JSON.stringify(Object.fromEntries(kinds.map((k) => [k, stress(k).peaks])))); Deno.exit(0); }
  for (const k of kinds) {
    const r = stress(k);
    console.log(`${INSTRUMENTS[k].name.padEnd(11)} worst peak ${r.worst.peak.toFixed(2)} (${r.worst.name})  cpu ${(r.cpu * 100).toFixed(1)}% of real time`);
  }
}
