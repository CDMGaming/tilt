// The Rock pack. The tropes behind each template are written up in docs/packs/rock.md; every riff,
// groove and progression here is our own (scale degrees and rhythms), none taken from real songs.

import type { Pack, PartSpec, Template } from "../pack";

// ---------------------------------------------------------------- shared parts

/** Garage drums with a pool of grooves; per template the presets and homes differ. */
const drums = (preset: string, pool: PartSpec["pool"], home: Record<string, number> = {}, mix: PartSpec["mix"] = {}): PartSpec => ({
  role: "drums", name: "Drums", kind: "garage", preset, center: 36, home, pool, mix: { vol: 0.79, ...mix },
});
const bass = (preset: string, pool: PartSpec["pool"], home: Record<string, number> = {}, mix: PartSpec["mix"] = {}): PartSpec => ({
  role: "bass", name: "Bass", kind: "pluck", preset, center: 40, home, pool, mix: { vol: 0.52, ...mix },
});

// ---------------------------------------------------------------- Arena Anthem

const ARENA: Template = {
  id: "arena",
  name: "Arena Anthem",
  blurb: "Stomping, fists-in-the-air: big drums, chugging eighths, a chorus the whole stadium sings.",
  tempo: [118, 138],
  keys: [4, 2, 9, 7],
  scales: ["major", "mixolydian"],
  progressions: {
    intro: [[1, 5, 4, 4], [4, 4, 1, 1]],
    verse: [[1, 5, 6, 4], [1, 4, 1, 5], [6, 4, 1, 5]],
    chorus: [[4, 1, 5, 6], [1, 5, 4, 5], [4, 5, 6, 1]],
    bridge: [[6, 4, 1, 5], [2, 4, 6, 5]],
    solo: [[1, 5, 6, 4], [4, 1, 5, 5]],
    breakdown: [[6, 4, 6, 4], [4, 4, 1, 1]],
    outro: [[4, 5, 1, 1]],
  },
  form: [
    { s: "intro" }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 },
    { s: "bridge" }, { s: "solo", repeat: 2 }, { s: "breakdown" }, { s: "chorus", repeat: 2 }, { s: "outro" },
  ],
  parts: [
    drums("Arena", [
      {
        name: "Stadium stomp",
        by: {
          intro: { kick: "X.......X.......", tomLo: "....x.......x.x.", crash: "X..............." },
          verse: { kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.....x.X.x.....", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          solo: { kick: "X.....x.X.x.....", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x." },
          breakdown: { kick: "X...............", snare: "........X.......", hat: "x...x...x...x..." },
          outro: { kick: "X...............", crash: "X...............", tomLo: "x..............." },
          any: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", snare: "x.x.x.x.xxxxXXXX", tomHi: "........x.x.....", crash: "................" },
        },
      },
      {
        name: "Four on the floor",
        by: {
          verse: { kick: "X...X...X...X...", snare: "....X.......X...", hat: "xoxoxoxoxoxoxoxo" },
          chorus: { kick: "X...X...X...X...", snare: "....X.......X...", open: "..x...x...x...x.", hat: "x...x...x...x...", crash: "X..............." },
          breakdown: { kick: "X.......X.......", hat: "..x...x...x...x." },
          any: { kick: "X...X...X...X...", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...X...........", snare: "........xxxxXXXX", tomLo: "....x.x........." },
        },
      },
      {
        name: "Tom thunder",
        by: {
          verse: { kick: "X.x.....X.x.....", snare: "....X.......X...", tomLo: "x...x...x...x...", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.x...x.X.x.....", snare: "....X.......X...", tomLo: "x.x.x.x.x.x.x.x.", crash: "X......." + "........" },
          any: { kick: "X.x.....X.x.....", snare: "....X.......X...", tomHi: "x...x...x...x..." },
          fill: { tomHi: "x.x.x.x.........", tomLo: "........x.x.x.x.", kick: "X...............", snare: "............XXXX" },
        },
      },
    ], { energy: 0.6, feel: 0.1, room: 0.55 }),
    bass("Pick Bass", [
      { name: "Root eighths", by: { intro: "1-------1-------", verse: "1-1-1-1-1-1-1-1-", chorus: "1-1-1-1-1-1-5-8-", bridge: "1-------1---5---", breakdown: "1---------------", any: "1-1-1-1-1-1-1-1-" } },
      { name: "Gallop", by: { verse: "1-11-1-11-1-11-1", chorus: "1-11-1-11-1-5-8-", any: "1-11-1-11-1-11-1", breakdown: "1-------1-------" } },
      { name: "Walk up", by: { verse: "1---1---3---5---", chorus: "1-1-3-3-5-5-8-5-", any: "1---5---8---5---" } },
    ]),
    {
      role: "guitar", name: "Rhythm guitar", kind: "guitar", preset: "Wall of Sound", center: 47, home: { gain: 0.55, width: 0.75 },
      pool: [
        { name: "Power eighths", by: { intro: "X-------X-------", verse: "m.m.m.m.m.m.m.m.", chorus: "X-x-x-x-x-x-x-x-", bridge: "X---------------", breakdown: "................", solo: "x-x-x-x-x-x-x-x-", outro: "X---------------" } },
        { name: "Big strums", by: { verse: "c-------c---c---", chorus: "c---c-c---c-c---", any: "c-------c-------" } },
        { name: "Chug and ring", by: { verse: "mmmmmmmmX-------", chorus: "X-------mmmmX---", any: "X-------X-------" } },
      ],
      mix: { vol: 0.75, pan: -0.15 },
    },
    {
      role: "keys", name: "Organ", kind: "organ", preset: "Rock Bark", center: 62,
      pool: [
        { name: "Held chords", by: { chorus: "x-------x-------", any: "x---------------", breakdown: "x---------------" } },
        { name: "Stabs", by: { verse: "....x.......x...", chorus: "x.....x...x.....", any: "....x.......x..." } },
        { name: "Climb", by: { any: "1-3-5-8-5-3-1-3-", chorus: "8-5-3-5-8-5-3-5-" } },
      ],
      rests: ["intro"],
      mix: { vol: 0.71, pan: 0.25 },
    },
    {
      role: "lead", name: "Lead guitar", kind: "guitar", preset: "Singing Lead", center: 67,
      pool: [
        { name: "Hook", by: { chorus: "5---3---1-2-3---2---1---<5------", solo: "1-3-5-8-9-8-5-3-5---3---1-------", intro: "8-------5-------", bridge: "3-------2-------", outro: "8---------------" } },
        { name: "Soaring", by: { chorus: "8-------7---5---6-------5-------", solo: "5-6-8-9-8-6-5-3-2-3-5-----------", intro: "5-------8-------" } },
        { name: "Call out", by: { chorus: "1.1.3-1.5---3---", solo: "8.8.7-5.6-5-3---", intro: "1-------5-------" } },
      ],
      rests: ["verse", "breakdown"],
      mix: { vol: 0.78 },
    },
  ],
  fx: { reso: 0.55, reverb: 0.8, riserBeats: 8, stutter: "1/16" },
  moves: { lastChorusUp: 2, halfTimeBridge: true },
};

export const ROCK: Pack = {
  id: "rock",
  name: "Rock",
  blurb: "Guitars, big drums, loud choruses.",
  color: "#ff5a3c",
  templates: [ARENA],
};
