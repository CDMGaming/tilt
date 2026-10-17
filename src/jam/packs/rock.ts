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

/** An Axe part (rhythm, clean or lead). */
const axe = (role: "guitar" | "lead", name: string, preset: string, center: number, pool: PartSpec["pool"], extra: Partial<PartSpec> = {}): PartSpec => ({
  role, name, kind: "guitar", preset, center, pool, ...extra,
});

// ---------------------------------------------------------------- Power Ballad

const BALLAD: Template = {
  id: "ballad",
  name: "Power Ballad",
  blurb: "Lighters up: a tender piano-and-clean-guitar verse that blows up into a huge, slow chorus.",
  tempo: [66, 78],
  keys: [4, 2, 7, 9, 0],
  scales: ["major", "mixolydian"],
  progressions: {
    intro: [[1, 1, 4, 4], [6, 4, 1, 5]],
    verse: [[1, 5, 6, 4], [1, 3, 4, 5], [6, 4, 1, 5]],
    chorus: [[4, 5, 1, 6], [1, 5, 6, 4], [6, 4, 1, 5]],
    bridge: [[2, 5, 3, 6], [4, 5, 6, 5]],
    solo: [[4, 5, 1, 6], [1, 5, 6, 4]],
    breakdown: [[4, 4, 1, 1], [6, 6, 4, 4]],
    outro: [[4, 5, 1, 1]],
  },
  form: [
    { s: "intro" }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 }, { s: "verse" }, { s: "chorus", repeat: 2 },
    { s: "bridge" }, { s: "solo", repeat: 2 }, { s: "breakdown" }, { s: "chorus", repeat: 2 }, { s: "outro" },
  ],
  parts: [
    drums("Hall Drums", [
      {
        name: "Slow burn",
        by: {
          verse: { kick: "X.........x.....", rim: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          solo: { kick: "X.......X.x.....", snare: "....X.......X...", open: "x...x...x...x...", crash: "X..............." },
          bridge: { kick: "X.......X.......", snare: "....X.......X...", tomLo: "..............x." },
          outro: { kick: "X...............", crash: "X..............." },
          any: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", snare: "....x.x.........", tomHi: "........x.x.....", tomLo: "............x.x." },
        },
      },
      {
        name: "Ride the wave",
        by: {
          verse: { kick: "X.......X.......", rim: "....x.......x...", hat: "x...x...x...x..." },
          chorus: { kick: "X.....x.X.......", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          any: { kick: "X.....x.X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { snare: "x.x.xxxx........", tomHi: "........xx......", tomLo: "..........xxxx.." },
        },
      },
      {
        name: "Heartbeat",
        by: {
          verse: { kick: "X..x....X..x....", hat: "....x.......x..." },
          chorus: { kick: "X..x....X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          any: { kick: "X..x....X..x....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { tomHi: "x.x.x.x.........", tomLo: "........x.x.x.x.", kick: "X..............." },
        },
      },
    ], { energy: 0.45, feel: 0.12, room: 0.65 }),
    { ...bass("Finger Bass", [
      { name: "Long roots", by: { verse: "1---------------", chorus: "1-------1---1---", bridge: "1-------5-------", solo: "1-----1-1-------", any: "1-------1-------" } },
      { name: "Eighths", by: { verse: "1-------1---5---", chorus: "1-1-1-1-1-1-1-2-", any: "1-1-1-1-1-1-1-1-" } },
      { name: "Climber", by: { verse: "1-------3---5---", chorus: "1---1---3---5---", any: "1---5---8---5---" } },
    ], { follow: 0.4 }, { vol: 0.58 }), rests: ["intro", "breakdown"] },
    axe("guitar", "Clean guitar", "Clean Arpeggio", 55, [
      { name: "Arpeggio", by: { any: "1.5.8.5.3.5.8.5.", bridge: "1-5-8-5-1-5-8-5-" } },
      { name: "Picked chords", by: { verse: "c-------c---c---", any: "c-------c-------" } },
      { name: "Broken", by: { verse: "1.5.8...3.8.5...", any: "1.5.8.5.1.5.8.5." } },
    ], { rests: ["chorus", "solo", "breakdown"], home: { width: 0.6 }, mix: { vol: 0.72, pan: -0.2 } }),
    axe("guitar", "Big guitar", "Wall of Sound", 47, [
      { name: "Held power", by: { chorus: "X-------X-------", solo: "X-------x---x---", bridge: "X-------X-------", outro: "X---------------", any: "X-------X-------" } },
      { name: "Eighth drive", by: { chorus: "X-x-x-x-x-x-x-x-", any: "x-x-x-x-x-x-x-x-" } },
      { name: "Strum", by: { chorus: "c-------c---c---", any: "c-------c-------" } },
    ], { rests: ["intro", "verse", "breakdown"], home: { gain: 0.45, width: 0.85 }, mix: { vol: 0.62 } }),
    {
      role: "keys", name: "Piano", kind: "piano", preset: "Ballad Grand", center: 60, home: { space: 0.45 },
      pool: [
        { name: "Broken chords", by: { any: "1.5.8.5.3.5.8.5.", chorus: "x-------1.5.8.5." } },
        { name: "Held chords", by: { any: "x---------------", chorus: "x-------x-------", intro: "x-------x-------", breakdown: "x-------x-------" } },
        { name: "Pulse", by: { any: "x.x.x.x.x.x.x.x.", intro: "x---x---x---x---", breakdown: "x-------x-------" } },
      ],
      mix: { vol: 1, pan: 0.15 },
    },
    axe("lead", "Lead guitar", "Ballad Lead", 67, [
      { name: "Soaring", by: { chorus: "5-------3-------2-------1-------", solo: "1---3---5---8---9-------8-------", bridge: "3-------2-------", outro: "8---------------" } },
      { name: "Cry", by: { chorus: "8-------7---5---5-------3-------", solo: "5-3-5-8---------7-5-3-5---------", bridge: "5-------4-------" } },
      { name: "Answer", by: { chorus: "........5-3-1---........5-3-2---", solo: "1-2-3-5-8-------9-8-5-3-5-------", bridge: "1-------3-------" } },
    ], { rests: ["intro", "verse", "breakdown"], params: { level: 0.5 }, mix: { vol: 0.7, pan: 0.1 } }),
  ],
  fx: { reso: 0.35, reverb: 1, riserBeats: 8, stutter: "1/8" },
  moves: { lastChorusUp: 2 },
};

// ---------------------------------------------------------------- Hair Metal

const HAIR: Template = {
  id: "hair",
  name: "Hair Metal",
  blurb: "Swagger: chunky palm-muted eighths, a shout-along chorus, a shred solo with pick squeals.",
  tempo: [118, 138],
  keys: [4, 9, 2],
  scales: ["mixolydian", "major"],
  progressions: {
    intro: [[1, 7, 4, 1]],
    verse: [[1, 1, 7, 4], [1, 7, 4, 1]],
    chorus: [[4, 1, 7, 1], [1, 4, 5, 4]],
    bridge: [[6, 4, 5, 5]],
    solo: [[1, 7, 4, 1], [4, 1, 7, 1]],
    breakdown: [[1, 1, 1, 1]],
    outro: [[4, 7, 1, 1]],
  },
  form: [
    { s: "intro" }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 }, { s: "verse" }, { s: "chorus", repeat: 2 },
    { s: "solo", repeat: 2 }, { s: "breakdown" }, { s: "chorus", repeat: 2 }, { s: "outro" },
  ],
  parts: [
    drums("Big Rock", [
      {
        name: "Gated stomp",
        by: {
          verse: { kick: "X.....x.X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.....x.X.x.....", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          breakdown: { kick: "X.......X.......", snare: "....X...........", crash: "X..............." },
          solo: { kick: "X.x...x.X.x...x.", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x." },
          any: { kick: "X.....x.X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", tomHi: "x.x.............", snare: "....x.x.x.x.XXXX" },
        },
      },
      {
        name: "Strut",
        by: {
          verse: { kick: "X.....x...x.....", snare: "....X.......X...", hat: "x..xx..xx..xx..x" },
          chorus: { kick: "X.....x...x.....", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          any: { kick: "X.....x...x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { snare: "x.x.x.x.........", tomHi: "........x.x.....", tomLo: "............x.x." },
        },
      },
      {
        name: "Double kick",
        by: {
          verse: { kick: "X.x.X.x.X.x.X.x.", snare: "....X.......X...", hat: "x...x...x...x..." },
          chorus: { kick: "X.x.x.x.X.x.x.x.", snare: "....X.......X...", open: "x...x...x...x...", crash: "X..............." },
          any: { kick: "X.x.X.x.X.x.X.x.", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X.x.x.x.x.x.x.x.", snare: "........x.x.XXXX", tomLo: "....x.x........." },
        },
      },
    ], { energy: 0.65, feel: 0.05, room: 0.7 }),
    bass("Pick Bass", [
      { name: "Pump", by: { verse: "1.1.1.1.1.1.1.1.", chorus: "1.1.1.1.1.1.8.8.", breakdown: "1.......1.......", any: "1.1.1.1.1.1.1.1." } },
      { name: "Octave pop", by: { any: "1.8.1.8.1.8.1.8.", breakdown: "1.......8......." } },
      { name: "Lock", by: { any: "1..1..1.1..1..1.", breakdown: "1.......1......." } },
    ], { follow: 0.6 }, { vol: 0.57 }),
    axe("guitar", "Rhythm guitar", "High Gain Rhythm", 45, [
      { name: "Pedal chug", by: { verse: "mmmmmmx-mmmmmmx-", chorus: "X-------x-----x-", breakdown: "X.......X.......", solo: "mmx-mmx-mmx-mmx-", intro: "X-------mmmmmmmm", outro: "X---------------" } },
      { name: "Stabs", by: { verse: "x.....x.x.......", chorus: "X---x---X---x-x-", breakdown: "X.......X.......", any: "x.....x.x......." } },
      { name: "Gallop chug", by: { verse: "mmm.mmm.mmm.x-x-", chorus: "x-mmx-mmx-mmx-mm", breakdown: "X.......X.......", any: "x-mmx-mmx-mmx-mm" } },
    ], { home: { gain: 0.5, width: 0.85 }, mix: { vol: 0.81 } }),
    axe("lead", "Lead guitar", "Shred Lead", 67, [
      { name: "Hook and squeal", by: { chorus: "8-7-5-----5-7-8-s---------------", solo: "1356813568135688s-------8-7-5---", intro: "8---7---5-------", outro: "s---------------" } },
      { name: "Run up", by: { chorus: "5-5-7-8-----5---3-3-5-7-----s---", solo: "1-3-5-8-9-8-5-3-1-3-5-8-s-------", intro: "5-------8-------" } },
      { name: "Wail", by: { chorus: "8---------------7-------5-------", solo: "8.8.9-8.7-5.3-5-s---------------", intro: "8---------------" } },
    ], { rests: ["verse", "breakdown"], params: { level: 0.75 }, mix: { vol: 0.72 } }),
    {
      role: "keys", name: "Synth pad", kind: "anthem", preset: "Wide Chords", center: 64, home: { bright: 0.45 },
      pool: [
        { name: "Pad", by: { any: "x---------------" } },
        { name: "Swells", by: { any: "x-------x-------" } },
        { name: "Stabs", by: { any: "x.....x.....x..." } },
      ],
      rests: ["intro", "verse", "breakdown"],
      mix: { vol: 0.63 },
    },
  ],
  fx: { reso: 0.5, reverb: 0.9, riserBeats: 4, stutter: "1/16" },
  moves: {},
};

// ---------------------------------------------------------------- Hardcore

const HARDCORE: Template = {
  id: "hardcore",
  name: "Hardcore",
  blurb: "Fast and furious: d-beat drive, a two-step bounce, then a half-time breakdown that hits like a truck.",
  tempo: [160, 196],
  keys: [4, 2, 1],
  scales: ["minor", "phrygian"],
  progressions: {
    intro: [[1, 1, 1, 1]],
    verse: [[1, 1, 6, 7], [1, 7, 6, 7]],
    chorus: [[6, 7, 1, 1], [1, 6, 3, 7]],
    bridge: [[1, 2, 1, 2]],
    solo: [[1, 7, 6, 7]],
    breakdown: [[1, 1, 1, 1]],
    outro: [[1, 1, 1, 1]],
  },
  form: [
    { s: "intro" }, { s: "verse", repeat: 2 }, { s: "chorus" }, { s: "verse", repeat: 2 }, { s: "chorus" },
    { s: "bridge" }, { s: "breakdown", repeat: 2 }, { s: "chorus" }, { s: "outro" },
  ],
  parts: [
    drums("Punk", [
      {
        name: "D-beat",
        by: {
          verse: { kick: "X...X.....X.X...", snare: "......X.......X.", open: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", open: "..x...x...x...x." },
          breakdown: { kick: "X..X..X...X.X...", snare: "........X.......", crash: "X.......X......." },
          bridge: { kick: "X.x.X.x.X.x.X.x.", snare: "x.x.x.x.x.x.x.x." },
          intro: { kick: "X...............", crash: "X..............." },
          outro: { kick: "X...............", crash: "X..............." },
          any: { kick: "X...X.....X.X...", snare: "......X.......X.", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", snare: "x.x.x.x.x.x.XXXX" },
        },
      },
      {
        name: "Two-step",
        by: {
          verse: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X...X.....X.X...", snare: "......X.......X.", open: "x.x.x.x.x.x.x.x." },
          breakdown: { kick: "X..X..X.X..X..X.", snare: "........X.......", crash: "X..............." },
          any: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { tomHi: "x.x.x.x.........", tomLo: "........x.x.x.x.", kick: "X..............." },
        },
      },
      {
        name: "Mosh",
        by: {
          verse: { kick: "X...X...X...X...", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.x.X.x.X.x.X.x.", snare: "....X.......X...", crash: "X...X...X...X..." },
          breakdown: { kick: "X.....X.....X...", snare: "........X.......", crash: "X.......X......." },
          any: { kick: "X...X...X...X...", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { snare: "xxxxxxxxXXXXXXXX", kick: "X..............." },
        },
      },
    ], { energy: 0.8, feel: 0, room: 0.25, crunch: 0.3 }, { vol: 0.7 }),
    bass("Pick Bass", [
      { name: "Follow", by: { any: "1-1-1-1-1-1-1-1-", breakdown: "m..m..m.m..m..m.", bridge: "1.1.1.1.1.1.1.1.", intro: "1---------------" } },
      { name: "Gallop", by: { any: "111.111.111.1-1-", breakdown: "m..m..m...m.m...", intro: "1---------------" } },
      { name: "Sustain", by: { any: "1-------1-------", breakdown: "1-------........", intro: "1---------------" } },
    ], { drive: 0.6 }, { vol: 0.46 }),
    axe("guitar", "Guitar 1", "Hardcore Buzz", 45, [
      { name: "Downpick", by: { verse: "x.x.x.x.x.x.x.x.", chorus: "X-x-x-x-X-x-x-x-", breakdown: "m..m..m.m..m..m.", bridge: "x.x.x.x.x.x.x.x.", intro: "X---------------", outro: "X-------........", any: "x.x.x.x.x.x.x.x." } },
      { name: "Chug-stab", by: { verse: "mmmmx.x.mmmmx.x.", chorus: "X---X---X-x-x-x-", breakdown: "m..m..m...m.m...", intro: "X---------------", any: "mmmmx.x.mmmmx.x." } },
      { name: "Open ring", by: { verse: "c-------c-------", chorus: "c---c---c---c---", breakdown: "X.......X.......", any: "c-------c-------" } },
    ], { home: { gain: 0.7, width: 0.4 }, mix: { vol: 0.75, pan: -0.35 } }),
    axe("guitar", "Guitar 2", "Chug Machine", 52, [
      { name: "Octaves", by: { verse: "1.1.8.8.1.1.8.8.", chorus: "8-------5-------", bridge: "5.6.5.6.5.6.5.6.", breakdown: "m..m..m.m..m..m.", intro: "8---------------", any: "1.1.8.8.1.1.8.8." } },
      { name: "Counter", by: { verse: "5-------4-------", chorus: "8-------7-------", bridge: "8.9.8.9.8.9.8.9.", breakdown: "m..m..m...m.m...", any: "5-------4-------" } },
      { name: "Double", by: { any: "x.x.x.x.x.x.x.x.", breakdown: "m..m..m.m..m..m." } },
    ], { home: { gain: 0.6, width: 0.4 }, mix: { vol: 0.75, pan: 0.35 } }),
  ],
  fx: { reso: 0.4, reverb: 0.4, riserBeats: 4, stutter: "1/8" },
  moves: {},
};

// ---------------------------------------------------------------- Punk

const PUNK: Template = {
  id: "punk",
  name: "Punk",
  blurb: "Three chords and the truth: fast downstrokes, oom-pah drums, a shout-along chorus.",
  tempo: [160, 190],
  keys: [9, 4, 2, 7],
  scales: ["major", "mixolydian"],
  progressions: {
    intro: [[1, 4, 5, 4]],
    verse: [[1, 4, 5, 4], [1, 5, 6, 4]],
    chorus: [[4, 5, 1, 1], [1, 4, 1, 5]],
    bridge: [[6, 4, 1, 5]],
    solo: [[1, 4, 5, 4]],
    breakdown: [[1, 1, 1, 1]],
    outro: [[4, 5, 1, 1]],
  },
  form: [
    { s: "intro" }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 },
    { s: "bridge" }, { s: "chorus", repeat: 2 }, { s: "outro" },
  ],
  parts: [
    drums("Punk", [
      {
        name: "Oom-pah",
        by: {
          verse: { kick: "X...X...X...X...", snare: "..X...X...X...X.", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.....X.X.......", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          breakdown: { kick: "X...X...X...X...", snare: "..X...X...X...X." },
          any: { kick: "X...X...X...X...", snare: "..X...X...X...X.", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", snare: "x.x.x.x.xxxxXXXX" },
        },
      },
      {
        name: "Straight ahead",
        by: {
          verse: { kick: "X.....X.X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.X...X.X.X.....", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          any: { kick: "X.....X.X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { snare: "........xxxxXXXX", tomHi: "x.x.x.x........." },
        },
      },
      {
        name: "Gallop",
        by: {
          verse: { kick: "X.XX..X.X.XX..X.", snare: "....X.......X...", hat: "x...x...x...x..." },
          chorus: { kick: "X.XX..X.X.XX..X.", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          any: { kick: "X.XX..X.X.XX..X.", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", snare: "x.x.x.x.x.x.XXXX" },
        },
      },
    ], { energy: 0.75, feel: 0, room: 0.3 }),
    bass("Pick Bass", [
      { name: "Root eighths", by: { any: "1.1.1.1.1.1.1.1.", bridge: "1.1.1.1.5.5.5.5." } },
      { name: "Walk", by: { any: "1.1.1.1.1.2.3.4.", chorus: "1.1.1.1.1.1.1.1." } },
      { name: "Bounce", by: { any: "1.8.1.8.1.8.5.8." } },
    ]),
    axe("guitar", "Rhythm guitar", "Punk Crunch", 47, [
      { name: "Downstrokes", by: { any: "x.x.x.x.x.x.x.x.", chorus: "c-x.x.x.x.x.x.x." } },
      { name: "Chop", by: { verse: "x.x...x.x.x...x.", chorus: "X-x-x-x-X-x-x-x-", any: "x.x...x.x.x...x." } },
      { name: "Strum", by: { any: "c-------c---c---" } },
    ], { rests: ["breakdown"], home: { gain: 0.6, width: 0.6 }, mix: { vol: 0.95 } }),
    axe("lead", "Lead guitar", "Classic Rock", 64, [
      { name: "Octave tune", by: { chorus: "8.8.8.7.5.5.5---", solo: "1.3.5.8.8.5.3.1.", bridge: "5-------3-------" } },
      { name: "Shout", by: { chorus: "1-1-1-3-5-------", solo: "8-5-8-9-8-------", bridge: "1-------5-------" } },
      { name: "Hook", by: { chorus: "5-5-6-5-3-------5-5-6-5-8-------", solo: "1-3-5-6-5-3-1---3-5-8-9-8-5-3---", bridge: "3-------2-------" } },
    ], { rests: ["intro", "verse", "breakdown"], params: { level: 0.8 }, mix: { vol: 0.66 } }),
    {
      role: "keys", name: "Combo organ", kind: "organ", preset: "Garage Organ", center: 64, params: { level: 1 },
      pool: [
        { name: "Double the hook", by: { chorus: "8.8.8.7.5.5.5---", any: "x---x---x---x---" } },
        { name: "Stabs", by: { any: "....x.......x..." } },
        { name: "Hold", by: { any: "x---------------" } },
      ],
      rests: ["intro", "verse", "breakdown"],
      mix: { vol: 0.55, pan: 0.3 },
    },
  ],
  fx: { reso: 0.45, reverb: 0.5, riserBeats: 4, stutter: "1/8" },
  moves: {},
};

// ---------------------------------------------------------------- Grunge

const GRUNGE: Template = {
  id: "grunge",
  name: "Grunge",
  blurb: "Quiet verse, LOUD chorus: murky clean picking, then a wall of sludgy fuzz.",
  tempo: [84, 108],
  keys: [4, 2, 6],
  scales: ["minor", "dorian", "phrygian"],
  progressions: {
    intro: [[1, 7, 1, 7]],
    verse: [[1, 7, 1, 7], [1, 4, 1, 6]],
    chorus: [[6, 7, 1, 1], [1, 6, 3, 7]],
    bridge: [[4, 5, 6, 7], [2, 1, 2, 1]],
    solo: [[1, 7, 1, 7], [1, 4, 1, 6]],
    breakdown: [[1, 1, 1, 1]],
    outro: [[6, 7, 1, 1]],
  },
  form: [
    { s: "intro" }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 }, { s: "verse", repeat: 2 }, { s: "chorus", repeat: 2 },
    { s: "solo", repeat: 2 }, { s: "bridge" }, { s: "chorus", repeat: 2 }, { s: "outro" },
  ],
  parts: [
    drums("Live Room", [
      {
        name: "Loose",
        by: {
          verse: { kick: "X.......X.x.....", snare: "....X..o....X..o", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.....x.X.x.....", snare: "....X.......X...", tomLo: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          breakdown: { kick: "X...............", hat: "x...x...x...x..." },
          intro: { hat: "x...x...x...x..." },
          any: { kick: "X.......X.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
          fill: { kick: "X...............", tomHi: "x.x.x.x.........", tomLo: "........x.x.x.x.", snare: "............XXXX" },
        },
      },
      {
        name: "Floor toms",
        by: {
          verse: { kick: "X.......X.......", tomLo: "x...x...x...x...", snare: "....X.......X..." },
          chorus: { kick: "X.....x.X.......", snare: "....X.......X...", open: "x.x.x.x.x.x.x.x.", crash: "X..............." },
          any: { kick: "X.......X.......", snare: "....X.......X...", tomLo: "x...x...x...x..." },
          fill: { tomLo: "x.x.x.x.x.x.x.x.", kick: "X..............." },
        },
      },
      {
        name: "Half time",
        by: {
          verse: { kick: "X.........x.....", snare: "........X.......", hat: "x.x.x.x.x.x.x.x." },
          chorus: { kick: "X.....x...x.....", snare: "........X.......", open: "x...x...x...x...", crash: "X..............." },
          any: { kick: "X.........x.....", snare: "........X.......", hat: "x.x.x.x.x.x.x.x." },
          fill: { snare: "........x.x.XXXX", tomLo: "x.x.x.x........." },
        },
      },
    ], { energy: 0.5, feel: 0.3, room: 0.6 }),
    bass("Muted Bass", [
      { name: "Riff", by: { verse: "1--5-1--<7-1----", chorus: "1-1-1-1-1-1-1-1-", breakdown: "1---------------", bridge: "1-------1---1---", any: "1--5-1--<7-1----" } },
      { name: "Slide", by: { verse: "1-------3-2-1---", chorus: "1---1---1-1-1---", any: "1-------3-2-1---" } },
      { name: "Pulse", by: { any: "1.1.1.1.1.1.1.1.", breakdown: "1---------------" } },
    ], { drive: 0.65, follow: 0.45 }, { vol: 0.87 }),
    axe("guitar", "Clean guitar", "Round Neck", 55, [
      { name: "Murky figure", by: { any: "1-3-5---4-3-1---", bridge: "1-------3-------", breakdown: "1-------5-------" } },
      { name: "Chord pick", by: { any: "1.5.8.5.1.5.8.5." } },
      { name: "Drone", by: { any: "1---5---8---5---" } },
    ], { rests: ["chorus", "solo"], mix: { vol: 0.75, pan: -0.15 } }),
    axe("guitar", "Sludge guitar", "Sludge", 45, [
      { name: "Wall", by: { chorus: "X-------x---x---", bridge: "X-------X-------", solo: "x---x---x---x---", outro: "X---------------", any: "X-------x---x---" } },
      { name: "Slur", by: { chorus: "X-----x-X-----x-", any: "X-----x-X-----x-" } },
      { name: "Grind", by: { chorus: "x.x.x.x.x.x.x.x.", any: "x.x.x.x.x.x.x.x." } },
    ], { rests: ["intro", "verse", "breakdown"], home: { gain: 0.65, width: 0.85 }, mix: { vol: 0.75 } }),
    axe("lead", "Lead guitar", "Fuzzy Garage", 64, [
      { name: "Restated", by: { solo: "1-3-5---4-3-1---1-3-5---7-8-----", bridge: "8-------7-------" } },
      { name: "Noise", by: { solo: "8.7.8.7.5-3-1---s---------------", bridge: "5-------4-------" } },
      { name: "Bend", by: { solo: "5-------7-------8---------------", bridge: "1-------3-------" } },
    ], { rests: ["intro", "verse", "chorus", "breakdown"], params: { level: 0.8 }, mix: { vol: 0.6 } }),
  ],
  fx: { reso: 0.45, reverb: 0.6, riserBeats: 8, stutter: "1/8" },
  moves: { halfTimeBridge: true },
};

export const ROCK: Pack = {
  id: "rock",
  name: "Rock",
  blurb: "Guitars, big drums, loud choruses.",
  color: "#ff5a3c",
  templates: [BALLAD, HAIR, HARDCORE, PUNK, ARENA, GRUNGE],
};
