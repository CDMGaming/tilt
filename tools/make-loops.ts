// Renders Chop's built-in breakbeat loops to public/loops/<name>.wav: original two-bar patterns
// played on Garage's CC0 kit (and two on Kitbox's synthesised kits), 16-bit mono at 32 kHz.
// The loop list and tempos must match CHOP_LOOPS in src/engine/instruments4.ts.
// Run: deno run -A --sloppy-imports tools/make-loops.ts

import { DrumsDSP } from "../src/engine/dsp/instruments-dsp.ts";
import { GarageDSP } from "../src/engine/dsp/instruments4-dsp.ts";
import { presetParams, KIT_SAMPLES } from "../src/engine/instruments.ts";
import { INSTRUMENTS } from "../src/engine/instruments.ts";
import { sampleSetRefs } from "../src/engine/instruments4.ts";
import { wav16 } from "./make-samples.ts";

const SR = 32000;
const read16 = (url: URL) => { const b = Deno.readFileSync(url), v = new DataView(b.buffer), n = (b.length - 44) / 2, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768; return x; };

/** A pattern: per part, 32 sixteenths over two bars: "." rest, "x" hit, "o" ghost, "X" accent. Parts: kick, snare, rim, closed hat, open hat, high tom, low tom, cymbal. */
type Pattern = Partial<Record<number, string>>;
interface Loop { name: string; bpm: number; swing: number; kit: "garage" | "kitbox"; preset: string; p: Pattern }

export const LOOPS: Loop[] = [
  { name: "funk-break", bpm: 96, swing: 0.12, kit: "garage", preset: "Dry Funk", p: {
    0: "X.....x...x.....X.....x..x......", 1: "....X..o.o..X..o....X..o.o..X.o.", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", 4: "..............x...............x." } },
  { name: "boom-bap", bpm: 90, swing: 0.25, kit: "garage", preset: "Hip Hop Kit", p: {
    0: "X......x..X.....X.......x.x.....", 1: "....X.......X.......X.......X...", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.xxx." } },
  { name: "jungle", bpm: 170, swing: 0, kit: "garage", preset: "Breakbeat", p: {
    0: "X.........X.......X.X...........", 1: "....X..o.o..X..o....X..o.o..XoX.", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", 7: "X..............................." } },
  { name: "shuffle", bpm: 110, swing: 0.4, kit: "garage", preset: "Session", p: {
    0: "X.....x...X.....X.....x...X..x..", 1: "....X.......X.......X.......X...", 3: "x.xx.xx.xx.xx.xx.xx.xx.xx.xx.xx.", 4: "..............x..............." } },
  { name: "rock", bpm: 120, swing: 0, kit: "garage", preset: "Big Rock", p: {
    0: "X.......X.X.....X.......X.X.....", 1: "....X.......X.......X.......X...", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", 7: "X...............................", 5: "............................xx..", 6: "..............................xx" } },
  { name: "half-time", bpm: 140, swing: 0, kit: "garage", preset: "Arena", p: {
    0: "X.........x.....X......x..x.....", 1: "........X...............X.......", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.xxx.x.", 4: "......x...............x........." } },
  { name: "brushy", bpm: 85, swing: 0.3, kit: "garage", preset: "Soft Brushes-ish", p: {
    0: "X.......x.......X.......x.......", 1: "....x..o....x..o....x..o....x.oo", 7: "x..x..x.x..x..x.x..x..x.x..x..x." } },
  { name: "disco", bpm: 118, swing: 0, kit: "garage", preset: "Studio Kit", p: {
    0: "X...X...X...X...X...X...X...X...", 1: "....X.......X.......X.......X...", 3: "x...x...x...x...x...x...x...x...", 4: "..x...x...x...x...x...x...x...x." } },
  { name: "breakbeat", bpm: 130, swing: 0.08, kit: "garage", preset: "Punk", p: {
    0: "X.X.......X.......X.X.....x.....", 1: "....X......oX..o....X......oX..o", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." } },
  { name: "latin", bpm: 105, swing: 0.1, kit: "garage", preset: "Jazz Club", p: {
    0: "X..x..x.X..x..x.X..x..x.X..x..x.", 2: "..x..x....x..x....x..x....x..x..", 5: "....x.......x.......x.......xx..", 6: "......x.x.....x.......x.x.....x.", 7: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." } },
  { name: "electro-break", bpm: 125, swing: 0, kit: "kitbox", preset: "Electro", p: {
    0: "X.....X.......X...X.....X.......", 1: "....X.......X.......X.......X...", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", 7: "......x...........x.........x..." } },
  { name: "lofi-break", bpm: 80, swing: 0.3, kit: "kitbox", preset: "Lo-fi Dusty", p: {
    0: "X......x..X.......x..x....X.....", 1: "....X.......X.......X.......X...", 3: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x." } },
];

if (import.meta.main) {
  const out = new URL("../public/loops/", import.meta.url);
  Deno.mkdirSync(out, { recursive: true });
  const kit = KIT_SAMPLES.map((n) => read16(new URL(`../public/kit/${n}.wav`, import.meta.url)));
  for (const loop of LOOPS) {
    const step = 60 / loop.bpm / 4, len = Math.round(32 * step * SR), tail = Math.round(0.5 * SR);
    let d: { noteOn(p: number, v: number, t: number): void; render(L: Float32Array, R: Float32Array, a: number, b: number, t: number): void };
    if (loop.kit === "garage") {
      const idx = INSTRUMENTS.garage.presets.findIndex((p) => p.name === loop.preset), params = presetParams("garage", Math.max(0, idx));
      const g = new GarageDSP(params, SR), refs = sampleSetRefs({ kind: "garage", params } as never) ?? [];
      g.setSamples(refs.map((r) => read16(new URL(`../public/${r.slice(6)}.wav`, import.meta.url))), refs.map(() => 32000));
      d = g;
    } else {
      const idx = INSTRUMENTS.drums.presets.findIndex((p) => p.name === loop.preset), params = presetParams("drums", Math.max(0, idx));
      const k = new DrumsDSP(params, kit, SR); k.samplesRate = 32000; d = k;
    }
    // Events: hits with swing on the off-sixteenths and a little velocity life.
    const events: { at: number; part: number; vel: number }[] = [];
    let seed = loop.bpm;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [part, row] of Object.entries(loop.p)) {
      [...row!].forEach((c, s) => {
        if (c === ".") return;
        const at = (s + (s % 2 ? loop.swing : 0)) * step;
        const vel = c === "X" ? 120 : c === "o" ? 45 + rnd() * 15 : 85 + rnd() * 20;
        events.push({ at, part: Number(part), vel });
      });
    }
    events.sort((a, b) => a.at - b.at);
    const L = new Float32Array(len + tail), R = new Float32Array(len + tail);
    let k = 0;
    for (let i0 = 0; i0 < L.length; i0 += 64) {
      const t = i0 / SR;
      while (k < events.length && events[k].at <= t) { d.noteOn(36 + events[k].part, events[k].vel, t); k++; }
      d.render(L, R, i0, Math.min(L.length, i0 + 64), t);
    }
    // Fold the tail onto the start so the loop wraps seamlessly, then normalise.
    const y = new Float32Array(len);
    for (let i = 0; i < len; i++) y[i] = (L[i] + R[i]) * 0.5 + (i < tail ? (L[len + i] + R[len + i]) * 0.5 : 0);
    let pk = 0;
    for (const v of y) pk = Math.max(pk, Math.abs(v));
    Deno.writeFileSync(new URL(`${loop.name}.wav`, out), wav16(y.map((v) => (v * 0.89) / pk)));
    console.log(loop.name, (len / SR).toFixed(2) + "s");
  }
  Deno.writeTextFileSync(new URL("LICENSE.txt", out), [
    "Breakbeat loops for Chop: original patterns rendered by tools/make-loops.ts for TILT,",
    "played on Garage's kit (CC0 samples from VCSL and VSCO 2 CE, see public/garage/LICENSE.txt)",
    "and Kitbox's synthesised kits (CC0). Released under CC0 1.0 (public domain dedication).", "",
  ].join("\n"));
}
