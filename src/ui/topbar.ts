// Top bar: song, key/tempo, transport, play mode, timer, screens, menu.

import { NOTE_NAMES, scaleById } from "../engine/music";
import { challengeStatus } from "../engine/challenges";
import type { App } from "./app";
import { exportDialog, playTogetherDialog, settingsDialog, songSettings } from "./dialogs";
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
    el.replaceChildren(screenRail(), h("div", { class: "topstrip" },
      h("button", { class: "brand", onclick: () => app.openSystemMenu?.(), title: "Menu (Start / F1)", "aria-label": "TILT menu" }, dmdText("TILT", { height: 15, slant: 7, unlit: false })),
      h("button", { class: "chip-btn title", onclick: () => songSettings(app) }, s.title),
      h("button", { class: "chip-btn", onclick: () => songSettings(app), title: "Key and scale" }, `${NOTE_NAMES[s.key]} ${scaleById(s.scale).name}`),
      app.engine.externalTempo
        ? h("button", { class: "chip-btn ext-tempo", onclick: () => songSettings(app), title: "Following external MIDI clock (Settings → MIDI sync)" }, `EXT ${app.engine.externalTempo.toFixed(1)} bpm`)
        : h("button", { class: "chip-btn", onclick: () => songSettings(app), title: "Tempo, swing, tap" }, `${s.tempo} bpm${s.swing ? ` · swing ${s.swing}%` : ""}`),
      h("div", { class: "transport" },
        h("button", { class: "tp-btn" + (playing ? " on" : ""), onclick: () => app.togglePlay(), title: "Play / stop (Y, Space)" }, playing ? "■" : "▶"),
        h("button", { class: "tp-btn rec" + (app.recording ? " on" : ""), onclick: () => app.toggleRecord(), title: "Record (hold Y, Shift+Space)" }, "●"),
        h("button", { class: "tp-btn mode", onclick: () => { app.songMode = app.songMode === "scene" ? "song" : "scene"; render(); }, title: "Loop the scene, or play the whole song" },
          app.songMode === "scene" ? "⟳ Scene" : s.songLoop ? "⟳ Song" : "→ Song"),
        h("button", { class: "tp-btn" + (s.metronome ? " on" : ""), onclick: () => app.edit("Metronome", () => (s.metronome = !s.metronome)), title: "Metronome" }, "♩")),
      timerEl,
      s.challenges?.length ? (() => {
        const st = challengeStatus(s);
        return h("button", { class: "chip-btn", title: st.map((c) => `${c.met ? "✓" : "○"} ${c.text}`).join("\n"), onclick: () => app.overlays.dialog("Challenge cards", (close) => h("div", { class: "form" },
          st.map((c) => h("p", { class: "note big" }, `${c.met ? "✅" : "⬜"} ${c.text}`)),
          h("button", { class: "row-btn primary", "data-nav": "ok", onclick: close }, "Back to it"))) }, `🃏 ${st.filter((c) => c.met).length}/${st.length}`);
      })() : "",
      app.locked ? h("span", { class: "locked-badge" }, "LOCKED") : "",
      h("div", { class: "spacer" }),
      h("button", { class: "chip-btn", onclick: () => exportDialog(app), title: "Export WAV, stems or MIDI" }, "⬇ Export"),
      h("button", { class: "chip-btn", onclick: () => app.toggleScope?.(), title: "Oscilloscope" }, "∿"),
      h("button", { class: "chip-btn", onclick: () => settingsDialog(app), title: "Settings" }, "⚙"),
    ));
    updateTimer();
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
      icon("💡", "Stuck?", () => app.stuck?.(), "", app.locked || none, "Stuck? Ideas for this scene"));
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
    const t = app.timer;
    if (!t.running && !t.done) { timerEl.textContent = ""; timerEl.className = "timer"; return; }
    const left = app.timeLeft();
    timerEl.replaceChildren(dmdText(t.done ? "0:00" : fmtTime(left), { height: 16 }));
    timerEl.className = "timer on" + (t.done ? " done" : left < 60 ? " hurry" : "");
  };
  app.renderHeader = render;
  let last = "";
  app.frameHooks.push(() => {
    const txt = app.timer.running ? fmtTime(app.timeLeft()) : "";
    if (txt !== last) { last = txt; updateTimer(); }
  });
}
