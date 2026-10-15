// Run: deno test --sloppy-imports tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { NO_LOCKS, decodeSetup, encodeSetup, roll, songFromSetup } from "../src/engine/dice.ts";
import { scaleChord, snapToScale, inScale } from "../src/engine/music.ts";
import { barCut, eventsInWindow, firstInstance, nextInstance, wholeSong, swingTicks } from "../src/engine/timeline.ts";
import { PPQ, TICKS_PER_BAR } from "../src/engine/model.ts";
import { addNote, duplicateClip, duplicateScene, ensureClip } from "../src/engine/songops.ts";
import { autoArrange, canArrange } from "../src/engine/arranger.ts";

Deno.test("share code round-trips every roll", () => {
  for (let seed = 1; seed < 300; seed++) {
    const s = roll(null, NO_LOCKS, seed);
    const code = encodeSetup(s);
    assertEquals(decodeSetup(code), s, code);
    assertEquals(decodeSetup(code.toLowerCase().replace(/-/g, " ")), s);
  }
  assertEquals(decodeSetup("garbage!"), null);
});

Deno.test("same seed, same roll; locks hold", () => {
  assertEquals(roll(null, NO_LOCKS, 42), roll(null, NO_LOCKS, 42));
  const a = roll(null, NO_LOCKS, 1);
  const b = roll(a, { ...NO_LOCKS, key: true, tempo: true, lineup: true }, 999);
  assertEquals(b.key, a.key);
  assertEquals(b.tempo, a.tempo);
  assertEquals(b.lineup.map((l) => l.kind), a.lineup.map((l) => l.kind));
});

Deno.test("scale chords stay in the scale", () => {
  for (let root = 48; root < 72; root++) {
    for (const sc of ["major", "minor", "dorian", "minpenta"]) {
      const ch = scaleChord(root, 2, sc, 4);
      assertEquals(ch.length, 4);
      for (const p of ch) assert(inScale(p, 2, sc), `${p} not in D ${sc}`);
      assert(ch[0] === snapToScale(root, 2, sc));
    }
  }
  assertEquals(scaleChord(60, 0, "major", 3), [60, 64, 67]); // C major triad
  assertEquals(scaleChord(62, 0, "major", 3), [62, 65, 69]); // D minor triad
});

Deno.test("timeline: clip loops inside a longer scene, events land on time", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }, { kind: "acid", preset: 0 }] });
  const sc = song.scenes[0].id;
  const [drums, acid] = song.tracks;
  addNote(song, ensureClip(song, drums, sc), { pitch: 36, start: 0, len: 24, vel: 100 });
  const ac = ensureClip(song, acid, sc);
  ac.bars = 2;
  const inst = firstInstance(song, { kind: "scene", sceneId: sc }, 10)!;
  assertEquals(inst.ticks, 2 * TICKS_PER_BAR);
  const ev = eventsInWindow(song, inst, 0, 100).filter((e) => e.type === "on");
  // 1-bar drum clip in a 2-bar scene plays twice: at 0s and at 2s (120 bpm, 4/4).
  assertEquals(ev.map((e) => +(e.time - 10).toFixed(6)), [0, 2]);
  const next = nextInstance(song, { kind: "scene", sceneId: sc }, inst)!;
  assertEquals(next.startTime, 14);
});

Deno.test("song mode honours repeats and ends", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }] });
  song.scenes[0].repeat = 3;
  duplicateScene(song, 0);
  const { instances, duration } = wholeSong(song);
  assertEquals(instances.length, 6);
  assertEquals(duration, 12); // 6 bars of 2s
});

Deno.test("swing pushes off-beat 16ths only", () => {
  assertEquals(swingTicks(0, 50), 0);
  assertEquals(swingTicks(PPQ / 2, 50), PPQ / 2);
  assert(swingTicks(PPQ / 4, 50) > PPQ / 4);
});

Deno.test("duplicate doubles clip length with notes", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "acid", preset: 0 }] });
  const c = ensureClip(song, song.tracks[0], song.scenes[0].id);
  addNote(song, c, { pitch: 40, start: 96, len: 24, vel: 90 });
  assert(duplicateClip(song, c));
  assertEquals(c.bars, 2);
  assertEquals(c.notes.map((n) => n.start), [96, 96 + TICKS_PER_BAR]);
  for (let i = 0; i < 2; i++) duplicateClip(song, c);
  assertEquals(c.bars, 8);
  assert(!duplicateClip(song, c)); // 8 bars max
});

Deno.test("chord mode expands at playback", () => {
  const song = songFromSetup({ key: 0, scale: "major", tempo: 120, swing: 0, lineup: [{ kind: "poly", preset: 0 }] });
  const t = song.tracks[0];
  t.params.chord = 1;
  addNote(song, ensureClip(song, t, song.scenes[0].id), { pitch: 60, start: 0, len: 96, vel: 100 });
  const inst = firstInstance(song, { kind: "scene", sceneId: song.scenes[0].id }, 0)!;
  const on = eventsInWindow(song, inst, 0, 10).filter((e) => e.type === "on").map((e) => e.pitch);
  assertEquals(on, [60, 64, 67]);
});

Deno.test("auto-arranger builds sections with mutes", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }, { kind: "acid", preset: 0 }, { kind: "poly", preset: 0 }] });
  for (const t of song.tracks) addNote(song, ensureClip(song, t, song.scenes[0].id), { pitch: 36, start: 0, len: 24, vel: 100 });
  assert(canArrange(song));
  autoArrange(song);
  assertEquals(song.scenes.map((s) => s.name), ["Intro", "Build", "Drop", "Break", "Drop 2", "Outro"]);
  const intro = song.scenes[0].id;
  assertEquals(song.tracks.map((t) => t.clips[intro].muted), [true, true, false]); // harmony only
  const drop = song.scenes[2].id;
  assertEquals(song.tracks.map((t) => t.clips[drop].muted), [false, false, false]);
  assert(song.scenes[0].fadeIn && song.scenes[5].fadeOut);
});

import { laneValue, setAutoPoint, clearAutoRange } from "../src/engine/songops.ts";
import { normalizeSong } from "../src/engine/model.ts";

Deno.test("automation lanes interpolate and play as param events", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "poly", preset: 0 }] });
  const t = song.tracks[0];
  const c = ensureClip(song, t, song.scenes[0].id);
  c.bars = 2;
  setAutoPoint(c, "mix:vol", 0, 0);
  setAutoPoint(c, "mix:vol", 384, 1);
  assertEquals(laneValue(c.auto!["mix:vol"], 192), 0.5);
  assertEquals(laneValue(c.auto!["mix:vol"], 700), 1); // held after the last point
  const inst = firstInstance(song, { kind: "scene", sceneId: song.scenes[0].id }, 0)!;
  const ev = eventsInWindow(song, inst, 0, 4).filter((e) => e.type === "param" && e.key === "mix:vol");
  assertEquals(ev.length, (2 * 384) / 6); // one step per 64th note over 2 bars
  assertEquals(ev[0].value, 0);
  assertEquals(ev[32].value, 0.5); // tick 192
  clearAutoRange(c, "mix:vol", 0, 384);
  assertEquals(c.auto!["mix:vol"].map((p) => p.tick), [0]);
});

Deno.test("a param automated elsewhere resets to its knob value when a scene starts", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "acid", preset: 0 }] });
  const t = song.tracks[0];
  duplicateScene(song, 0);
  setAutoPoint(ensureClip(song, t, song.scenes[0].id), "cutoff", 0, 1);
  t.params.cutoff = 333;
  const inst = firstInstance(song, { kind: "scene", sceneId: song.scenes[1].id }, 0)!;
  const ev = eventsInWindow(song, inst, 0, 0.01).filter((e) => e.type === "param");
  assertEquals(ev.map((e) => [e.key, e.value]), [["cutoff", 333]]);
});

Deno.test("old saves gain mixer fields", () => {
  const old = JSON.parse(JSON.stringify(songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }] })));
  delete old.master; delete old.tracks[0].fx; delete old.tracks[0].send;
  const s = normalizeSong(old);
  assertEquals(s.tracks[0].fx.length, 3);
  assert(s.master.limiter && typeof s.tracks[0].send === "number");
});

import { quantizeClip } from "../src/engine/songops.ts";

Deno.test("quantize snaps starts only, wraps the clip end, removes doubles", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "acid", preset: 0 }] });
  const c = ensureClip(song, song.tracks[0], song.scenes[0].id);
  addNote(song, c, { pitch: 40, start: 26, len: 37, vel: 100 }); // -> 24, length kept
  addNote(song, c, { pitch: 41, start: 380, len: 24, vel: 100 }); // rounds to 384 = clip end -> wraps to 0
  addNote(song, c, { pitch: 40, start: 22, len: 24, vel: 100 }); // also -> 24: duplicate removed
  const moved = quantizeClip(c, c.notes, 24);
  assertEquals(moved, 3);
  assertEquals(c.notes.map((n) => `${n.pitch}@${n.start}`), ["41@0", "40@24"]);
  assert(c.notes.some((n) => n.len === 37) || c.notes.some((n) => n.len === 24)); // lengths untouched
});

Deno.test("rolls never give two tracks the same instrument and preset", () => {
  for (let seed = 1; seed < 2000; seed++) {
    const s = roll(null, NO_LOCKS, seed);
    const keys = s.lineup.map((l) => `${l.kind}:${l.preset}`);
    assertEquals(new Set(keys).size, keys.length, `seed ${seed}: ${keys}`);
  }
  // Locked presets with a doubled instrument still end up different.
  const a = { key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums" as const, preset: 3 }, { kind: "drums" as const, preset: 3 }] };
  const b = roll(a, { ...NO_LOCKS, lineup: true, presets: true }, 7);
  assertEquals(b.lineup[0].preset, 3);
  assert(b.lineup[1].preset !== 3);
});

import { exportMidi, importMidi, guessKey } from "../src/engine/smf.ts";
import { zip } from "../src/engine/zip.ts";

Deno.test("MIDI export then import keeps notes, tempo and drums", () => {
  const song = songFromSetup({ key: 9, scale: "minor", tempo: 128, swing: 0, lineup: [{ kind: "drums", preset: 0 }, { kind: "acid", preset: 0 }, { kind: "poly", preset: 0 }] });
  const sc = song.scenes[0].id;
  const [dr, ac, po] = song.tracks;
  for (let b = 0; b < 4; b++) addNote(song, ensureClip(song, dr, sc), { pitch: 36, start: b * 96, len: 24, vel: 100 });
  for (const [i, p] of [45, 48, 52, 55].entries()) addNote(song, ensureClip(song, ac, sc), { pitch: p, start: i * 96, len: 48, vel: 90 });
  po.params.chord = 0;
  addNote(song, ensureClip(song, po, sc), { pitch: 69, start: 0, len: 384, vel: 80 });
  const bytes = exportMidi(song);
  assertEquals(String.fromCharCode(...bytes.slice(0, 4)), "MThd");
  const back = importMidi(bytes.buffer, "rt");
  assertEquals(back.tempo, 128);
  assertEquals(back.tracks.map((t) => t.kind), ["drums", "acid", "poly"]);
  const notes = back.tracks.map((t) => t.clips[back.scenes[0].id].notes);
  assertEquals(notes[0].map((n) => n.start), [0, 96, 192, 288]);
  assertEquals(notes[0][0].pitch, 36); // GM kick back onto pad 1
  assertEquals(notes[1].map((n) => n.pitch), [45, 48, 52, 55]);
  assertEquals(notes[2][0].len, 384);
  assertEquals(`${back.key}:${back.scale}`, "9:minor"); // A minor guessed back
});

Deno.test("key guess and zip container", () => {
  assertEquals(guessKey([60, 62, 64, 65, 67, 69, 71, 72, 60, 64, 67]), { key: 0, scale: "major" });
  const z = zip([{ name: "a.txt", data: new TextEncoder().encode("hello") }]);
  assertEquals(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
  assertEquals(new DataView(z.buffer).getUint32(z.length - 22, true), 0x06054b50);
});

import { makeGrid } from "../src/engine/phrases.ts";

Deno.test("phrase grid: deterministic, in key, sane lengths", () => {
  assertEquals(JSON.stringify(makeGrid(2, "dorian", 124, 99)), JSON.stringify(makeGrid(2, "dorian", 124, 99)));
  for (const [key, scale, tempo] of [[2, "dorian", 124], [9, "minor", 90], [0, "major", 128], [5, "minpenta", 140], [7, "phrygian", 75]] as const) {
    for (let seed = 1; seed < 40; seed++) {
      const g = makeGrid(key, scale, tempo, seed);
      assertEquals(g.cells.length, 5);
      for (const row of g.cells) {
        assertEquals(row.map((p) => p.role), ["drums", "bass", "chords", "lead", "arp"]);
        for (const ph of row) {
          assert(ph.notes.length > 0, `${ph.role} ${ph.name} empty`);
          for (const n of ph.notes) {
            assert(n.len > 0 && n.start >= 0 && n.start < ph.bars * 384, `${ph.name} bad timing`);
            // Melodies stay in the song's own scale; chords/bass/arps in its parent 7-note scale.
            if (ph.role === "lead") assert(inScale(n.pitch, key, scale), `${scale} lead ${ph.name}: ${n.pitch}`);
            if (ph.role !== "drums" && ph.role !== "lead") assert(inScale(n.pitch, key, scale === "minpenta" ? "minor" : scale), `${scale} ${ph.role} ${ph.name}: ${n.pitch}`);
          }
        }
      }
    }
  }
});

Deno.test("rolls give a band of 2-4 tracks, never the whole catalogue", () => {
  for (let seed = 1; seed < 2000; seed++) {
    const s = roll(null, NO_LOCKS, seed);
    assert(s.lineup.length >= 2 && s.lineup.length <= 4, `seed ${seed}: ${s.lineup.length} tracks`);
  }
});

import { buildMips, fft } from "../src/engine/wavetable.ts";

Deno.test("FFT round-trips and wavetable mips are band-limited", () => {
  const n = 2048, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 5 * i) / n) + 0.5 * Math.sin((2 * Math.PI * 300 * i) / n);
  const orig = re.slice();
  fft(re, im); fft(re, im, true);
  assert(orig.every((v, i) => Math.abs(v - re[i]) < 1e-9));
  // A saw in every frame: the top level (<= 4 harmonics) must hold nothing above harmonic 4.
  const table = new Float32Array(33 * n);
  for (let f = 0; f < 33; f++) for (let i = 0; i < n; i++) table[f * n + i] = 2 * (i / n) - 1;
  const mips = buildMips(table);
  assertEquals(mips.length, 9);
  const r2 = Float64Array.from(mips[8].subarray(0, n)), i2 = new Float64Array(n);
  fft(r2, i2);
  let high = 0, low = 0;
  for (let k = 1; k < n / 2; k++) { const m = Math.hypot(r2[k], i2[k]); if (k > 4) high += m; else low += m; }
  assert(high < low * 1e-6, `energy above harmonic 4: ${high}`);
});

import { estimateBpm } from "../src/ui/clock.ts";

Deno.test("MIDI clock tempo estimate", () => {
  for (const bpm of [70, 120, 128, 174]) {
    const iv = 60000 / bpm / 24;
    const times = Array.from({ length: 25 }, (_, i) => 1000 + i * iv + (i % 2 ? 0.4 : -0.4)); // with a little jitter
    assert(Math.abs(estimateBpm(times)! - bpm) < 0.5, `${bpm}`);
  }
  assertEquals(estimateBpm([1, 2, 3]), null);
});

import { pushColor } from "../src/ui/push1.ts";

Deno.test("Push palette mapping", () => {
  assertEquals(pushColor("#ff2020"), 5); // red
  assertEquals(pushColor("#20ff20"), 21); // green
  assertEquals(pushColor("#2040ff"), 45); // blue
  assertEquals(pushColor("#c3cbe0"), 3); // steel -> white
  assertEquals(pushColor("#ff2020", 2), 7); // dimmer red
});

Deno.test("a scene change at the next bar cuts the playing scene at the bar line", () => {
  const bar = TICKS_PER_BAR;
  assertEquals(barCut(8 * bar, 0.2 * bar), bar);
  assertEquals(barCut(8 * bar, 2 * bar), 2 * bar, "exactly on a bar line: change there");
  assertEquals(barCut(8 * bar, 7.5 * bar), 8 * bar, "the last bar: the scene ends anyway");
  assertEquals(barCut(4 * bar, 0), 4 * bar, "not started yet: nothing to cut");
});

Deno.test("NUDGE re-rolls what isn't held: fields, lineup slots, sounds, count", async () => {
  const { NO_HOLDS, defaultSpec, nudgeSetup, lineupHeld, soundsHeld } = await import("../src/engine/dice.ts");
  for (let seed = 1; seed < 80; seed++) {
    const first = nudgeSetup(null, NO_HOLDS, defaultSpec(), seed);
    assert(first.lineup.length >= 3 && first.lineup.length <= 5, "default: 3-5 instruments");
    const kinds = first.lineup.map((l) => l.kind);
    assertEquals(new Set(kinds).size, kinds.length, "? slots get distinct instruments");
    // Hold key + tempo, choose slot 2's instrument and slot 1's sound, fix the count at 4.
    const spec = defaultSpec();
    spec.count = 4; spec.slots[1] = "fm"; spec.presets[0] = 1;
    const next = nudgeSetup(first, { ...NO_HOLDS, key: true, tempo: true }, spec, seed + 1000);
    assertEquals(next.key, first.key);
    assertEquals(next.tempo, first.tempo);
    assertEquals(next.lineup.length, 4);
    assertEquals(next.lineup[1].kind, "fm");
    assertEquals(next.lineup[0].preset, 1);
    assertEquals(decodeSetup(encodeSetup(next)), next, "the share code still reproduces the whole result");
    // Everything chosen: NUDGE leaves the lineup and sounds alone.
    const all = defaultSpec();
    all.count = next.lineup.length;
    next.lineup.forEach((l, i) => { all.slots[i] = l.kind; all.presets[i] = l.preset; });
    assert(lineupHeld(all, next.lineup.length) && soundsHeld(all, next.lineup.length));
    assertEquals(nudgeSetup(next, NO_HOLDS, all, seed + 7).lineup, next.lineup);
  }
  // Fixed counts 1..8, and a random range.
  for (let c = 1; c <= 8; c++) { const sp = defaultSpec(); sp.count = c; assertEquals(nudgeSetup(null, NO_HOLDS, sp, c).lineup.length, c); }
  const sp = defaultSpec(); sp.min = 2; sp.max = 2;
  assertEquals(nudgeSetup(null, NO_HOLDS, sp, 5).lineup.length, 2);
});

Deno.test("editing the lineup applies at once and keeps the other slots", async () => {
  const { NO_HOLDS, defaultSpec, nudgeSetup, conformSetup } = await import("../src/engine/dice.ts");
  const spec = defaultSpec(); spec.count = 4;
  const s = nudgeSetup(null, NO_HOLDS, spec, 11);
  spec.slots[2] = "wave";
  const c = conformSetup(s, spec, 3);
  assertEquals(c.lineup[2].kind, "wave");
  for (const i of [0, 1, 3]) assertEquals(c.lineup[i], s.lineup[i], `slot ${i} unchanged`);
  spec.count = 6;
  const grown = conformSetup(c, spec, 4);
  assertEquals(grown.lineup.length, 6);
  assertEquals(grown.lineup.slice(0, 4), c.lineup);
  spec.count = 2;
  assertEquals(conformSetup(grown, spec, 5).lineup, grown.lineup.slice(0, 2));
  spec.presets[1] = 0;
  assertEquals(conformSetup(grown, spec, 6).lineup[1].preset, 0);
});

Deno.test("setupFromSong: a song's code as it is now", async () => {
  const { setupFromSong } = await import("../src/engine/dice.ts");
  const { addTrack } = await import("../src/engine/songops.ts");
  const setup = { key: 5, scale: "dorian", tempo: 124, swing: 25, lineup: [{ kind: "drums" as const, preset: 2 }, { kind: "acid" as const, preset: 1 }] };
  const song = songFromSetup(setup);
  // Unchanged: the same code it started from.
  assertEquals(encodeSetup(setupFromSong(song)!), song.setupCode);
  // Edited: tempo and a new instrument show up, and the code decodes back to them.
  song.tempo = 98;
  addTrack(song, "pad", 3);
  const now = decodeSetup(encodeSetup(setupFromSong(song)!))!;
  assertEquals(now.tempo, 98);
  assertEquals(now.lineup.map((l) => [l.kind, l.preset]), [["drums", 2], ["acid", 1], ["pad", 3]]);
  // A renamed / custom sound falls back to the first one.
  song.tracks[2].preset = "My own pad";
  assertEquals(setupFromSong(song)!.lineup[2].preset, 0);
});

Deno.test("moveScene: scenes reorder and keep their clips", async () => {
  const { moveScene, addScene, ensureClip: ec } = await import("../src/engine/songops.ts");
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }] });
  addScene(song); addScene(song);
  const ids = song.scenes.map((s) => s.id);
  ec(song, song.tracks[0], ids[2]).notes.push({ id: 999, pitch: 36, start: 0, len: 24, vel: 100 });
  moveScene(song, 2, 0);
  assertEquals(song.scenes.map((s) => s.id), [ids[2], ids[0], ids[1]]);
  assertEquals(song.tracks[0].clips[ids[2]].notes.length, 1);
  moveScene(song, 0, 99); // past the end: to the last place
  assertEquals(song.scenes.map((s) => s.id), [ids[0], ids[1], ids[2]]);
  moveScene(song, 5, 0); // no such scene: nothing happens
  assertEquals(song.scenes.length, 3);
});

Deno.test("sceneColor: quick names have colours, copies and numbers keep them", async () => {
  const { sceneColor, QUICK_SCENES } = await import("../src/engine/songops.ts");
  const chorus = QUICK_SCENES.find((q) => q.name === "Chorus")!.color;
  assertEquals(sceneColor("Chorus"), chorus);
  assertEquals(sceneColor("Chorus copy"), chorus);
  assertEquals(sceneColor("chorus 2"), chorus);
  assertEquals(sceneColor("Scene 3"), null);
  assertEquals(new Set(QUICK_SCENES.map((q) => q.color)).size, QUICK_SCENES.length);
});

Deno.test("scene played once: no next instance; looping: the same scene again", () => {
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }] });
  const id = song.scenes[0].id;
  const first = firstInstance(song, { kind: "scene", sceneId: id, once: true }, 0)!;
  assertEquals(nextInstance(song, { kind: "scene", sceneId: id, once: true }, first), null);
  assertEquals(nextInstance(song, { kind: "scene", sceneId: id }, first)!.sceneId, id);
});

Deno.test("scale degree, out-of-key notes and snap to scale", async () => {
  const { scaleDegree } = await import("../src/engine/music.ts");
  const { outOfKeyNotes, snapClipToScale } = await import("../src/engine/songops.ts");
  // A minor: A=1, C=3, E=5; F# and G# are out of key.
  assertEquals([57, 60, 64, 66, 68].map((p) => scaleDegree(p, 9, "minor")), [1, 3, 5, 0, 0]);
  const clip = { bars: 1, notes: [
    { id: 1, pitch: 66, start: 0, len: 24, vel: 100 }, // F#4 -> F4 (ties go down)
    { id: 2, pitch: 68, start: 24, len: 24, vel: 100 }, // G#4 -> G4
    { id: 3, pitch: 65, start: 0, len: 24, vel: 100 }, // F4 already there: the snapped F# merges into it
    { id: 4, pitch: 57, start: 48, len: 24, vel: 100 },
  ], auto: {} } as unknown as Parameters<typeof snapClipToScale>[0];
  assertEquals(outOfKeyNotes(clip, 9, "minor").map((n) => n.id), [1, 2]);
  assertEquals(snapClipToScale(clip, 9, "minor", new Set([2])), 1); // only the selected one
  assertEquals(clip.notes.find((n) => n.id === 2)!.pitch, 67);
  assertEquals(snapClipToScale(clip, 9, "minor"), 1);
  assertEquals(outOfKeyNotes(clip, 9, "minor").length, 0);
  assertEquals(clip.notes.length, 3); // F# landed on the existing F at the same start
});

Deno.test("song chain: old songs get the rows; steps repeat, reorder and can play a scene twice", async () => {
  const { normalizeSong, songChain } = await import("../src/engine/model.ts");
  const ops = await import("../src/engine/songops.ts");
  const song = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }] });
  ops.addScene(song); ops.addScene(song);
  song.scenes[1].repeat = 2;
  const [a, b, c] = song.scenes.map((s) => s.id);
  // A song from before the chain: normalising gives it the rows in order, with their repeats.
  delete song.chain;
  normalizeSong(song);
  assertEquals(song.chain, [{ sceneId: a, repeat: 1 }, { sceneId: b, repeat: 2 }, { sceneId: c, repeat: 1 }]);
  // Following the rows: moving a scene moves its step too, a new scene joins the chain.
  ops.moveScene(song, 2, 0);
  assertEquals(songChain(song).map((x) => x.sceneId), [c, a, b]);
  const d = ops.addScene(song)!.id;
  assertEquals(songChain(song).map((x) => x.sceneId), [c, a, b, d]);
  // Arranged: A, B, A ×3, C. Now rows moving no longer touches it.
  ops.resetChain(song);
  song.chain = [{ sceneId: a, repeat: 1 }, { sceneId: b, repeat: 1 }, { sceneId: a, repeat: 3 }, { sceneId: c, repeat: 1 }];
  ops.moveScene(song, 0, 3);
  assertEquals(songChain(song).map((x) => x.sceneId), [a, b, a, c]);
  ops.moveChainStep(song, 3, 0);
  assertEquals(songChain(song).map((x) => x.sceneId), [c, a, b, a]);
  // Playback walks the chain: C, A, B, A A A, then stops (no loop).
  const mode = { kind: "song" as const, fromIndex: 0 };
  const seen: number[] = [];
  let inst = firstInstance(song, mode, 0);
  while (inst && seen.length < 20) { seen.push(inst.sceneId); inst = nextInstance(song, mode, inst); }
  assertEquals(seen, [c, a, b, a, a, a]);
  // Deleting a scene takes its steps with it.
  ops.deleteScene(song, song.scenes.findIndex((s) => s.id === a));
  assertEquals(songChain(song).map((x) => x.sceneId), [c, b]);
  // Auto-arrange writes the chain of its sections.
  const one = songFromSetup({ key: 0, scale: "minor", tempo: 120, swing: 0, lineup: [{ kind: "drums", preset: 0 }, { kind: "acid", preset: 0 }] });
  for (const t of one.tracks) ensureClip(one, t, one.scenes[0].id).notes.push({ id: 1, pitch: 36, start: 0, len: 24, vel: 100 });
  assert(canArrange(one));
  autoArrange(one);
  assertEquals(one.chain!.map((x) => x.sceneId), one.scenes.map((s) => s.id));
});
