// Phrase grid: 5 roles x 5 starter phrases, generated for the song's key,
// scale and tempo. Every cell shares one chord progression, so any
// combination fits together. Same seed = same grid.

import { PPQ, TICKS_PER_BAR } from "./model";
import { scaleById } from "./music";
import { Rng } from "./rng";

export type Role = "drums" | "bass" | "chords" | "lead" | "arp";
export const ROLES: Role[] = ["drums", "bass", "chords", "lead", "arp"];
export const ROLE_NAMES: Record<Role, string> = { drums: "Drums", bass: "Bass", chords: "Chords", lead: "Lead", arp: "Arp" };

/** A phrase note. Drums: pitch is a Kitbox part index 0..7 (mapped per instrument on load). */
export interface PNote { pitch: number; start: number; len: number; vel: number }
export interface Phrase { role: Role; name: string; bars: number; notes: PNote[] }
export interface PhraseGrid { progression: number[]; progressionName: string; cells: Phrase[][] } // cells[row][col]

const S16 = PPQ / 4; // one 16th

// Chords are built from the 7-note scale the song's scale belongs to.
const PARENT: Record<string, string> = { minpenta: "minor", blues: "minor", majpenta: "major", chromatic: "minor" };
const MINORISH = new Set(["minor", "dorian", "phrygian", "harmminor", "minpenta", "blues"]);
const MINOR_PROGS: [number[], string][] = [[[0, 5, 2, 6], "i–VI–III–VII"], [[0, 3, 4, 0], "i–iv–v–i"], [[0, 6, 5, 6], "i–VII–VI–VII"], [[0, 5, 3, 4], "i–VI–iv–v"], [[0, 0, 5, 6], "i–i–VI–VII"]];
const MAJOR_PROGS: [number[], string][] = [[[0, 4, 5, 3], "I–V–vi–IV"], [[0, 5, 3, 4], "I–vi–IV–V"], [[0, 3, 0, 4], "I–IV–I–V"], [[5, 3, 0, 4], "vi–IV–I–V"], [[0, 1, 3, 4], "I–ii–IV–V"]];

export function makeGrid(key: number, scale: string, tempo: number, seed: number): PhraseGrid {
  const r = new Rng(seed);
  const parent = PARENT[scale] ?? scale;
  const steps = scaleById(parent).steps.length === 7 ? scaleById(parent).steps : scaleById("minor").steps;
  const [progression, progressionName] = r.pick(MINORISH.has(scale) ? MINOR_PROGS : MAJOR_PROGS);
  const safe = scaleById(scale).steps; // melodies stay in the song's actual scale (pentatonic stays pentatonic)

  /** Pitch of a scale degree (any integer) in a given octave (MIDI octave number). */
  const deg = (d: number, oct: number) => (oct + 1) * 12 + key + steps[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const triad = (d: number, oct: number, size = 3) => Array.from({ length: size }, (_, i) => deg(d + i * 2, oct));
  const inSafe = (p: number) => safe.includes((((p - key) % 12) + 12) % 12);

  const cols: Phrase[][] = [
    drumPhrases(r, tempo),
    bassPhrases(r, progression, deg),
    chordPhrases(r, progression, triad),
    leadPhrases(r, progression, deg, triad, inSafe),
    arpPhrases(r, progression, triad),
  ];
  const cells = Array.from({ length: 5 }, (_, row) => cols.map((c) => c[row]));
  return { progression, progressionName, cells };
}

// ------------------------------------------------------------ drums (2 bars, Kitbox parts)

const K = 0, SN = 1, CL = 2, CH = 3, OH = 4, TM = 5, RM = 6, PC = 7;

interface Groove { name: string; steps: [number, number[], number?][] } // [part, 16th steps in a bar, velocity]

const GROOVES: (Groove & { tempo: [number, number] })[] = [
  { name: "Four on the floor", tempo: [110, 140], steps: [[K, [0, 4, 8, 12]], [CL, [4, 12]], [CH, [2, 6, 10, 14]], [OH, [14], 70]] },
  { name: "Breakbeat", tempo: [85, 140], steps: [[K, [0, 10]], [SN, [4, 12]], [CH, [0, 2, 4, 6, 8, 10, 12, 14]], [SN, [7, 15], 45]] },
  { name: "Boom bap", tempo: [70, 100], steps: [[K, [0, 7, 10]], [SN, [4, 12]], [CH, [0, 2, 4, 6, 8, 10, 12, 14], 80], [RM, [15], 50]] },
  { name: "Half-time trap", tempo: [65, 160], steps: [[K, [0, 11]], [CL, [8]], [CH, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 70]] },
  { name: "Two-step", tempo: [120, 140], steps: [[K, [0, 10]], [SN, [4, 12]], [CH, [2, 6, 10, 14]], [RM, [3, 11], 60]] },
  { name: "Electro", tempo: [100, 135], steps: [[K, [0, 6, 10]], [CL, [4, 12]], [CH, [0, 2, 4, 6, 8, 10, 12, 14], 75], [PC, [14], 70]] },
  { name: "Minimal", tempo: [118, 132], steps: [[K, [0, 4, 8, 12]], [RM, [3, 7, 11], 60], [CH, [2, 6, 10, 14], 65], [PC, [5, 13], 55]] },
  { name: "Tribal toms", tempo: [90, 130], steps: [[K, [0, 8]], [TM, [3, 6, 10, 13]], [CH, [2, 6, 10, 14], 60], [SN, [12]]] },
];

function drumPhrases(r: Rng, tempo: number): Phrase[] {
  const fit = GROOVES.filter((g) => tempo >= g.tempo[0] - 10 && tempo <= g.tempo[1] + 10);
  const pool = [...fit, ...GROOVES.filter((g) => !fit.includes(g))];
  const chosen: typeof GROOVES = [];
  while (chosen.length < 5) {
    const take = r.chance(0.8) && fit.some((g) => !chosen.includes(g)) ? fit.filter((g) => !chosen.includes(g)) : pool.filter((g) => !chosen.includes(g));
    chosen.push(r.pick(take));
  }
  return chosen.map((g) => {
    const notes: PNote[] = [];
    for (let bar = 0; bar < 2; bar++) {
      for (const [part, steps, vel] of g.steps) {
        for (const s of steps) {
          // Accent the downbeats, and vary the second bar a little.
          if (bar === 1 && part !== K && r.chance(0.08)) continue;
          notes.push({ pitch: part, start: bar * TICKS_PER_BAR + s * S16, len: S16, vel: Math.min(127, (vel ?? 100) + (s % 4 === 0 ? 10 : 0)) });
        }
      }
      if (bar === 1 && r.chance(0.6)) {
        // A small fill at the end of bar 2.
        for (const s of [13, 14, 15]) notes.push({ pitch: r.pick([SN, TM, SN]), start: TICKS_PER_BAR + s * S16, len: S16, vel: 70 + s * 2 });
      }
    }
    return { role: "drums" as Role, name: g.name, bars: 2, notes: dedupe(notes) };
  });
}

// ------------------------------------------------------------ bass (4 bars, one chord per bar)

function bassPhrases(r: Rng, prog: number[], deg: (d: number, oct: number) => number): Phrase[] {
  const root = (d: number) => { let p = deg(d, 2); while (p > 47) p -= 12; while (p < 33) p += 12; return p; };
  // Interval (semitones) from a chord's root to the scale degree `steps` above it: always in key.
  const iv = (d: number, steps: number) => deg(d + steps, 2) - deg(d, 2);
  const make = (name: string, perBar: (rootP: number, bar: number, d: number) => PNote[]): Phrase =>
    ({ role: "bass", name, bars: 4, notes: prog.flatMap((d, bar) => perBar(root(d), bar, d).map((n) => ({ ...n, start: n.start + bar * TICKS_PER_BAR }))) });
  const all = [
    make("Root eighths", (p) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ pitch: p, start: s * S16, len: S16 * 1.6, vel: s % 4 === 0 ? 110 : 90 }))),
    make("Offbeat pump", (p) => [2, 6, 10, 14].map((s) => ({ pitch: p, start: s * S16, len: S16 * 1.5, vel: 105 }))),
    make("Octave bounce", (p) => [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => ({ pitch: i % 2 ? p + 12 : p, start: s * S16, len: S16, vel: i % 2 ? 85 : 110 }))),
    make("Acid sixteenths", (p, bar, d) => {
      const rr = new Rng(prog[bar] * 97 + bar);
      const out: PNote[] = [];
      for (let s = 0; s < 16; s++) {
        if (s % 4 !== 0 && rr.chance(0.35)) continue;
        const up = rr.chance(0.3) ? 12 : rr.chance(0.2) ? iv(d, 4) : 0;
        const slide = rr.chance(0.2);
        out.push({ pitch: p + up, start: s * S16, len: slide ? S16 * 1.6 : S16 * 0.8, vel: rr.chance(0.25) ? 120 : 90 });
      }
      return out;
    }),
    make("Syncopated", (p, _b, d) => [{ s: 0, l: 5 }, { s: 6, l: 3 }, { s: 10, l: 2 }, { s: 13, l: 3 }].map(({ s, l }, i) => ({ pitch: i === 2 ? p + iv(d, 4) : p, start: s * S16, len: l * S16, vel: 100 }))),
    make("Long roots", (p) => [{ pitch: p, start: 0, len: TICKS_PER_BAR - S16, vel: 100 }]),
    make("Walking", (p, _b, d) => [0, 4, 8, 12].map((s, i) => ({ pitch: p + [0, iv(d, 2), iv(d, 4), iv(d, 6) - 12][i], start: s * S16, len: S16 * 3, vel: 95 }))),
  ];
  return shuffle(r, all).slice(0, 5);
}

// ------------------------------------------------------------ chords (4 bars)

function chordPhrases(r: Rng, prog: number[], triad: (d: number, oct: number, size?: number) => number[]): Phrase[] {
  const voiced = (d: number, size = 3) => { const c = triad(d, 4, size); while (c[0] > 64) c.forEach((_, i) => (c[i] -= 12)); return c; };
  const make = (name: string, hits: { s: number; l: number; v?: number }[], size = 3): Phrase => ({
    role: "chords", name, bars: 4,
    notes: prog.flatMap((d, bar) => hits.flatMap((h) => voiced(d, size).map((p) => ({ pitch: p, start: bar * TICKS_PER_BAR + h.s * S16, len: h.l * S16, vel: h.v ?? 90 })))),
  });
  const all = [
    make("Held chords", [{ s: 0, l: 16, v: 85 }]),
    make("Offbeat stabs", [2, 6, 10, 14].map((s) => ({ s, l: 1.5, v: 100 }))),
    make("Push rhythm", [{ s: 0, l: 3 }, { s: 6, l: 3 }, { s: 12, l: 3 }]),
    make("Eighth pulse", [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, l: 1.5, v: s % 4 ? 75 : 95 }))),
    make("Sevenths", [{ s: 0, l: 8, v: 85 }, { s: 8, l: 8, v: 75 }], 4),
    make("Late hits", [{ s: 3, l: 2 }, { s: 11, l: 4 }]),
  ];
  return shuffle(r, all).slice(0, 5);
}

// ------------------------------------------------------------ lead (4 bars, call and response)

function leadPhrases(r: Rng, prog: number[], deg: (d: number, oct: number) => number, triad: (d: number, oct: number) => number[], inSafe: (p: number) => boolean): Phrase[] {
  const rhythms: [string, number[][]][] = [
    ["Call & answer", [[0, 3, 6, 8], [0, 2, 4, 10]]],
    ["Long tones", [[0, 8], [0, 6, 12]]],
    ["Busy hook", [[0, 2, 3, 6, 8, 10, 11, 14], [0, 3, 6, 8, 12]]],
    ["Syncopated", [[2, 5, 8, 11], [0, 3, 6, 10, 13]]],
    ["Rising line", [[0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8]]],
    ["Off-beat", [[1, 4, 7, 10, 13], [2, 6, 10]]],
  ];
  return shuffle(r, rhythms).slice(0, 5).map(([name, [call, answer]]) => {
    const rr = new Rng(r.int(0, 1e9));
    const notes: PNote[] = [];
    let last = deg(prog[0], 4) + 12;
    prog.forEach((d, bar) => {
      const hits = bar % 2 === 0 ? call : answer;
      const tones = triad(d, 5);
      hits.forEach((s, i) => {
        // Chord tones on strong beats, scale steps between; small leaps only.
        let p: number;
        if (s % 4 === 0 || i === 0) p = tones.reduce((a, b) => (Math.abs(b - last) < Math.abs(a - last) ? b : a));
        else { p = last + (rr.chance(0.5) ? 1 : -1) * rr.int(1, 3); let guard = 0; while (!inSafe(p) && guard++ < 6) p += 1; }
        if (name === "Rising line") p = deg(d + i, 4) + 12;
        // Snap into the song's own scale (pentatonic songs keep pentatonic leads).
        for (let k = 0; k < 6 && !inSafe(p); k++) p = inSafe(p - k - 1) ? p - k - 1 : inSafe(p + k + 1) ? p + k + 1 : p;
        while (p > 84) p -= 12;
        while (p < 60) p += 12;
        const next = hits[i + 1] ?? 16;
        notes.push({ pitch: p, start: bar * TICKS_PER_BAR + s * S16, len: Math.max(1, next - s - (name === "Long tones" ? 0 : 0.5)) * S16, vel: s % 4 === 0 ? 105 : 88 });
        last = p;
      });
    });
    return { role: "lead" as Role, name, bars: 4, notes };
  });
}

// ------------------------------------------------------------ arp (4 bars)

function arpPhrases(r: Rng, prog: number[], triad: (d: number, oct: number, size?: number) => number[]): Phrase[] {
  const shapes: [string, number, (c: number[]) => number[]][] = [
    ["Up 16ths", 1, (c) => [...c, c[0] + 12]],
    ["Down 16ths", 1, (c) => [c[0] + 12, ...[...c].reverse()]],
    ["Up-down", 1, (c) => [...c, c[0] + 12, c[2], c[1]]],
    ["Broken 8ths", 2, (c) => [c[0], c[2], c[1], c[2]]],
    ["Octave skip", 1, (c) => [c[0], c[0] + 12, c[1], c[1] + 12, c[2], c[2] + 12]],
    ["Triplet roll", 0, (c) => [...c]],
  ];
  return shuffle(r, shapes).slice(0, 5).map(([name, stepMul, shape]) => {
    const notes: PNote[] = [];
    prog.forEach((d, bar) => {
      const seq = shape(triad(d, 4, 3).map((p) => (p > 72 ? p - 12 : p)));
      const step = stepMul === 0 ? PPQ / 6 : S16 * stepMul; // 0 = 16th triplets
      for (let t = 0, i = 0; t < TICKS_PER_BAR; t += step, i++) {
        notes.push({ pitch: seq[i % seq.length], start: bar * TICKS_PER_BAR + Math.round(t), len: Math.round(step * 0.8), vel: i % 4 === 0 ? 100 : 80 });
      }
    });
    return { role: "arp" as Role, name, bars: 4, notes };
  });
}

// ------------------------------------------------------------ helpers

function shuffle<T>(r: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function dedupe(notes: PNote[]): PNote[] {
  const seen = new Set<string>();
  return notes.filter((n) => { const k = `${n.pitch}:${n.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Map Kitbox part indices to another drum instrument's pads. */
export function mapDrumPart(part: number, pads: number, kind?: string): number {
  // Thump Lab has Kitbox's order, with one tom pad more: rim and perc both go to its Perc.
  if (kind === "analog") return [0, 1, 2, 3, 4, 5, 7, 7][part] ?? 0;
  if (kind === "chop") return [0, 4, 12, 2, 6, 8, 10, 14][part] ?? 0; // slices of a two-bar break, roughly where those hits are
  if (kind === "garage") return [0, 1, 1, 3, 4, 5, 2, 3][part] ?? 0; // claps on the snare, perc on the hat
  if (kind === "boom") return [1, 3, 3, 2, 0, 1, 3, 2][part] ?? 1; // kicks hit, snares stab
  return part < pads ? part : 0;
}

/** Stable seed from a share code (so friends get the same grid). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
