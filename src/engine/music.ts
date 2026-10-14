// Keys, scales, chords.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface ScaleDef { id: string; name: string; steps: number[] }

export const SCALES: ScaleDef[] = [
  { id: "major", name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: "minor", name: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: "dorian", name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygian", name: "Phrygian", steps: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydian", name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydian", name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  { id: "harmminor", name: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
  { id: "minpenta", name: "Minor pentatonic", steps: [0, 3, 5, 7, 10] },
  { id: "majpenta", name: "Major pentatonic", steps: [0, 2, 4, 7, 9] },
  { id: "blues", name: "Blues", steps: [0, 3, 5, 6, 7, 10] },
  { id: "chromatic", name: "Chromatic", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export function scaleById(id: string): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[1];
}

export function noteName(pitch: number): string {
  return NOTE_NAMES[((pitch % 12) + 12) % 12] + (Math.floor(pitch / 12) - 1);
}

export function inScale(pitch: number, key: number, scaleId: string): boolean {
  const pc = (((pitch - key) % 12) + 12) % 12;
  return scaleById(scaleId).steps.includes(pc);
}

/** Scale degree of a pitch (1 = the root), or 0 when it's out of key. */
export function scaleDegree(pitch: number, key: number, scaleId: string): number {
  const pc = (((pitch - key) % 12) + 12) % 12;
  return scaleById(scaleId).steps.indexOf(pc) + 1;
}

/** Nearest in-scale pitch; ties go down. */
export function snapToScale(pitch: number, key: number, scaleId: string): number {
  for (let d = 0; d < 12; d++) {
    if (inScale(pitch - d, key, scaleId)) return pitch - d;
    if (inScale(pitch + d, key, scaleId)) return pitch + d;
  }
  return pitch;
}

/** Next in-scale pitch above (dir=1) or below (dir=-1). */
export function stepInScale(pitch: number, dir: 1 | -1, key: number, scaleId: string): number {
  let p = pitch + dir;
  for (let i = 0; i < 12 && !inScale(p, key, scaleId); i++) p += dir;
  return p;
}

/**
 * A chord built by stacking scale tones in thirds on the given root, so every
 * chord stays inside the song's scale. Pentatonic/blues scales stack
 * every other tone too, which gives open, consonant voicings.
 */
export function scaleChord(root: number, key: number, scaleId: string, size: 3 | 4): number[] {
  const steps = scaleById(scaleId).steps;
  if (steps.length === 12) return size === 3 ? [root, root + 4, root + 7] : [root, root + 4, root + 7, root + 11];
  const r = snapToScale(root, key, scaleId);
  const pc = (((r - key) % 12) + 12) % 12;
  const deg = steps.indexOf(pc);
  const out: number[] = [];
  for (let i = 0; i < size; i++) {
    const d = deg + i * 2;
    const oct = Math.floor(d / steps.length);
    out.push(r - steps[deg] + steps[d % steps.length] + oct * 12);
  }
  return out;
}

const QUALITIES: [number[], string][] = [
  [[4, 7, 11], "maj7"], [[4, 7, 10], "7"], [[3, 7, 10], "m7"], [[3, 6, 10], "m7b5"], [[3, 7, 11], "mMaj7"],
  [[3, 6, 9], "dim7"], [[4, 8, 11], "+maj7"], [[4, 7], ""], [[3, 7], "m"], [[3, 6], "dim"], [[4, 8], "+"],
  [[2, 7], "sus2"], [[5, 7], "sus4"],
];

/** Name of a chord given its pitches, root first (e.g. "Dm", "Cmaj7"). */
export function chordName(pitches: number[]): string {
  if (!pitches.length) return "";
  const root = pitches[0];
  const iv = [...new Set(pitches.slice(1).map((p) => (((p - root) % 12) + 12) % 12))].sort((a, b) => a - b);
  const q = QUALITIES.find(([q]) => q.length === iv.length && q.every((x, i) => x === iv[i]));
  return NOTE_NAMES[((root % 12) + 12) % 12] + (q ? q[1] : "");
}
