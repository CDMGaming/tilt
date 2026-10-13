// Song changes as data. Every edit becomes a list of patches: "this part of the
// song now holds this value (and used to hold that one)". Patches are plain JSON,
// so they can be undone per player, checked against who owns what, and sent to
// other players, while the editing code keeps mutating the song directly: we
// diff a shadow copy against the live song after each change.
//
// Paths address things by id, never by array position, so patches from two
// players don't trip over each other:
//   ["song", field]           top-level field (tempo, key, master, midiMap...)
//   ["trackOrder"]            the track ids in order
//   ["track", id]             a whole track (added / removed)
//   ["track", id, field]      one field of a track (params, fx, mute, preset...)
//   ["clip", trackId, sceneId] one clip (undefined = empty cell)
//   ["sceneOrder"], ["scene", id] the same for scenes (scenes are small: whole objects)

import type { Clip, Scene, Song, Track } from "./model";

export type PatchPath =
  | ["song", string]
  | ["trackOrder"]
  | ["track", number]
  | ["track", number, string]
  | ["clip", number, number]
  | ["sceneOrder"]
  | ["scene", number];

export interface Patch {
  path: PatchPath;
  /** The new value; undefined = removed. */
  value: unknown;
  /** The value before; undefined = it didn't exist. */
  old: unknown;
}

/** Fields that are not song content: local identity, or derived on every machine. */
const SKIP_SONG = new Set(["tracks", "scenes", "libId"]);
const SKIP_TRACK = new Set(["clips", "color"]); // color: shade order, recomputed by assignShades

const json = (v: unknown) => (v === undefined ? "\u0000" : JSON.stringify(v));
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
export const sameValue = (a: unknown, b: unknown) => json(a) === json(b);

export function pathKey(p: PatchPath): string { return p.join("/"); }

/** Everything that differs between two songs, as patches from `a` to `b`. */
export function diffSongs(a: Song, b: Song): Patch[] {
  const out: Patch[] = [];
  const put = (path: PatchPath, value: unknown, old: unknown) => {
    if (!sameValue(value, old)) out.push({ path, value: clone(value), old: clone(old) });
  };
  const ar = a as unknown as Record<string, unknown>, br = b as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ar), ...Object.keys(br)])) {
    if (!SKIP_SONG.has(k)) put(["song", k], br[k], ar[k]);
  }

  const ta = new Map(a.tracks.map((t) => [t.id, t])), tb = new Map(b.tracks.map((t) => [t.id, t]));
  put(["trackOrder"], b.tracks.map((t) => t.id), a.tracks.map((t) => t.id));
  for (const id of new Set([...ta.keys(), ...tb.keys()])) {
    const x = ta.get(id), y = tb.get(id);
    if (!x || !y) { put(["track", id], y && wholeTrack(y), x && wholeTrack(x)); continue; }
    const xr = x as unknown as Record<string, unknown>, yr = y as unknown as Record<string, unknown>;
    for (const k of new Set([...Object.keys(xr), ...Object.keys(yr)])) {
      if (!SKIP_TRACK.has(k)) put(["track", id, k], yr[k], xr[k]);
    }
    for (const sid of new Set([...Object.keys(x.clips), ...Object.keys(y.clips)].map(Number))) {
      put(["clip", id, sid], y.clips[sid], x.clips[sid]);
    }
  }

  const sa = new Map(a.scenes.map((s) => [s.id, s])), sb = new Map(b.scenes.map((s) => [s.id, s]));
  put(["sceneOrder"], b.scenes.map((s) => s.id), a.scenes.map((s) => s.id));
  for (const id of new Set([...sa.keys(), ...sb.keys()])) put(["scene", id], sb.get(id), sa.get(id));
  return out;
}

function wholeTrack(t: Track): Track {
  const { color: _c, ...rest } = t;
  return rest as Track;
}

/** The current value at a path (for undo's "has anyone changed this since?" check). */
export function valueAt(song: Song, p: PatchPath): unknown {
  switch (p[0]) {
    case "song": return (song as unknown as Record<string, unknown>)[p[1]];
    case "trackOrder": return song.tracks.map((t) => t.id);
    case "sceneOrder": return song.scenes.map((s) => s.id);
    case "scene": return song.scenes.find((s) => s.id === p[1]);
    case "clip": return song.tracks.find((t) => t.id === p[1])?.clips[p[2]];
    case "track": {
      const t = song.tracks.find((x) => x.id === p[1]);
      if (!t) return undefined;
      return p.length === 2 ? wholeTrack(t) : (t as unknown as Record<string, unknown>)[p[2]];
    }
  }
}

/**
 * Apply patches in place. Order doesn't matter: whole objects first, then order,
 * then fields. Values are copied, so the song never shares objects with a patch.
 * `nextId` only ever grows (two players allocating ids must not go backwards).
 */
export function applyPatches(song: Song, patches: Patch[]) {
  const tracks = new Map(song.tracks.map((t) => [t.id, t]));
  const scenes = new Map(song.scenes.map((s) => [s.id, s]));
  let trackOrder: number[] | null = null, sceneOrder: number[] | null = null;
  const sr = song as unknown as Record<string, unknown>;
  for (const { path: p, value } of patches) {
    if (p[0] === "track" && p.length === 2) { if (value === undefined) tracks.delete(p[1]); else tracks.set(p[1], Object.assign({ color: 0 }, clone(value as Track))); /* color: assignShades */ }
    else if (p[0] === "scene") { if (value === undefined) scenes.delete(p[1]); else scenes.set(p[1], clone(value as Scene)); }
    else if (p[0] === "trackOrder") trackOrder = value as number[];
    else if (p[0] === "sceneOrder") sceneOrder = value as number[];
    else if (p[0] === "song") {
      if (p[1] === "nextId") sr.nextId = Math.max(Number(sr.nextId) || 0, Number(value) || 0);
      else if (value === undefined) delete sr[p[1]];
      else sr[p[1]] = clone(value);
    }
  }
  song.tracks = ordered(tracks, trackOrder ?? song.tracks.map((t) => t.id));
  song.scenes = ordered(scenes, sceneOrder ?? song.scenes.map((s) => s.id));
  for (const { path: p, value } of patches) {
    if (p[0] === "track" && p.length === 3) {
      const t = tracks.get(p[1]) as unknown as Record<string, unknown> | undefined;
      if (!t) continue;
      if (value === undefined) delete t[p[2]];
      else t[p[2]] = clone(value);
    } else if (p[0] === "clip") {
      const t = tracks.get(p[1]);
      if (!t) continue;
      if (value === undefined) delete t.clips[p[2]];
      else t.clips[p[2]] = clone(value as Clip);
    }
  }
}

/** Items in the given order; anything the order doesn't mention keeps its place at the end. */
function ordered<T>(items: Map<number, T>, order: number[]): T[] {
  const out: T[] = [], seen = new Set<number>();
  for (const id of order) { const x = items.get(id); if (x && !seen.has(id)) { out.push(x); seen.add(id); } }
  for (const [id, x] of items) if (!seen.has(id)) out.push(x);
  return out;
}

export function invert(patches: Patch[]): Patch[] {
  return patches.map((p) => ({ path: p.path, value: p.old, old: p.value }));
}

// ------------------------------------------------------------ ownership

/** What a patch belongs to: one track (its owner may change it) or the shared song. */
export type Scope = { track: number } | "shared" | "meta";

export function scopeOf(p: Patch, batch: Patch[] = []): Scope {
  const path = p.path;
  if (path[0] === "song" && path[1] === "nextId") return "meta";
  if (path[0] === "track" && path.length === 3) return { track: path[1] };
  if (path[0] === "clip") {
    // Adding / deleting / duplicating a scene touches every track's clip in it: that's the scene's doing.
    const sid = path[2];
    if (batch.some((q) => q.path[0] === "scene" && q.path[1] === sid && (q.value === undefined || q.old === undefined))) return "shared";
    return { track: path[1] };
  }
  return "shared"; // tempo, key, scenes, master, lineup changes (adding / removing tracks)
}

/**
 * Who may change what. A track with no owner, or a shared song with no
 * conductor, is open to everyone (so a solo session never notices this).
 */
export class Ownership {
  tracks = new Map<number, string>();
  conductor: string | null = null;

  can(player: string, scope: Scope): boolean {
    if (scope === "meta") return true;
    if (scope === "shared") return this.conductor === null || this.conductor === player;
    const o = this.tracks.get(scope.track);
    return o === undefined || o === player;
  }

  /** The patches in a batch that `player` is not allowed to make. */
  refused(player: string, batch: Patch[]): Patch[] {
    return batch.filter((p) => !this.can(player, scopeOf(p, batch)));
  }
}
