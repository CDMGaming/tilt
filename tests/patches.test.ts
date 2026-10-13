// Run: deno test --sloppy-imports tests/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { NO_LOCKS, roll, songFromSetup } from "../src/engine/dice.ts";
import { History } from "../src/engine/history.ts";
import type { Song } from "../src/engine/model.ts";
import { Ownership, applyPatches, diffSongs, invert } from "../src/engine/patches.ts";
import { addNote, addScene, deleteScene, duplicateScene, ensureClip } from "../src/engine/songops.ts";

const song = (seed = 7): Song => songFromSetup(roll(null, NO_LOCKS, seed));
const copy = (s: Song): Song => JSON.parse(JSON.stringify(s));
/** Content only: the fields patches deliberately leave out are recomputed per machine. */
const content = (s: Song) => JSON.stringify({ ...s, libId: undefined, tracks: s.tracks.map(({ color: _c, ...t }) => t) });

/** A bunch of edits of every kind: notes, params, scenes, tracks, song fields. */
function edits(s: Song, seed: number) {
  const t = s.tracks[seed % s.tracks.length];
  addNote(s, ensureClip(s, t, s.scenes[0].id), { pitch: 60 + seed, start: 96 * (seed % 4), len: 96, vel: 100 });
  t.params[Object.keys(t.params)[0]] = 0.123 * seed;
  t.fx[0] = { type: "drive", a: 0.3, b: 0.7 };
  s.tempo = 100 + seed;
  if (seed % 2) duplicateScene(s, 0);
  if (seed % 3 === 0) addScene(s);
  if (seed % 5 === 0) s.tracks.reverse();
  if (seed % 7 === 0) s.tracks.pop();
}

Deno.test("patches replay an edit exactly, and invert it exactly", () => {
  for (let seed = 1; seed < 40; seed++) {
    const a = song(seed), b = copy(a);
    edits(b, seed);
    const p = diffSongs(a, b);
    const c = copy(a);
    applyPatches(c, p);
    assertEquals(content(c), content(b), `seed ${seed}`);
    applyPatches(c, invert(p));
    // Undo never hands out an id twice: nextId stays where it got to.
    assertEquals(content({ ...c, nextId: 0 }), content({ ...a, nextId: 0 }), `undo seed ${seed}`);
    assertEquals(diffSongs(b, b).length, 0);
    // Sent over the wire (JSON drops undefined = "removed", which reads back the same).
    const d = copy(a);
    applyPatches(d, JSON.parse(JSON.stringify(p)));
    assertEquals(content(d), content(b), `wire seed ${seed}`);
  }
});

Deno.test("each player undoes only their own edits", () => {
  const s = song(3), h = new History();
  h.reset(s);
  const [t1, t2] = s.tracks;
  h.push(s, "p1 note", "p1");
  addNote(s, ensureClip(s, t1, s.scenes[0].id), { pitch: 50, start: 0, len: 96, vel: 100 });
  h.record(s, "p1");
  h.push(s, "p2 knob", "p2");
  const k = Object.keys(t2.params)[0], before = t2.params[k];
  t2.params[k] = before + 1;
  h.record(s, "p2");
  const notes = t1.clips[s.scenes[0].id].notes.length;

  const r = h.undo(s, "p1");
  assertEquals(r?.label, "p1 note");
  assertEquals(t1.clips[s.scenes[0].id]?.notes.length ?? 0, notes - 1);
  assertEquals(t2.params[k], before + 1, "p2's knob survives p1's undo");
  h.redo(s, "p1");
  assertEquals(s.tracks[0].clips[s.scenes[0].id].notes.length, notes);
  h.undo(s, "p2");
  assertEquals(s.tracks[1].params[k], before);
  assertEquals(h.labels("p1"), ["p1 note"]);
});

Deno.test("knob turns without a push join the same undo step", () => {
  const s = song(5), h = new History();
  h.reset(s);
  const t = s.tracks[0], k = Object.keys(t.params)[0], v0 = t.params[k];
  h.push(s, "Knob");
  for (let i = 1; i <= 10; i++) { t.params[k] = v0 + i; h.record(s); }
  assertEquals(h.labels(), ["Knob"]);
  h.undo(s);
  assertEquals(s.tracks[0].params[k], v0);
});

Deno.test("undo leaves alone what someone else has changed since", () => {
  const s = song(9), h = new History();
  h.reset(s);
  h.push(s, "Tempo", "p1");
  s.tempo = 140;
  h.record(s, "p1");
  h.remote(s, [{ path: ["song", "tempo"], value: 90, old: 140 }]);
  const r = h.undo(s, "p1");
  assertEquals(r?.patches.length, 0);
  assertEquals(s.tempo, 90);
});

Deno.test("ownership: tracks, the shared song, and scene changes", () => {
  const s = song(11), o = new Ownership();
  const [t1, t2] = s.tracks;
  const change = (fn: (x: Song) => void) => { const b = copy(s); fn(b); return diffSongs(s, b); };
  const onT2 = change((x) => (x.tracks[1].params[Object.keys(t2.params)[0]] += 1));
  assertEquals(o.refused("p1", onT2).length, 0, "nobody owns anything yet: all allowed");
  o.tracks.set(t1.id, "p1");
  o.tracks.set(t2.id, "p2");
  o.conductor = "p1";
  assert(o.refused("p1", onT2).length > 0);
  assertEquals(o.refused("p2", onT2).length, 0);
  const tempo = change((x) => (x.tempo += 5));
  assertEquals(o.refused("p1", tempo).length, 0);
  assert(o.refused("p2", tempo).length > 0);
  // Duplicating / deleting a scene touches everyone's clips, but it's the conductor's move.
  const dup = change((x) => duplicateScene(x, 0));
  assertEquals(o.refused("p1", dup).length, 0);
  const del = change((x) => { addScene(x); deleteScene(x, 0); });
  assertEquals(o.refused("p1", del).length, 0);
  assert(o.refused("p2", del).length > 0);
  // A new note allocates an id: always allowed, never goes backwards.
  const note = change((x) => addNote(x, ensureClip(x, x.tracks[1], x.scenes[0].id), { pitch: 40, start: 0, len: 48, vel: 90 }));
  assertEquals(o.refused("p2", note).length, 0);
  const c = copy(s);
  c.nextId = 1000;
  applyPatches(c, note);
  assertEquals(c.nextId, 1000);
});

Deno.test("id lanes: two players never hand out the same id", async () => {
  const { idLanes, newId } = await import("../src/engine/model.ts");
  const a = song(2), b = copy(a);
  const ids = new Set<number>();
  for (const [s, lane] of [[a, 0], [b, 1], [a, 0], [b, 1], [a, 0]] as const) {
    idLanes.lanes = 8; idLanes.lane = lane;
    const id = newId(s);
    assertEquals(id % 8, lane);
    assert(!ids.has(id));
    ids.add(id);
  }
  idLanes.lanes = 1; idLanes.lane = 0;
});
