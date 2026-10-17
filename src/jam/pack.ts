// TILT Jam genre packs: plain data. A pack holds templates; a template is everything needed to
// start a full song at once and keep it sounding good: tempo, keys and modes, chord progressions
// (scale degrees), the song form, pools of grooves and riffs per part, the lineup with presets and
// knob homes, the FX flavour, and signature moves. Add a pack: a new file in packs/, listed in PACKS.
//
// Riff notation: one character per 16th note (16 per bar; a riff may be 1 or 2 bars and repeats
// over the progression). Notes are relative to the chord of that bar, so everything is in key:
//   1-7   scale steps above the chord root (1 = root, 3 = third, 5 = fifth), in the part's octave
//   8 9   the octave and the ninth above the root
//   <     the next digit is an octave down (the "<" takes a 16th of its own)
//   -     hold the previous note        .  rest
//   x X   the chord (power chord on guitar, triad on keys), X accented
//   m     palm-muted power chord (guitar), a short low hit otherwise
//   c     a full open chord (guitar), the chord with the octave (keys)
//   s     pick squeal: a pinch harmonic two octaves up (guitar), a high accent otherwise
// Drum grooves: one string per drum voice, 16 (or 32) steps: X accent, x hit, o ghost, . rest.

import type { InstrumentKind } from "../engine/model";

export type Section = "intro" | "verse" | "chorus" | "bridge" | "solo" | "breakdown" | "outro";
export const SECTIONS: Section[] = ["intro", "verse", "chorus", "bridge", "solo", "breakdown", "outro"];
/** The live section pads (intro and outro belong to the song form). */
export const PAD_SECTIONS: Section[] = ["verse", "chorus", "bridge", "solo", "breakdown"];
export const SECTION_NAMES: Record<Section, string> = { intro: "Intro", verse: "Verse", chorus: "Chorus", bridge: "Bridge", solo: "Solo", breakdown: "Breakdown", outro: "Outro" };

export type Role = "drums" | "bass" | "guitar" | "keys" | "lead";
export type DrumVoice = "kick" | "snare" | "rim" | "hat" | "open" | "tomHi" | "tomLo" | "crash";
/** Garage's pads, in order (36 + index). */
export const DRUM_VOICES: DrumVoice[] = ["kick", "snare", "rim", "hat", "open", "tomHi", "tomLo", "crash"];

export type Groove = Partial<Record<DrumVoice, string>>;

/** One choice from a part's pool: what it plays in each section ("any" for the rest). */
export interface PoolEntry {
  name: string;
  /** Drums: a groove per section (and `fill`, the last bar of each section). Others: a riff per section. */
  by: Partial<Record<Section | "any" | "fill", string | Groove>>;
}

export interface PartSpec {
  role: Role;
  /** The card's name ("Rhythm guitar"). */
  name: string;
  kind: InstrumentKind;
  /** Preset name of that instrument; `params` adjust it. */
  preset: string;
  params?: Record<string, number>;
  /** MIDI note of the part's middle (riffs sit around it): bass ~40, guitar ~52, keys ~60, lead ~72. */
  center: number;
  /** Knob homes (0..1) by macro id; missing: the macro's own home. */
  home?: Record<string, number>;
  pool: PoolEntry[];
  /** Sections the part sits out ("lead" rests in the verse, say). */
  rests?: Section[];
  mix?: { vol?: number; pan?: number; send?: number };
}

export interface FormStep { s: Section; repeat?: number }

export interface Template {
  id: string;
  name: string;
  blurb: string;
  tempo: [number, number];
  /** Keys it may start in (0 = C ... 11 = B) and the scales / modes (music.ts ids). */
  keys: number[];
  scales: string[];
  /** Chord progressions per section: one scale degree (1-7) per bar; the first is the home choice. */
  progressions: Partial<Record<Section, number[][]>>;
  form: FormStep[];
  parts: PartSpec[];
  /** The FX strip's flavour: filter resonance, how big "huge reverb" goes, riser length in beats. */
  fx: { reso: number; reverb: number; riserBeats: number; stutter: "1/8" | "1/16" };
  moves: {
    /** The last chorus goes up this many semitones (a truck-driver key change). */
    lastChorusUp?: number;
    /** The breakdown drops to drums and bass (or as the pools say). */
    halfTimeBridge?: boolean;
    /** Everything stops for the last beat before the chorus. */
    stopBeforeChorus?: boolean;
  };
  /** Song swing 0..100 at home. */
  swing?: number;
}

export interface Pack { id: string; name: string; blurb: string; color: string; templates: Template[] }
