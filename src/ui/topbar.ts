// Top bar: song, key/tempo, transport, play mode, timer, screens, menu.

import { NOTE_NAMES, scaleById } from "../engine/music";
import { challengeStatus } from "../engine/challenges";
import type { App } from "./app";
import { exportDialog, settingsDialog, songSettings } from "./dialogs";
import { fmtTime, h } from "./dom";

export function bindTopbar(app: App, el: HTMLElement) {
  const timerEl = h("div", { class: "timer" });
  const render = () => {
    const s = app.song;
    if (app.screenName === "dice" || !s) { el.replaceChildren(); el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const playing = app.engine.playing;
    el.replaceChildren(
      h("button", { class: "brand", onclick: () => app.openSystemMenu?.(), title: "Menu (Start / F1)" }, "⚄ ROLLBOX"),
      h("button", { class: "chip-btn title", onclick: () => songSettings(app) }, s.title),
      h("button", { class: "chip-btn", onclick: () => songSettings(app), title: "Key and scale" }, `${NOTE_NAMES[s.key]} ${scaleById(s.scale).name}`),
      h("button", { class: "chip-btn", onclick: () => songSettings(app), title: "Tempo, swing, tap" }, `${s.tempo} bpm${s.swing ? ` · swing ${s.swing}%` : ""}`),
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
      h("button", { class: "chip-btn stuck", onclick: () => app.stuck?.(), disabled: app.locked, title: "Stuck? Open the phrase grid of ideas for this scene" }, "💡 Stuck?"),
      app.locked ? h("span", { class: "locked-badge" }, "LOCKED") : "",
      h("div", { class: "spacer" }),
      h("button", { class: "chip-btn" + (app.screenName === "song" ? " on" : ""), onclick: () => app.show("song") }, "Song"),
      h("button", { class: "chip-btn" + (app.screenName === "edit" ? " on" : ""), onclick: () => app.show("edit"), disabled: !s.tracks.length }, "Edit"),
      h("button", { class: "chip-btn" + (app.screenName === "mix" ? " on" : ""), onclick: () => app.show("mix"), disabled: !s.tracks.length, title: "Mixer (F4)" }, "Mix"),
      h("button", { class: "chip-btn", onclick: () => exportDialog(app), title: "Export WAV, stems or MIDI" }, "⬇ Export"),
      h("button", { class: "chip-btn", onclick: () => settingsDialog(app), title: "Settings" }, "⚙"),
    );
    updateTimer();
  };
  const updateTimer = () => {
    const t = app.timer;
    if (!t.running && !t.done) { timerEl.textContent = ""; timerEl.className = "timer"; return; }
    const left = app.timeLeft();
    timerEl.textContent = t.done ? "0:00" : fmtTime(left);
    timerEl.className = "timer on" + (t.done ? " done" : left < 60 ? " hurry" : "");
  };
  app.renderHeader = render;
  let last = "";
  app.frameHooks.push(() => {
    const txt = app.timer.running ? fmtTime(app.timeLeft()) : "";
    if (txt !== last) { last = txt; updateTimer(); }
  });
}
