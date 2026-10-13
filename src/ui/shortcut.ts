// Shortcut overlay (hold LB / L or backtick): a mini map of tracks x scenes.
// Move while holding, release to jump there.

import { INSTRUMENTS } from "../engine/instruments";
import { ensureClip } from "../engine/songops";
import type { Action } from "./actions";
import type { App } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
import type { Overlay } from "./overlay";

export function openShortcut(app: App) {
  const song = app.song;
  if (!song.tracks.length || app.screenName === "dice") return;
  let col = Math.max(0, song.tracks.findIndex((t) => t.id === (app.screenName === "edit" ? app.ed.trackId : song.tracks[app.songCur.col]?.id)));
  let row = Math.max(0, song.scenes.findIndex((s) => s.id === app.currentSceneId()));
  const box = h("div", { class: "shortcut" });
  const wrap = h("div", { class: "overlay-layer dim" }, box);
  const draw = () => {
    box.replaceChildren(
      h("div", { class: "menu-title" }, "Jump to… (release to go)"),
      h("div", { class: "sc-grid", style: `grid-template-columns: 110px repeat(${song.tracks.length}, 90px)` },
        h("div", null),
        song.tracks.map((t, c) => h("div", { class: "sc-head" + (c === col ? " on" : ""), style: `--track:${trackColor(t)}` }, INSTRUMENTS[t.kind].name)),
        song.scenes.map((s, r) => [
          h("div", { class: "sc-scene" + (r === row ? " on" : "") }, `${r + 1} ${s.name}`),
          song.tracks.map((t, c) => h("div", {
            class: "sc-cell" + (r === row && c === col ? " cursor" : "") + (t.clips[s.id]?.notes.length ? " has" : ""),
            style: `--track:${trackColor(t)}`,
          })),
        ]),
      ),
      h("div", { class: "note" }, "Y: loop this scene"),
    );
  };
  const ov: Overlay = {
    el: wrap,
    handle(a: Action) {
      if (a.type === "dir") {
        if (a.dir === "left") col = Math.max(0, col - 1);
        if (a.dir === "right") col = Math.min(song.tracks.length - 1, col + 1);
        if (a.dir === "up") row = Math.max(0, row - 1);
        if (a.dir === "down") row = Math.min(song.scenes.length - 1, row + 1);
        draw();
        return true;
      }
      if (a.type === "play") {
        const s = song.scenes[row];
        if (app.engine.playing) app.engine.queue({ kind: "scene", sceneId: s.id }); else app.engine.play({ kind: "scene", sceneId: s.id });
        app.songMode = "scene";
        app.renderHeader();
        return true;
      }
      if (a.type === "shortcut" && !a.down) { jump(); return true; }
      if (a.type === "confirm") { jump(); return true; }
      return false;
    },
  };
  const jump = () => {
    app.overlays.remove(ov);
    const t = song.tracks[col], s = song.scenes[row];
    if (app.screenName === "song") {
      app.songCur = { row, col };
      app.refresh();
      return;
    }
    if (!t.clips[s.id] && !app.locked) app.edit("New clip", () => ensureClip(song, t, s.id), { render: false });
    app.ed.trackId = t.id;
    app.ed.sceneId = s.id;
    app.ed.sel.clear();
    app.show("edit");
  };
  draw();
  app.overlays.push(ov);
}
