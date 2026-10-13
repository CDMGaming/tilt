// Phrase grid: pick up to one starter phrase per column, hear the
// combination, load it into a scene (or skip and start blank).

import { DRUM_BASE_NOTE, INSTRUMENTS, drumCount, isDrumKind } from "../engine/instruments";
import type { InstrumentKind, Song, Track } from "../engine/model";
import { NOTE_NAMES, scaleById } from "../engine/music";
import { ROLES, ROLE_NAMES, makeGrid, mapDrumPart, seedFrom, type Phrase, type Role } from "../engine/phrases";
import { addNote, addTrack } from "../engine/songops";
import type { App } from "./app";
import { h, TRACK_COLORS } from "./dom";

const GROUP_FOR: Record<Role, InstrumentDef["group"][]> = {
  drums: ["drums"], bass: ["bass"], chords: ["harmony"], lead: ["lead"], arp: ["harmony", "lead"],
};
type InstrumentDef = (typeof INSTRUMENTS)[InstrumentKind];
// Instrument (and preset) added when the lineup has nobody for a role.
const NEW_FOR: Record<Role, [InstrumentKind, number]> = {
  drums: ["drums", 0], bass: ["acid", 1], chords: ["poly", 0], lead: ["lead", 0], arp: ["poly", 6],
};

/** Which existing track each role writes to (null = a new track gets added). */
function assign(song: Song): Record<Role, Track | null> {
  const used = new Set<number>();
  const out = {} as Record<Role, Track | null>;
  for (const role of ROLES) {
    const t = song.tracks.find((x) => !used.has(x.id) && GROUP_FOR[role].includes(INSTRUMENTS[x.kind].group)) ?? null;
    if (t) used.add(t.id);
    out[role] = t;
  }
  return out;
}

/** Write the chosen phrases into `sceneId` of `song` (adding tracks for empty roles). */
function apply(song: Song, sceneId: number, chosen: (Phrase | null)[]) {
  const targets = assign(song);
  ROLES.forEach((role, col) => {
    const ph = chosen[col];
    if (!ph) return;
    let t = targets[role];
    if (!t) {
      const [kind, preset] = NEW_FOR[role];
      t = addTrack(song, kind, preset);
      if (!t) return;
      if (kind === "acid") t.params.arpOn = 0;
    }
    const clip = { bars: ph.bars, notes: [] as never[], muted: false };
    t.clips[sceneId] = clip;
    const drums = isDrumKind(t.kind);
    // A chord-mode synth turns one note into a chord: write just the lowest note of each chord.
    const chordMode = (t.params.chord ?? 0) > 0 && ph.role === "chords";
    const lowest = new Map<number, number>();
    if (chordMode) for (const n of ph.notes) lowest.set(n.start, Math.min(lowest.get(n.start) ?? 999, n.pitch));
    for (const n of ph.notes) {
      if (chordMode && lowest.get(n.start) !== n.pitch) continue;
      const pitch = drums ? DRUM_BASE_NOTE + mapDrumPart(n.pitch, drumCount(t.kind)) : n.pitch;
      addNote(song, clip, { pitch, start: n.start, len: Math.max(1, Math.round(n.len)), vel: n.vel });
    }
  });
}

export function phraseGridDialog(app: App, opts: { sceneId?: number; onDone: () => void }) {
  const song = app.song;
  const sceneId = opts.sceneId ?? song.scenes[0].id;
  const grid = makeGrid(song.key, song.scale, song.tempo, seedFrom(song.setupCode ?? `${song.title}${song.key}${song.scale}${song.tempo}`));
  const chosen: (number | null)[] = [null, null, null, null, null];
  let previewing = false;

  const phrases = () => chosen.map((row, col) => (row === null ? null : grid.cells[row][col]));
  const preview = () => {
    if (!previewing) return;
    const temp = JSON.parse(JSON.stringify(app.song)) as Song;
    apply(temp, sceneId, phrases());
    app.engine.sync(temp);
    if (!app.engine.playing) app.engine.play({ kind: "scene", sceneId });
  };
  const stopPreview = () => {
    previewing = false;
    app.engine.stop();
    app.engine.sync(app.song);
  };
  const targets = assign(song);
  let rr: (() => void) | null = null;

  const ov = app.overlays.dialog(`Phrase grid · ${NOTE_NAMES[song.key]} ${scaleById(song.scale).name} · ${song.tempo} bpm · ${grid.progressionName}`, (close, rerender) => {
    rr = rerender;
    const finish = (load: boolean) => {
      stopPreview();
      if (load && chosen.some((c) => c !== null)) {
        app.edit("Phrase grid", () => apply(app.song, sceneId, phrases()));
        app.overlays.toast(`Loaded ${chosen.filter((c) => c !== null).length} phrase${chosen.filter((c) => c !== null).length === 1 ? "" : "s"} into the first scene`);
      }
      close();
      opts.onDone();
    };
    return h("div", { class: "form phrase-grid" },
      h("p", { class: "note" }, "Pick up to one phrase per column (they all share one chord progression, so anything fits). Y / Space previews."),
      h("div", { class: "pg-grid" },
        ROLES.map((role) => {
          const t = targets[role];
          const [nk] = NEW_FOR[role];
          return h("div", { class: "pg-head", style: t ? `--track:${TRACK_COLORS[t.color]}` : "" },
            h("div", { class: "pg-role" }, ROLE_NAMES[role]),
            h("div", { class: "pg-target" }, t ? `→ ${app.song.tracks.indexOf(t) + 1} ${INSTRUMENTS[t.kind].name}` : `+ adds ${INSTRUMENTS[nk].name}`));
        }),
        grid.cells.flatMap((row, r) => row.map((ph, c) => h("button", {
          class: "pg-cell" + (chosen[c] === r ? " on" : ""), "data-nav": `c${r}${c}`,
          onclick: () => { chosen[c] = chosen[c] === r ? null : r; if (!previewing) { previewing = true; } preview(); rerender(); },
        }, h("span", { class: "pg-name" }, ph.name), h("span", { class: "pg-dots" }, miniRoll(ph))))),
      ),
      h("div", { class: "pg-actions" },
        h("button", { class: "row-btn", "data-nav": "preview", onclick: () => { if (previewing) stopPreview(); else { previewing = true; preview(); } rerender(); } }, previewing ? "■ Stop preview" : "▶ Preview"),
        h("button", { class: "row-btn", "data-nav": "clear", onclick: () => { chosen.fill(null); preview(); rerender(); } }, "Clear picks"),
        h("button", { class: "row-btn", "data-nav": "skip", onclick: () => finish(false) }, "Skip (start blank)"),
        h("button", { class: "row-btn primary", "data-nav": "load", disabled: !chosen.some((c) => c !== null), onclick: () => finish(true) }, "Load into scene 1")),
    );
  }, { wide: true, onClose: () => { if (previewing) stopPreview(); } });

  // Y / Space toggles the preview instead of the song transport.
  const base = ov.handle.bind(ov);
  ov.handle = (a) => {
    if (a.type === "play") { if (previewing) stopPreview(); else { previewing = true; preview(); } rr?.(); return true; }
    return base(a);
  };
}

/** A tiny note-shape preview made of block characters (no canvas needed in a button). */
function miniRoll(ph: Phrase): string {
  const cols = 16;
  const span = ph.bars * 384;
  const marks = new Array(cols).fill("·");
  for (const n of ph.notes) marks[Math.min(cols - 1, Math.floor((n.start / span) * cols))] = "▮";
  return marks.join("");
}
