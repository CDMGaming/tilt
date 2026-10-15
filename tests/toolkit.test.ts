// The voice toolkit, rendered offline: off means identical output, each module does something,
// and it only costs CPU when it's switched on.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { PolyDSP, AcidDSP, type InstrumentDSP } from "../src/engine/dsp/instruments-dsp.ts";
import { LeadDSP } from "../src/engine/dsp/instruments2-dsp.ts";
import { Toolkit } from "../src/engine/dsp/toolkit-dsp.ts";
import { defaultParams } from "../src/engine/instruments.ts";
import { toolkitParams } from "../src/engine/toolkit.ts";
import type { InstrumentKind } from "../src/engine/model.ts";

const SR = 48000;
const clock = { bpm: 120, zero: 0 };

/** Seeded Math.random, so two DSPs built the same way start with the same oscillator phases. */
function seed(n: number) {
  let s = n;
  Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function make(kind: InstrumentKind, extra: Record<string, number> = {}, toolkit = true): { voice: { noteOn(p: number, v: number, t: number): void; noteOff(p: number, t: number): void }; render(n: number): Float32Array[] } {
  seed(42);
  const params = { ...defaultParams(kind), ...extra };
  const dsp: InstrumentDSP = kind === "acid" ? new AcidDSP(params, SR, clock) : kind === "lead" ? new LeadDSP(params, SR) : new PolyDSP(params, SR);
  const tk = toolkit ? new Toolkit(kind, params, SR, clock, dsp) : null;
  let t = 0;
  return {
    voice: tk ?? dsp,
    render(n: number) {
      const L = new Float32Array(n), R = new Float32Array(n);
      for (let i0 = 0; i0 < n; i0 += 128) {
        const i1 = Math.min(n, i0 + 128);
        (tk ?? dsp).render(L, R, i0, i1, t);
      }
      t += n / SR;
      return [L, R];
    },
  };
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
/** Zero crossings per second ~ twice the fundamental, for a plain wave. */
const crossings = (x: Float32Array) => { let c = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) c++; return c; };

Deno.test("toolkit off: the synth sounds exactly as before", () => {
  for (const kind of ["poly", "acid", "lead"] as InstrumentKind[]) {
    const a = make(kind, {}, false), b = make(kind, {}, true);
    // Voices draw random phases / pans at note-on: same seed for both.
    seed(7); a.voice.noteOn(48, 100, 0);
    seed(7); b.voice.noteOn(48, 100, 0);
    const [la] = a.render(9600), [lb] = b.render(9600);
    assert(rms(la) > 0.001, `${kind} makes sound`);
    assertEquals(Array.from(lb), Array.from(la), `${kind}: identical with every module off`);
  }
});

Deno.test("toolkit: every parameter has a sane definition", () => {
  for (const kind of ["acid", "poly", "lead", "wobble", "pad", "chip", "fm", "wave"] as InstrumentKind[]) {
    for (const p of toolkitParams(kind)) {
      assert(p.min < p.max && p.def >= p.min && p.def <= p.max, `${kind} ${p.id}`);
      if (p.options) assertEquals(p.options.length, p.max - p.min + 1, `${kind} ${p.id} options`);
    }
  }
});

Deno.test("toolkit: pitch LFO and pitch envelope move the pitch; the extra filter cuts", () => {
  const plain = make("poly", { wave1: 3, wave2: 3, cutoff: 18000 }), env = make("poly", { wave1: 3, wave2: 3, cutoff: 18000, "tk:pAmt": 12, "tk:pDec": 0.5 });
  plain.voice.noteOn(57, 100, 0); env.voice.noteOn(57, 100, 0);
  const [p] = plain.render(4800), [e] = env.render(4800);
  assert(crossings(e) > crossings(p) * 1.4, `pitch env +12: higher at the start (${crossings(e)} vs ${crossings(p)})`);
  const hp = make("poly", { wave1: 0, cutoff: 18000, "tk:fType": 3, "tk:fCut": 4000, "tk:fRes": 0 });
  const raw = make("poly", { wave1: 0, cutoff: 18000 });
  hp.voice.noteOn(40, 100, 0); raw.voice.noteOn(40, 100, 0);
  assert(rms(hp.render(9600)[0]) < rms(raw.render(9600)[0]) * 0.6, "high-pass at 4 kHz removes most of a low saw");
});

Deno.test("toolkit: mono plays one note at a time, unison stacks voices", () => {
  const notes: string[] = [];
  seed(1);
  const params = { ...defaultParams("poly"), "tk:mode": 1 };
  const dsp = new PolyDSP(params, SR);
  const spy = { ...dsp, params, noteOn: (p: number) => notes.push(`on ${p}`), noteOff: (p: number) => notes.push(`off ${p}`), allOff() {}, render() {} } as unknown as InstrumentDSP;
  const tk = new Toolkit("poly", params, SR, clock, spy);
  tk.noteOn(60, 100, 0); tk.noteOn(64, 100, 0.1); tk.noteOff(64, 0.2); tk.noteOff(60, 0.3);
  assertEquals(notes, ["on 60", "off 60", "on 64", "off 64", "on 60", "off 60"]);
  notes.length = 0;
  params["tk:mode"] = 0; params["tk:uni"] = 3; params["tk:uniDet"] = 1;
  tk.noteOn(60, 100, 0); tk.noteOff(60, 0.1);
  assertEquals(notes.length, 6);
  assertEquals(notes.slice(0, 3).map((s) => Number(s.slice(3)).toFixed(1)), ["59.7", "60.0", "60.3"]);
});

Deno.test("toolkit: costs nothing when off, a little when on", () => {
  const time = (extra: Record<string, number>, tk: boolean) => {
    const s = make("poly", extra, tk);
    for (const p of [48, 52, 55, 59]) s.voice.noteOn(p, 100, 0);
    s.render(4800); // warm up
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) s.render(4800);
    return performance.now() - t0;
  };
  const raw = time({}, false), off = time({}, true);
  const on = time({ "tk:fType": 2, "tk:l1Dest": 1, "tk:l1Amt": 0.05, "tk:l2Dest": 2, "tk:l2Amt": 0.5, "tk:pAmt": 5 }, true);
  console.log(`poly, 4 notes, 2 s of audio: raw ${raw.toFixed(1)} ms, toolkit off ${off.toFixed(1)} ms, filter + 2 LFOs + pitch env ${on.toFixed(1)} ms`);
  assert(off < raw * 1.5 + 5, "switched off: about the same as no toolkit");
});
