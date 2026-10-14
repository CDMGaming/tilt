// Top bar. Desktop: one bar: the TILT logo (the app menu), the dot-matrix display
// (timer, key / tempo, where you are, scrolling messages, and the Stuck? bulb),
// the SONG | EDIT | MIX switch and the transport. Phones: the rails (after Flip).

import { NOTE_NAMES, scaleById } from "../engine/music";
import { challengeStatus } from "../engine/challenges";
import type { App } from "./app";
import { playTogetherDialog, songSettings } from "./dialogs";
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
    el.classList.toggle("rails", isPhone());
    el.classList.toggle("deskbar", !isPhone());
    if (isPhone()) { renderRails(); return; }
    const playing = app.engine.playing, none = !s.tracks.length;
    el.replaceChildren(
      h("button", { class: "tilt-logo", "data-coach": "menu", onclick: () => app.openSystemMenu?.(), title: "Menu (Start / F1): dice, songs, together, export, settings...", "aria-label": "TILT menu" },
        dmdText("TILT", { height: 17, slant: 7, unlit: false })),
      h("div", { class: "dmd-wrap" },
        display(),
        h("button", { class: "dmd-bulb", onclick: () => app.stuck?.(), disabled: app.locked || none, title: "Stuck? Ideas for this scene (phrase grid)", "aria-label": "Stuck?" }, "💡")),
      screenSwitch(),
      h("div", { class: "transport" },
        h("button", { class: "tp-btn" + (playing ? " on" : ""), "data-coach": "play", onclick: () => app.togglePlay(), title: "Play / stop (Y, Space)" }, playing ? "■" : "▶"),
        h("button", { class: "tp-btn rec" + (app.recording ? " on" : ""), onclick: () => app.toggleRecord(), title: "Record (hold Y, Shift+Space)" }, "●"),
        modeSwitch(),
        h("button", { class: "tp-btn" + (s.metronome ? " on" : ""), onclick: () => app.edit("Metronome", () => (s.metronome = !s.metronome)), title: "Metronome" }, "♩"),
        h("button", { class: "tp-btn help-btn", onclick: () => app.openHelp?.(), title: "Controls (?)", "aria-label": "Controls" }, "?")),
      s.challenges?.length && app.settings.gameMode ? (() => {
        const st = challengeStatus(s);
        return h("button", { class: "chip-btn", title: st.map((c) => `${c.met ? "✓" : "○"} ${c.text}`).join("\n"), onclick: () => app.overlays.dialog("Challenge cards", (close) => h("div", { class: "form" },
          st.map((c) => h("p", { class: "note big" }, `${c.met ? "✅" : "⬜"} ${c.text}`)),
          h("button", { class: "row-btn primary", "data-nav": "ok", onclick: close }, "Back to it"))) }, `🃏 ${st.filter((c) => c.met).length}/${st.length}`);
      })() : "",
    );
    updateTimer();
  };

  /** SCENE | SONG: what Play does. SONG mode adds the loop switch (play the song again at its end). */
  const modeSwitch = () => {
    const s = app.song, m = app.songMode;
    const seg = (id: "scene" | "song", label: string, title: string) =>
      h("button", { class: "mode-tab" + (m === id ? " on" : ""), "aria-pressed": String(m === id), onclick: () => app.setSongMode(id), title }, label);
    return h("div", { class: "mode-wrap" },
      h("div", { class: "mode-seg", "data-coach": "mode", role: "group", "aria-label": "Play mode (C)" },
        seg("scene", "SCENE", "Play loops the current scene (C)"),
        seg("song", "SONG", "Play goes through the scenes in order (C)")),
      h("button", { class: "tp-btn loop-btn" + (app.loopOn() ? " on" : ""), "aria-pressed": String(app.loopOn()), onclick: () => app.toggleLoop(),
        title: m === "song" ? (s.songLoop ? "Loop on: the song starts again at its end" : "Loop off: the song plays once") : (app.loopOn() ? "Loop on: the scene repeats" : "Loop off: the scene plays once") }, "⟳"));
  };

  /** SONG | EDIT | MIX, the active one lit amber like an insert lamp (couch / online: the shared screen). */
  const screenSwitch = () => {
    const none = !app.song.tracks.length;
    const tab = (glyph: string, label: string, on: boolean, onclick: () => void, title: string, disabled = false) =>
      h("button", { class: "scr-tab" + (on ? " on" : ""), "data-coach": `tab-${label.toLowerCase()}`, onclick, title, disabled, "aria-pressed": String(on) },
        h("span", { class: "scr-glyph", "aria-hidden": "true" }, glyph), h("span", { class: "scr-label" }, label));
    if (app.couch) {
      return h("div", { class: "scr-seg" }, tab(app.couch.online ? "🌐" : "🛋", app.couch.online ? app.couch.online.room : "COUCH", app.screenName === "couch", () => app.show("couch"), "Back to the shared screen"));
    }
    return h("div", { class: "scr-seg", role: "group", "aria-label": "Screens" },
      tab("▦", "SONG", app.screenName === "song", () => app.show("song"), "Song (F2)"),
      tab("♪", "EDIT", app.screenName === "edit", () => app.show("edit"), "Edit (F3)", none),
      tab("⫼", "MIX", app.screenName === "mix", () => app.show("mix"), "Mixer (F4)", none));
  };

  /**
   * The backbox display: one dot-matrix panel. The timer (largest; FREE PLAY without one),
   * key / scale / tempo, and where you are (scene, instrument). Click: song settings.
   */
  const timerCell = h("div", { class: "dmd-timer" });
  const infoCell = h("div", { class: "dmd-info" });
  const msgCell = h("div", { class: "dmd-msg" });

  /**
   * Messages scroll across the display like a pinball machine's: in from the right, through,
   * and the display goes back to its lines. A new message replaces the one showing.
   */
  let msgTimer = 0, msgAnim: Animation | null = null, showing = "";
  app.overlays.marquee = (text, ms) => {
    if (isPhone() || !infoCell.isConnected) return false;
    showing = text;
    const art = dmdText(text, { height: 14 });
    msgAnim?.cancel();
    clearTimeout(msgTimer);
    msgCell.replaceChildren(art);
    infoCell.classList.add("showing-msg");
    const boxW = infoCell.clientWidth, textW = parseFloat(art.style.width) || 0;
    // Short messages slide in and sit centred; long ones scroll right through to their end.
    const end = textW <= boxW ? (boxW - textW) / 2 : boxW - textW - 6;
    const travel = boxW - end, speed = 260; // px per second
    const slide = Math.max(450, (travel / speed) * 1000);
    const hold = Math.max(900, ms - slide);
    msgAnim = art.animate([{ transform: `translateX(${boxW}px)` }, { transform: `translateX(${end}px)` }], { duration: slide, easing: "linear", fill: "forwards" });
    msgTimer = setTimeout(() => { infoCell.classList.remove("showing-msg"); msgCell.replaceChildren(); showing = ""; }, slide + hold) as unknown as number;
    return true;
  };
  const display = () => {
    const s = app.song;
    const tempo = app.engine.externalTempo ? `EXT ${app.engine.externalTempo.toFixed(1)}` : `${s.tempo}`;
    const scene = s.scenes.find((x) => x.id === app.currentSceneId());
    const track = app.screenName === "song" || app.screenName === "mix" ? app.selectedTrack() : app.track();
    // Narrow windows: shorter words, so both lines fit the smaller display.
    const narrow = innerWidth < 1000;
    const scaleName = scaleById(s.scale).name;
    const scaleText = narrow ? scaleName.split(" ").map((w, i) => w.slice(0, i ? 4 : 3)).join(" ") : scaleName;
    const line1 = narrow
      ? `${NOTE_NAMES[s.key]} ${scaleText} ${tempo}`
      : `${NOTE_NAMES[s.key]} ${scaleName}  ${tempo} BPM${s.swing ? `  SW ${s.swing}%` : ""}`;
    // What Play does (LOOP SCENE 2 / SONG 3/6), then the instrument you're on.
    const inst = track ? INSTRUMENTS[track.kind].name : "";
    const line2 = app.locked ? "LOCKED" : narrow ? [app.playState(true), inst.slice(0, 7)].filter(Boolean).join(".") : [app.playState() + (scene && app.songMode === "scene" ? ` ${scene.name}` : ""), inst].filter(Boolean).join(" . ");
    if (app.coach) {
      // The tutorial: which step, then the instruction (scrolling when it's longer than the display).
      const c = app.coach, art = dmdText(c.text, { height: narrow ? 9 : 11 });
      const box = h("div", { class: "dmd-line dmd-scroll" }, art);
      infoCell.replaceChildren(h("div", { class: "dmd-line" }, dmdText(`FIRST SONG ${c.step}/${c.total}`, { height: narrow ? 9 : 11 })), box, msgCell);
      requestAnimationFrame(() => {
        const boxW = box.clientWidth, textW = parseFloat(art.style.width) || 0;
        if (textW > boxW) art.animate([{ transform: `translateX(${boxW * 0.6}px)` }, { transform: `translateX(${-textW}px)` }], { duration: ((textW + boxW * 0.6) / 90) * 1000, iterations: Infinity });
      });
      return h("button", { class: "dmd-display coach", onclick: () => {}, title: c.text }, timerCell, infoCell);
    }
    infoCell.replaceChildren(
      h("div", { class: "dmd-line" }, dmdText(line1, { height: narrow ? 9 : 11 })),
      h("div", { class: "dmd-line" + (app.locked ? " locked" : "") }, dmdText(line2, { height: narrow ? 9 : 11 })),
      msgCell);
    // A click while the display says STUCK? opens the ideas; otherwise the song settings.
    const click = () => (showing && /stuck/i.test(showing) && !app.locked ? app.stuck?.() : songSettings(app));
    return h("button", { class: "dmd-display", onclick: click, title: `${s.title}: key, scale, tempo, swing (click to change)` }, timerCell, infoCell);
  };

  const icon = (glyph: string, label: string, onclick: () => void, cls = "", disabled = false, title = label) =>
    h("button", { class: `rail-btn ${cls}`, onclick, title, "aria-label": label, disabled }, h("span", { class: "rail-glyph" }, glyph), h("span", { class: "rail-label" }, label));

  /**
   * Phones: the screens rail (right / bottom): Song, Edit, Mix, then Dice and the song
   * library below a gap, then Together and Stuck?.
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
        icon("?", "Help", () => app.openHelp?.(), "help-rail", false, "Controls"),
        h("button", { class: "rail-btn info", onclick: () => songSettings(app), title: "Key, scale, tempo" },
          h("span", { class: "rail-glyph small" }, NOTE_NAMES[s.key]),
          h("span", { class: "rail-label" }, scaleById(s.scale).name.slice(0, 5)),
          h("span", { class: "rail-label" }, tempo)),
        timerEl,
        h("div", { class: "rail-gap" }),
        icon("↶", "Undo", () => app.undo()),
        icon("↷", "Redo", () => app.redo()),
        // SCENE / SONG (the metronome lives in the menu on phones), and the song loop in SONG mode.
        // What Play plays (one scene / the whole song) and whether it repeats: both always shown.
        h("button", { class: "rail-btn mode-rail", onclick: () => app.setSongMode(app.songMode === "scene" ? "song" : "scene"), title: "Play: this scene, or the whole song (C)", "aria-label": `Play mode: ${app.songMode}` },
          h("span", { class: "mode-mini" + (app.songMode === "scene" ? " on" : "") }, "SCENE"),
          h("span", { class: "mode-mini" + (app.songMode === "song" ? " on" : "") }, "SONG")),
        icon("⟳", app.loopOn() ? "Loop" : "Once", () => app.toggleLoop(), "loop-rail" + (app.loopOn() ? " on" : ""), false, "Loop on: repeat. Off: play once"),
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
        ? dmdText(t.done ? (app.settings.gameMode ? "0:00" : "TIME") : fmtTime(left), { height: 30 })
        : h("div", { class: "free-play" }, dmdText("FREE", { height: 13 }), dmdText("PLAY", { height: 13 })));
      return;
    }
    if (!t.running && !t.done) { timerEl.textContent = ""; timerEl.className = "timer"; return; }
    timerEl.replaceChildren(dmdText(t.done ? (app.settings.gameMode ? "0:00" : "TIME") : fmtTime(left), { height: 16 }));
    timerEl.className = "timer on" + state;
  };
  app.renderHeader = render;
  // The bar's contents depend on the width (short display text, phone / desktop): redraw on resize.
  let resizeFrame = 0;
  window.addEventListener("resize", () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(render); });
  let last = "", lastState = "";
  app.frameHooks.push(() => {
    const txt = app.timer.running ? fmtTime(app.timeLeft()) : "";
    if (txt !== last) { last = txt; updateTimer(); }
    // The display follows the song as it plays (SONG 2/6 -> 3/6).
    const st = app.song ? app.playState() : "";
    if (st !== lastState) { lastState = st; if (!isPhone()) render(); }
  });
}
