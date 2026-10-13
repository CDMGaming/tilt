// Undo/redo per player, built on patches (see patches.ts).
//
// A shadow copy of the song tracks what has already been recorded. After each
// change, diffing the live song against the shadow gives exactly that change,
// which goes into the acting player's current undo step. Undo applies a step's
// patches in reverse, skipping any part someone else has changed since
// (that part is theirs now).

import type { Song } from "./model";
import { type Patch, applyPatches, diffSongs, invert, pathKey, sameValue, valueAt } from "./patches";

const LIMIT = 200;
export const SOLO = "p1";

interface Step { label: string; patches: Patch[] }

interface Stacks { undo: Step[]; redo: Step[]; fresh: string | null }

export class History {
  private shadow: Song | null = null;
  private stacks = new Map<string, Stacks>();
  /** The player whose edits and undos the undo menu shows (couch mode switches it per input). */
  player = SOLO;

  private of(player: string): Stacks {
    let s = this.stacks.get(player);
    if (!s) this.stacks.set(player, (s = { undo: [], redo: [], fresh: null }));
    return s;
  }

  /** Start over from this song (a song was loaded or rolled): no undo across it. */
  reset(song: Song) {
    this.shadow = JSON.parse(JSON.stringify(song));
    this.stacks.clear();
  }

  /**
   * Call BEFORE mutating the song: the next recorded change starts a new undo step.
   * (Changes recorded without a push join the player's last step, e.g. a knob turn.)
   */
  push(song: Song, label: string, player = this.player) {
    this.record(song, player); // anything still unrecorded belongs to what came before
    this.of(player).fresh = label;
  }

  /** What changed since the last record, not yet accepted. */
  pending(song: Song): Patch[] {
    if (!this.shadow) this.reset(song);
    return diffSongs(this.shadow!, song);
  }

  /** Accept a change made by `player`: it joins their undo history. */
  accept(patches: Patch[], player = this.player) {
    if (!patches.length) return;
    applyPatches(this.shadow!, patches);
    const st = this.of(player);
    let step = st.undo[st.undo.length - 1];
    if (st.fresh !== null || !step) {
      step = { label: st.fresh ?? "Edit", patches: [] };
      st.undo.push(step);
      if (st.undo.length > LIMIT) st.undo.shift();
      st.fresh = null;
    }
    st.redo.length = 0;
    merge(step, patches);
    if (!step.patches.length && st.undo[st.undo.length - 1] === step) st.undo.pop(); // changed and changed back
  }

  /** Record whatever changed as `player`'s edit. Returns the patches (to send to other players). */
  record(song: Song, player = this.player): Patch[] {
    const p = this.pending(song);
    this.accept(p, player);
    return p;
  }

  /** A change that came from elsewhere (another player's machine): applied, but in nobody's local undo. */
  remote(song: Song, patches: Patch[]) {
    applyPatches(song, patches);
    applyPatches(this.shadow!, patches);
  }

  undo(song: Song, player = this.player): { label: string; patches: Patch[] } | null {
    return this.travel(song, player, true);
  }

  redo(song: Song, player = this.player): { label: string; patches: Patch[] } | null {
    return this.travel(song, player, false);
  }

  /** Steps always hold forward patches (old -> value): undo applies them inverted, redo as they are. */
  private travel(song: Song, player: string, back: boolean) {
    this.record(song, player);
    const st = this.of(player), step = (back ? st.undo : st.redo).pop();
    if (!step) return null;
    st.fresh = null;
    const moves = back ? invert(step.patches).reverse() : step.patches;
    // Only touch what still looks the way this player left it; ids never go back.
    const ok = moves.filter((p) => sameValue(valueAt(song, p.path), p.old) && !(p.path[0] === "song" && p.path[1] === "nextId"));
    applyPatches(song, ok);
    applyPatches(this.shadow!, ok);
    (back ? st.redo : st.undo).push({ label: step.label, patches: back ? invert(ok).reverse() : ok });
    return { label: step.label, patches: ok };
  }

  canUndoFor(player: string) { return this.of(player).undo.length > 0; }
  get canUndo() { return this.canUndoFor(this.player); }
  get canRedo() { return this.of(this.player).redo.length > 0; }
  get undoLabel() { const u = this.of(this.player).undo; return u[u.length - 1]?.label; }
  /** Most recent first, for the history list. */
  labels(player = this.player): string[] { return this.of(player).undo.map((s) => s.label).reverse(); }

  clear() { this.stacks.clear(); this.shadow = null; }
}

/** Fold new patches into a step: keep the first "old", take the latest "value". */
function merge(step: Step, patches: Patch[]) {
  const at = new Map(step.patches.map((p, i) => [pathKey(p.path), i]));
  for (const p of patches) {
    const i = at.get(pathKey(p.path));
    if (i === undefined) { at.set(pathKey(p.path), step.patches.length); step.patches.push(p); }
    else step.patches[i] = { path: p.path, value: p.value, old: step.patches[i].old };
  }
  step.patches = step.patches.filter((p) => !sameValue(p.value, p.old));
}
