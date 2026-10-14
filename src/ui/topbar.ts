// Top bar: song, key/tempo, transport, play mode, timer, screens, menu.

import { NOTE_NAMES, scaleById } from "../engine/music";
import { challengeStatus } from "../engine/challenges";
import type { App } from "./app";
import { exportDialog, playTogetherDialog, songSettings } from "./dialogs";
import { INSTRUMENTS } from "../engine/instruments";
import { libraryDialog } from "./library";
import { fmtTime, h } from "./dom";
import { isPhone } from "./phone";
import { dmdText } from "./dmd";

export function bindTopbar(app: App, el: HTMLElement) {
  const timerEl = h("div", { class: "timer" });
  const render = () => {
    const s = app.song;
    if (!s) { el.replaceChildren(); el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.classList.add("rails");
    if (isPhone()) { renderRails(); return; }
    // Desktop: the screen rail down the left (shared with phones), the top strip beside it.
    if (app.screenName === "dice") { el.replaceChildren(screenRail()); return; }
    const playing = app.engine.playing;
    el.replaceChildren(screenRail(), h("div", { class: "backbox" },
      display(),
      h("div", { class: "transport" },
        h("button", { class: "tp-btn" + (playing ? " on" : ""), onclick: () => app.togglePlay(), title: "Play / stop (Y, Space)" }, playing ? "■" : "▶"),
        h("button", { class: "tp-btn rec" + (app.recording ? " on" : ""), onclick: () => app.toggleRecord(), title: "Record (hold Y, Shift+Space)" }, "●"),
        h("button", { class: "tp-btn mode", onclick: () => { app.songMode = app.songMode === "scene" ? "song" : "scene"; render(); }, title: "Loop the scene, or play the whole song" },
          app.songMode === "scene" ? "⟳ Scene" : s.songLoop ? "⟳ Song" : "→ Song"),
        h("button", { class: "tp-btn" + (s.metronome ? " on" : ""), onclick: () => app.edit("Metronome", () => (s.metronome = !s.metronome)), title: "Metronome" }, "♩")),
      s.challenges?.length ? (() => {
        const st = challengeStatus(s);
        return h("button", { class: "chip-btn", title: st.map((c) => `${c.met ? "✓" : "○"} ${c.text}`).join("\n"), onclick: () => app.overlays.dialog("Challenge cards", (close) => h("div", { class: "form" },
          st.map((c) => h("p", { class: "note big" }, `${c.met ? "✅" : "⬜"} ${c.text}`)),
          h("button", { class: "row-btn primary", "data-nav": "ok", onclick: close }, "Back to it"))) }, `🃏 ${st.filter((c) => c.met).length}/${st.length}`);
      })() : "",
    ));
    updateTimer();
  };

  /**
   * The backbox display: one dot-matrix panel. The timer (largest; FREE PLAY without one),
   * key / scale / tempo, and where you are (scene, instrument). Click: song settings.
   */
  const timerCell = h("div", { class: "dmd-timer" });
  const infoCell = h("div", { class: "dmd-info" });
  const display = () => {
    const s = app.song;
    const tempo = app.engine.externalTempo ? `EXT ${app.engine.externalTempo.toFixed(1)}` : `${s.tempo}`;
    const scene = s.scenes.find((x) => x.id === app.currentSceneId());
    const track = app.screenName === "song" || app.screenName === "mix" ? app.selectedTrack() : app.track();
    const line1 = `${NOTE_NAMES[s.key]} ${scaleById(s.scale).name}  ${tempo} BPM${s.swing ? `  SW ${s.swing}%` : ""}`;
    const line2 = app.locked ? "LOCKED" : [scene?.name, track && INSTRUMENTS[track.kind].name].filter(Boolean).join(" . ");
    infoCell.replaceChildren(
      h("div", { class: "dmd-line" }, dmdText(line1, { height: 11 })),
      h("div", { class: "dmd-line" + (app.locked ? " locked" : "") }, dmdText(line2, { height: 11 })));
    return h("button", { class: "dmd-display", onclick: () => songSettings(app), title: `${s.title}: key, scale, tempo, swing (click to change)` }, timerCell, infoCell);
  };

  const icon = (glyph: string, label: string, onclick: () => void, cls = "", disabled = false, title = label) =>
    h("button", { class: `rail-btn ${cls}`, onclick, title, "aria-label": label, disabled }, h("span", { class: "rail-glyph" }, glyph), h("span", { class: "rail-label" }, label));

  /**
   * The screens, one rail for desktop (left) and phones (right / bottom): Song, Edit, Mix,
   * then Dice and the song library below a gap, then Together and Stuck?.
   */
  const screenRail = () => {
    const s = app.song, none = !s.tracks.length;
    const on = (name: string) => (app.screenName === name ? " on" : "");
    return h("nav", { class: "rail rail-screens", "aria-label": "Screens" },
      isPhone() ? "" : h("button", { class: "rail-btn brand", onclick: () => app.openSystemMenu?.(), title: "Menu (Start / F1): song, settings, scope, export...", "aria-label": "Menu" },
        h("span", { class: "rail-glyph" }, dmdText("TILT", { height: 11, slant: 7, unlit: false })), h("span", { class: "rail-label" }, "Menu")),
      isPhone() ? "" : h("div", { class: "rail-sep" }),
      ...(app.couch
        ? [icon(app.couch.online ? "🌐" : "🛋", app.couch.online ? app.couch.online.room : "Couch", () => app.show("couch"), "on", false, "Back to the shared screen")]
        : [
          icon("▦", "Song", () => app.show("song"), on("song"), false, "Song (F2)"),
          icon("♪", "Edit", () => app.show("edit"), on("edit"), none, "Edit (F3)"),
          icon("⫼", "Mix", () => app.show("mix"), on("mix"), none, "Mixer (F4)"),
        ]),
      h("div", { class: "rail-gap" }),
      icon("⚄", "Dice", () => app.openDice?.(), on("dice"), false, "Roll a new jam"),
      icon("▤", "Songs", () => libraryDialog(app, { onOpen: () => app.show("song") }), "", false, "Song library"),
      h("div", { class: "rail-sep" }),
      app.couch ? "" : icon("👥", "Together", () => playTogetherDialog(app), "", none, "Play together: couch or online"),
      icon("💡", "Stuck?", () => app.stuck?.(), "", app.locked || none, "Stuck? Ideas for this scene"),
      isPhone() ? "" : icon("⬇", "Export", () => exportDialog(app), "", none, "Export WAV, stems or MIDI"));
  };
  /**
   * Phones (after Flip): two rails. Left: menu, song info, undo / redo, metronome, record, play.
   * Right: the screens. Landscape puts them down the sides; portrait at the top and bottom.
   */
  const renderRails = () => {
    const s = app.song, playing = app.engine.playing;
    if (app.screenName === "dice") { el.replaceChildren(screenRail()); return; }
    const tempo = app.engine.externalTempo ? `EXT ${Math.round(app.engine.externalTempo)}` : `${s.tempo}`;
    el.replaceChildren(
      h("div", { class: "rail rail-left" },
        icon("☰", "Menu", () => app.openSystemMenu?.(), "brand"),
        h("button", { class: "rail-btn info", onclick: () => songSettings(app), title: "Key, scale, tempo" },
          h("span", { class: "rail-glyph small" }, NOTE_NAMES[s.key]),
          h("span", { class: "rail-label" }, scaleById(s.scale).name.slice(0, 5)),
          h("span", { class: "rail-label" }, tempo)),
        timerEl,
        h("div", { class: "rail-gap" }),
        icon("↶", "Undo", () => app.undo()),
        icon("↷", "Redo", () => app.redo()),
        icon("♩", "Click", () => app.edit("Metronome", () => (s.metronome = !s.metronome)), s.metronome ? "on" : ""),
        icon("●", "Rec", () => app.toggleRecord(), "rec" + (app.recording ? " on" : "")),
        icon(playing ? "■" : "▶", playing ? "Stop" : "Play", () => app.togglePlay(), "play" + (playing ? " on" : ""))),
      screenRail(),
    );
    updateTimer();
  };

  const updateTimer = () => {
    const t = app.timer, left = app.timeLeft();
    const state = t.done ? " done" : t.running && left < 60 ? " hurry" : "";
    if (!isPhone()) {
      timerCell.className = "dmd-timer" + state;
      timerCell.replaceChildren(t.running || t.done
        ? dmdText(t.done ? "0:00" : fmtTime(left), { height: 30 })
        : h("div", { class: "free-play" }, dmdText("FREE", { height: 13 }), dmdText("PLAY", { height: 13 })));
      return;
    }
    if (!t.running && !t.done) { timerEl.textContent = ""; timerEl.className = "timer"; return; }
    timerEl.replaceChildren(dmdText(t.done ? "0:00" : fmtTime(left), { height: 16 }));
    timerEl.className = "timer on" + state;
  };
  app.renderHeader = render;
  let last = "";
  app.frameHooks.push(() => {
    const txt = app.timer.running ? fmtTime(app.timeLeft()) : "";
    if (txt !== last) { last = txt; updateTimer(); }
  });
}
