// Run: deno test --sloppy-imports tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { NO_LOCKS, decodeSetup, encodeSetup, roll, songFromSetup } from "../src/engine/dice.ts";
import { scaleChord, snapToScale, inScale } from "../src/engine/music.ts";
import { eventsInWindow, firstInstance, nextInstance, wholeSong, swingTicks } from "../src/engine/timeline.ts";
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
