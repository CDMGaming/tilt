// Right mouse button: never the browser's menu. On a knob / fader / switch it
// opens a parameter menu; elsewhere it opens the screen's own context menu.

import { formatParam } from "../engine/instruments";
import { getParam, paramInfo } from "../engine/params";
import type { App } from "./app";

export function bindRightClick(app: App) {
  window.addEventListener("contextmenu", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || el.closest("input, textarea, select")) return; // text fields keep copy/paste
    e.preventDefault();
    // These handle right-click themselves (song cells, piano roll).
    if (el.closest(".song-grid, .roll-canvas, .menu")) return;
    const ctl = el.closest<HTMLElement>("[data-param]");
    if (ctl && !app.overlays.open) { paramMenu(app, ctl, { x: e.clientX, y: e.clientY }); return; }
    if (!app.overlays.open) app.dispatch({ type: "menu" });
  });
}

function paramMenu(app: App, ctl: HTMLElement, at: { x: number; y: number }) {
  const key = ctl.dataset.param!;
  const redraw = () => (ctl as HTMLElement & { redraw?: () => void }).redraw?.();
  if (key.startsWith("master:")) {
    const k = key.slice(7) as "volume" | "limitDepth" | "reverbTime";
    const defs = { volume: 0.9, limitDepth: 0.5, reverbTime: 0.45 };
    app.overlays.menu("Master", () => [{ label: "Reset to default", run: () => { app.setMaster(k, defs[k], true); redraw(); } }], at);
    return;
  }
  const trackId = Number(ctl.closest<HTMLElement>("[data-track]")?.dataset.track ?? app.ed.trackId);
  const track = app.song.tracks.find((t) => t.id === trackId);
  const def = track && paramInfo(track, key);
  if (!track || !def) return;
  const bound = app.song.midiMap?.find((m) => m.trackId === track.id && m.key === key);
  app.overlays.menu(`${def.label}: ${formatParam(def, getParam(track, key))}`, () => [
    { label: "Reset to default", run: () => { app.setParam(track, key, def.def, true); redraw(); } },
    { label: "Show automation lane", run: () => {
      app.ed.trackId = track.id;
      if (app.screenName !== "edit") app.show("edit");
      app.ed.autoKey = key;
      app.ed.velView = false;
      app.refresh();
    } },
    { label: bound ? `MIDI learn (now CC ${bound.cc})` : "MIDI learn this control", run: () => { app.setLearning(true); app.noteLearnTarget(track.id, key); } },
    { label: "Remove MIDI binding", disabled: !bound, run: () => app.edit("Remove MIDI binding", () => { app.song.midiMap = app.song.midiMap!.filter((m) => m !== bound); }) },
  ], at);
}
