// Part-card macros: 4-5 big knobs per part role. Each turns several instrument params at once,
// always between two settings that sound good (a at 0, b at 1), so no position sounds wrong.
// Some macros change what is played instead (Riff, Follow, Octave, Energy, Feel): build.ts reads
// those when it writes the notes.

import type { InstrumentKind, Track } from "../engine/model";
import type { Role } from "./pack";

/** One param a macro moves: "cutoff", "ifx:a", "mix:send"... `int`: round (drawbars, steps). */
export interface Target { key: string; a: number; b: number; int?: boolean; curve?: "exp" }

export interface MacroDef {
  id: string;
  label: string;
  /** Where the knob rests (and returns to on double-click / press). */
  home: number;
  /** Changes the notes, not the sound (applied on the next bar). */
  render?: boolean;
  /** Stepped knobs: their positions' names (the value snaps to them). */
  steps?: string[];
  /** Params per instrument kind; `all` for every kind. */
  targets?: Partial<Record<InstrumentKind | "guitar" | "all", Target[]>>;
  hint: string;
}

const LEVEL: MacroDef = { id: "level", label: "Level", home: 0.7, targets: { all: [{ key: "mix:vol", a: 0.25, b: 1 }] }, hint: "How loud this part is in the band" };
const SPACE: MacroDef = {
  id: "space", label: "Space", home: 0.35, hint: "From dry and close to far back in a big room",
  targets: {
    all: [{ key: "mix:send", a: 0.02, b: 0.55 }],
    piano: [{ key: "room", a: 0.08, b: 0.75 }],
    pluck: [{ key: "room", a: 0.05, b: 0.6 }],
    guitar: [{ key: "room", a: 0.02, b: 0.55 }],
    vox: [{ key: "release", a: 0.4, b: 2.5, curve: "exp" }],
    anthem: [{ key: "diffuse", a: 0.1, b: 0.7 }],
  },
};
const RIFF: MacroDef = { id: "riff", label: "Riff", home: 0.5, render: true, hint: "Simpler (left) or busier (right): the same riff, thinned out or doubled up" };

export const ROLE_MACROS: Record<Role, MacroDef[]> = {
  drums: [
    {
      id: "energy", label: "Energy", home: 0.55, render: true, hint: "Soft and sparse to hard-hitting, with crashes",
      targets: { garage: [{ key: "smash", a: 0.05, b: 0.75 }, { key: "p1level", a: 0.7, b: 0.95 }, { key: "p7level", a: 0.3, b: 0.6 }] },
    },
    { id: "feel", label: "Feel", home: 0.25, render: true, hint: "Straight (left) to a lazy shuffle (right); the whole band follows" },
    {
      id: "room", label: "Room", home: 0.45, hint: "Tight and dry to a huge hall",
      targets: { garage: [{ key: "room", a: 0.03, b: 0.95 }], all: [{ key: "mix:send", a: 0.02, b: 0.3 }] },
    },
    {
      id: "crunch", label: "Crunch", home: 0.15, hint: "Clean to crushed, like a cheap mic pushed too hard",
      targets: { all: [{ key: "ifx:type", a: 6, b: 6 }, { key: "ifx:a", a: 0, b: 0.75 }, { key: "ifx:b", a: 0.8, b: 0.45 }] },
    },
    LEVEL,
  ],
  bass: [
    {
      id: "drive", label: "Drive", home: 0.3, hint: "Round and clean to gritty",
      targets: {
        pluck: [{ key: "bright", a: -0.4, b: 0.7 }, { key: "pick", a: 0.25, b: 0.9 }],
        all: [{ key: "ifx:type", a: 6, b: 6 }, { key: "ifx:a", a: 0, b: 0.6 }, { key: "ifx:b", a: 0.75, b: 0.55 }],
      },
    },
    { id: "follow", label: "Follow", home: 0.5, render: true, hint: "Long roots (left), the riff (middle), locked to the kick drum (right)" },
    { id: "octave", label: "Octave", home: 0.5, render: true, steps: ["Low", "Home", "High"], hint: "An octave down, home or up" },
    LEVEL,
  ],
  guitar: [
    {
      id: "gain", label: "Gain", home: 0.6, hint: "Clean, crunch, high gain",
      targets: {
        guitar: [{ key: "gain", a: 0.02, b: 1 }],
        pluck: [{ key: "ifx:type", a: 6, b: 6 }, { key: "ifx:a", a: 0.05, b: 0.95 }, { key: "ifx:b", a: 0.8, b: 0.4 }],
      },
    },
    {
      id: "tone", label: "Tone", home: 0.55, hint: "Dark and warm to bright and cutting",
      targets: { guitar: [{ key: "tone", a: 0.08, b: 0.95 }], pluck: [{ key: "bright", a: -0.6, b: 0.8 }] },
    },
    RIFF,
    {
      id: "width", label: "Width", home: 0.5, hint: "One amp in the middle to a wall of doubled guitars",
      targets: { guitar: [{ key: "width", a: 0, b: 1 }], pluck: [{ key: "room", a: 0.05, b: 0.45 }] },
    },
    LEVEL,
  ],
  keys: [
    {
      id: "bright", label: "Brightness", home: 0.5, hint: "Soft and dark to bright and present",
      targets: {
        organ: [{ key: "db3", a: 0, b: 7, int: true }, { key: "db5", a: 0, b: 6, int: true }, { key: "drive", a: 0.05, b: 0.45 }],
        piano: [{ key: "high", a: -8, b: 6 }, { key: "character", a: 0.15, b: 0.8 }],
        anthem: [{ key: "shine", a: 0, b: 0.85 }, { key: "cutoff", a: 1200, b: 14000, curve: "exp" }],
        vox: [{ key: "vowelX", a: 0.15, b: 0.85 }, { key: "breath", a: 0.35, b: 0.05 }],
        lead: [{ key: "cutoff", a: 900, b: 12000, curve: "exp" }],
        guitar: [{ key: "tone", a: 0.1, b: 0.9 }],
      },
    },
    SPACE,
    RIFF,
    LEVEL,
  ],
  lead: [
    {
      id: "bright", label: "Brightness", home: 0.55, hint: "Smooth and singing to bright and screaming",
      targets: {
        guitar: [{ key: "tone", a: 0.2, b: 1 }, { key: "gain", a: 0.55, b: 1 }],
        anthem: [{ key: "shine", a: 0, b: 0.9 }, { key: "cutoff", a: 1500, b: 15000, curve: "exp" }],
        lead: [{ key: "cutoff", a: 1000, b: 14000, curve: "exp" }, { key: "scream", a: 0, b: 0.5 }],
        organ: [{ key: "db3", a: 2, b: 8, int: true }, { key: "drive", a: 0.15, b: 0.6 }],
        vox: [{ key: "vowelX", a: 0.2, b: 0.9 }],
      },
    },
    SPACE,
    RIFF,
    LEVEL,
  ],
};

/** A macro's position as a stepped value index (Octave: 0 low, 1 home, 2 high). */
export function stepOf(m: MacroDef, u: number): number {
  const n = m.steps?.length ?? 1;
  return Math.max(0, Math.min(n - 1, Math.round(u * (n - 1))));
}

/** Set a track's params (and mix) from its base sound and the knob positions. */
export function applyMacros(track: Track, role: Role, base: Record<string, number>, knobs: number[], baseMix: { vol: number; send: number; pan: number }) {
  track.params = { ...base };
  track.volume = baseMix.vol;
  track.send = baseMix.send;
  track.pan = baseMix.pan;
  ROLE_MACROS[role].forEach((m, i) => {
    const u = Math.max(0, Math.min(1, knobs[i] ?? m.home));
    for (const t of [...(m.targets?.all ?? []), ...(m.targets?.[track.kind as InstrumentKind] ?? [])]) {
      let v = t.curve === "exp" && t.a > 0 ? t.a * Math.pow(t.b / t.a, u) : t.a + (t.b - t.a) * u;
      if (t.int) v = Math.round(v);
      if (t.key === "mix:vol") track.volume = v * (baseMix.vol / 0.8);
      else if (t.key === "mix:send") track.send = Math.max(baseMix.send * 0.5, v);
      else if (t.key === "mix:pan") track.pan = v;
      else if (t.key === "ifx:type" && (m.id === "crunch" || m.id === "drive" || m.id === "gain") && u < 0.03) continue; // fully left: no drive at all
      else track.params[t.key] = v;
    }
  });
}
