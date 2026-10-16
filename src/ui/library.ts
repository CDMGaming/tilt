// Song library in IndexedDB: every song with content saves itself; the
// library dialog opens, duplicates, renames, deletes, exports and imports.

import { normalizeSong, type Song } from "../engine/model";
import { importMidi } from "../engine/smf";
import { fromB64, getSample, putSample, toB64 } from "./samples";
import { NOTE_NAMES } from "../engine/music";
import type { App } from "./app";
import { STORE_PREFIX } from "./storage";
import { download, h } from "./dom";
import { shareCodeDialog } from "./share";
import { shareSongDialog } from "./sharesong";

const DB_NAME = STORE_PREFIX + "library";
const STORE = "songs";
/** Versions of songs kept on purpose (timed takes), each a whole copy of the song. */
const TAKES = "takes";
export const FILE_FORMAT = "tilt-song";
/** Song files saved before the rename still open. */
const OLD_FORMATS = ["rollbox-song"];

export interface LibraryEntry { id: string; title: string; updated: number; tracks: number; scenes: number; code?: string; song: Song }
/** A kept version of a song: `songId` is the song's library id. */
export interface Take { id: string; songId: string; name: string; at: number; kind: "timed"; song: Song }

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains(TAKES)) d.createObjectStore(TAKES, { keyPath: "id" }).createIndex("songId", "songId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const newLibId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function saveToLibrary(song: Song): Promise<void> {
  song.libId ??= newLibId();
  const entry: LibraryEntry = {
    id: song.libId, title: song.title, updated: Date.now(),
    tracks: song.tracks.length, scenes: song.scenes.length, code: song.setupCode,
    song: JSON.parse(JSON.stringify(song)),
  };
  await tx("readwrite", (s) => s.put(entry));
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const all = await tx<LibraryEntry[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updated - a.updated);
}

export async function deleteFromLibrary(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  for (const t of await listTakes(id)) await deleteTake(t.id);
}

// ------------------------------------------------------------ versions (takes)

/** Keep a copy of the song as it is now in its version list (saving the song first, so it has a library id). */
export async function saveTake(song: Song, name: string): Promise<Take> {
  await saveToLibrary(song);
  const copy = JSON.parse(JSON.stringify(song)) as Song;
  const take: Take = { id: newLibId(), songId: song.libId!, name, at: Date.now(), kind: "timed", song: copy };
  await tx("readwrite", (s) => s.put(take), TAKES);
  return take;
}

export async function renameTake(take: Take, name: string) {
  take.name = name;
  await tx("readwrite", (s) => s.put(take), TAKES);
}

/** A song's versions, newest first. */
export async function listTakes(songId: string): Promise<Take[]> {
  const all = await tx<Take[]>("readonly", (s) => s.index("songId").getAll(songId), TAKES);
  return all.sort((a, b) => b.at - a.at);
}

export async function deleteTake(id: string) {
  await tx("readwrite", (s) => s.delete(id), TAKES);
}

// ------------------------------------------------------------ files

/** Song file: the song plus any of your own samples it uses, so it plays the same elsewhere. */
export async function exportSongFile(song: Song) {
  const samples: Record<string, { name: string; rate: number; pcm16: string }> = {};
  for (const t of song.tracks) for (const ref of t.samples ?? []) {
    if (!ref?.startsWith("user:") || samples[ref.slice(5)]) continue;
    const s = await getSample(ref.slice(5));
    if (s) samples[s.id] = { name: s.name, rate: s.rate, pcm16: toB64(s.data) };
  }
  const data = JSON.stringify({ format: FILE_FORMAT, version: 1, song, samples }, null, 1);
  download(`${safeName(song.title)}.tilt`, data, "application/json");
}

export function safeName(s: string) {
  return (s || "tilt").replace(/[^\w\- ]+/g, "").trim() || "tilt";
}

/** Ask for a song file; resolves with the parsed song (new library id) or null. */
export function pickSongFile(): Promise<Song | null> {
  return new Promise((resolve) => {
    // .tilt (now), .rollbox.json / .json (before the rename): all the same JSON inside.
    const input = h("input", { type: "file", accept: ".tilt,.json,application/json" });
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const j = JSON.parse(await f.text());
        const song = (j.format === FILE_FORMAT || OLD_FORMATS.includes(j.format) ? j.song : j) as Song;
        if (!song?.tracks || !song?.scenes) throw new Error("not a song");
        // Restore embedded user samples (they keep their ids, which are content hashes).
        for (const [id, s] of Object.entries((j.samples ?? {}) as Record<string, { name: string; rate: number; pcm16: string }>)) {
          await putSample(s.name, fromB64(s.pcm16), s.rate, id);
        }
        song.libId = newLibId();
        resolve(normalizeSong(song));
      } catch {
        alert("That file isn't a TILT song.");
        resolve(null);
      }
    };
    input.click();
  });
}

/** Ask for a .mid file and turn it into a new song. */
export function pickMidiFile(): Promise<Song | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: ".mid,.midi,audio/midi" });
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const song = importMidi(await f.arrayBuffer(), f.name.replace(/\.midi?$/i, ""));
        song.libId = newLibId();
        resolve(normalizeSong(song));
      } catch (e) {
        alert(`Couldn't read that MIDI file: ${e}`);
        resolve(null);
      }
    };
    input.click();
  });
}

// ------------------------------------------------------------ dialog

export function libraryDialog(app: App, opts: { onOpen: () => void }) {
  let entries: LibraryEntry[] | null = null;
  let rr: (() => void) | null = null;
  const refresh = async () => { entries = await listLibrary(); rr?.(); };
  const open = (song: Song) => {
    app.engine.stop();
    app.replaceSong(JSON.parse(JSON.stringify(song)));
    app.startTimer(0);
    app.overlays.closeAll();
    opts.onOpen();
  };
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const actions = (e: LibraryEntry, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    app.overlays.menu(e.title, () => [
      { label: "Open", run: () => open(e.song) },
      { label: "Duplicate", run: async () => { const s = JSON.parse(JSON.stringify(e.song)) as Song; s.libId = newLibId(); s.title = `${e.title} copy`; await saveToLibrary(s); await refresh(); } },
      { label: "Rename…", run: async () => { const t = prompt("Song title", e.title); if (!t) return; e.song.title = t.slice(0, 40); await saveToLibrary(e.song); if (app.song.libId === e.id) { app.song.title = e.song.title; app.renderHeader(); } await refresh(); } },
      { label: "Versions…", run: () => versionsDialog(app, e, open) },
      { label: "Export song file", run: () => exportSongFile(e.song) },
      { label: "Share song…", disabled: !e.song.tracks.length, run: () => shareSongDialog(app, e.song) },
      { label: "Share setup code…", disabled: !e.song.tracks.length, run: () => shareCodeDialog(app, e.song) },
      { label: "Delete", disabled: app.song.libId === e.id, hint: app.song.libId === e.id ? "open now" : "", run: async () => { if (confirm(`Delete "${e.title}"? This can't be undone.`)) { await deleteFromLibrary(e.id); await refresh(); } } },
    ], { x: r.left + 40, y: r.top + 10 });
  };
  app.overlays.dialog("Songs", (close, rerender) => {
    rr = rerender;
    return h("div", { class: "form library" },
      h("div", { class: "lib-actions" },
        h("button", { class: "row-btn", "data-nav": "import", onclick: async () => { const s = await pickSongFile(); if (s) { await saveToLibrary(s); open(s); } } }, "Import song file…"),
        h("button", { class: "row-btn", "data-nav": "import-midi", onclick: async () => { const s = await pickMidiFile(); if (s) { await saveToLibrary(s); open(s); app.overlays.toast(`Imported ${s.tracks.length} parts, key guessed: ${NOTE_NAMES[s.key]} ${s.scale}`); } } }, "Import MIDI file…"),
        h("button", { class: "row-btn", "data-nav": "export-cur", disabled: !app.song.tracks.length, onclick: () => exportSongFile(app.song) }, "Export this song"),
        h("button", { class: "row-btn", "data-nav": "close", onclick: close }, "Close")),
      entries === null ? h("p", { class: "note" }, "Loading…")
        : !entries.length ? h("p", { class: "note" }, "No saved songs yet. Songs save themselves as soon as they have a track.")
        : h("div", { class: "lib-list" },
          h("p", { class: "note" }, `${entries.length} song${entries.length === 1 ? "" : "s"}, newest first. A / click a song for options.`),
          entries.map((e) => h("button", {
            class: "lib-row" + (app.song.libId === e.id ? " current" : ""), "data-nav": `song-${e.id}`,
            onclick: (ev: Event) => actions(e, ev.currentTarget as HTMLElement),
          },
          h("span", { class: "lib-title" }, e.title),
          h("span", { class: "lib-meta" }, `${e.tracks} tracks · ${e.scenes} scene${e.scenes === 1 ? "" : "s"}`,
            e.song.sharedFrom ? h("span", { class: "lib-shared" }, ` · Shared · TILT-${e.song.sharedFrom}`) : e.code ? h("span", { class: "lib-code" }, ` · 🎲 ${e.code}`) : ""),
          h("span", { class: "lib-date" }, fmt(e.updated))))),
    );
  }, { wide: true });
  void refresh();
}

/** A song's kept versions (timed takes): open one as a new song, or delete it. */
function versionsDialog(app: App, e: LibraryEntry, open: (song: Song) => void) {
  let takes: Take[] | null = null;
  let rr: (() => void) | null = null;
  const refresh = async () => { takes = await listTakes(e.id); rr?.(); };
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  app.overlays.dialog(`Versions: ${e.title}`, (close, rerender) => {
    rr = rerender;
    return h("div", { class: "form library" },
      takes === null ? h("p", { class: "note" }, "Loading…")
        : !takes.length ? h("p", { class: "note" }, "No versions yet. When a timer runs out, TILT keeps the song as it was then (a timed take) here.")
        : h("div", { class: "lib-list" },
          h("p", { class: "note" }, "Opening a version makes it a new song; this one stays as it is."),
          takes.map((t) => h("div", { class: "take-row" },
            h("span", { class: "lib-title" }, t.name),
            h("span", { class: "lib-meta" }, `${t.song.tracks.length} tracks · ${t.song.scenes.length} scene${t.song.scenes.length === 1 ? "" : "s"}`),
            h("span", { class: "lib-date" }, fmt(t.at)),
            h("button", { class: "small-btn", "data-nav": `open-${t.id}`, onclick: async () => {
              const s = JSON.parse(JSON.stringify(t.song)) as Song;
              s.libId = newLibId();
              s.title = `${e.title}: ${t.name}`.slice(0, 40);
              delete s.shares;
              await saveToLibrary(s);
              open(s);
            } }, "Open as new song"),
            h("button", { class: "small-btn", "data-nav": `del-${t.id}`, onclick: async () => { if (confirm(`Delete the version "${t.name}"?`)) { await deleteTake(t.id); await refresh(); } } }, "Delete")))),
      h("button", { class: "row-btn", "data-nav": "close", onclick: close }, "Back"));
  }, { wide: true });
  void refresh();
}
