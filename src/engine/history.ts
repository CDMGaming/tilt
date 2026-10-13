// Undo/redo by whole-song snapshots. Songs are small (a few hundred notes),
// so a JSON snapshot per edit is simpler and safer than inverse operations.

import type { Song } from "./model";

const LIMIT = 200;

export class History {
  private undoStack: { label: string; json: string }[] = [];
  private redoStack: { label: string; json: string }[] = [];

  /** Call BEFORE mutating the song. */
  push(song: Song, label: string) {
    this.undoStack.push({ label, json: JSON.stringify(song) });
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(current: Song): Song | null {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.redoStack.push({ label: s.label, json: JSON.stringify(current) });
    return JSON.parse(s.json);
  }

  redo(current: Song): Song | null {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push({ label: s.label, json: JSON.stringify(current) });
    return JSON.parse(s.json);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack[this.undoStack.length - 1]?.label; }
  /** Most recent first, for the history list. */
  labels(): string[] { return this.undoStack.map((s) => s.label).reverse(); }

  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
}
