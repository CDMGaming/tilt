// Dialogs: instrument picker, song settings (tempo/tap/swing/key/scale),
// WAV export, settings, the time-up flow and the system menu.

import { autoArrange, canArrange } from "../engine/arranger";
import { pickPreset, usedPresets } from "../engine/dice";
import { INSTRUMENTS } from "../engine/instruments";
import type { InstrumentKind } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { encodeWav, peakDb } from "../engine/wav";
import type { App } from "./app";
import { download, h } from "./dom";
import { stepper } from "./overlay";

const KINDS: InstrumentKind[] = ["drums", "acid", "poly"];

export function instrumentPicker(app: App, title: string, pick: (kind: InstrumentKind, preset: number) => void) {
  app.overlays.dialog(title, (close) => h("div", { class: "picker" },
    KINDS.map((k) => h("button", {
      class: `pick-card kind-${k}`, "data-nav": `pick-${k}`,
      // A second copy of an instrument starts on a preset the song isn't using yet.
      onclick: () => { close(); const used = usedPresets(app.song, k); pick(k, used.length ? pickPreset(k, used) : 0); },
    }, h("div", { class: "pick-name" }, INSTRUMENTS[k].name), h("div", { class: "pick-role" }, INSTRUMENTS[k].role))),
    h("button", {
      class: "pick-card random", "data-nav": "pick-random",
      onclick: () => {
        close();
        const k = KINDS[Math.floor(Math.random() * KINDS.length)];
        pick(k, pickPreset(k, usedPresets(app.song, k)));
      },
    }, h("div", { class: "pick-name" }, "🎲 Random"), h("div", { class: "pick-role" }, "Any instrument, any preset")),
  ));
}

// ------------------------------------------------------------ song settings

const taps: number[] = [];

export function songSettings(app: App) {
  app.overlays.dialog("Song", (close, rerender) => {
    const s = app.song;
    const set = (label: string, fn: () => void) => { app.edit(label, fn, { render: false }); app.renderHeader(); rerender(); };
    const scaleIdx = SCALES.findIndex((x) => x.id === s.scale);
    return h("div", { class: "form" },
      h("button", { class: "row-btn", "data-nav": "title", onclick: () => { const t = prompt("Song title", s.title); if (t) set("Rename song", () => (s.title = t.slice(0, 40))); } }, `Title: ${s.title}`),
      stepper("tempo", "Tempo", `${s.tempo} bpm`, (d) => set("Tempo", () => (s.tempo = Math.max(40, Math.min(250, s.tempo + d))))),
      h("button", {
        class: "row-btn tap", "data-nav": "tap",
        onclick: () => {
          const now = performance.now();
          if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
          taps.push(now);
          if (taps.length >= 3) {
            const iv = taps.slice(-6).map((t, i, a) => (i ? t - a[i - 1] : 0)).slice(1);
            const bpm = Math.round(60000 / (iv.reduce((x, y) => x + y, 0) / iv.length));
            set("Tap tempo", () => (s.tempo = Math.max(40, Math.min(250, bpm))));
          } else rerender();
        },
      }, `Tap tempo${taps.length ? ` (${taps.length})` : ""}`),
      stepper("swing", "Swing", `${s.swing}%`, (d) => set("Swing", () => (s.swing = Math.max(0, Math.min(100, s.swing + d * 5))))),
      stepper("key", "Key", NOTE_NAMES[s.key], (d) => set("Key", () => (s.key = (s.key + d + 12) % 12))),
      stepper("scale", "Scale", scaleById(s.scale).name, (d) => set("Scale", () => (s.scale = SCALES[(scaleIdx + d + SCALES.length) % SCALES.length].id))),
      h("button", { class: "row-btn" + (s.metronome ? " on" : ""), "data-nav": "metro", onclick: () => set("Metronome", () => (s.metronome = !s.metronome)) }, `Metronome: ${s.metronome ? "on" : "off"}`),
      h("button", { class: "row-btn" + (s.songLoop ? " on" : ""), "data-nav": "loop", onclick: () => set("Song loop", () => (s.songLoop = !s.songLoop)) }, `Song loop: ${s.songLoop ? "on" : "off"}`),
      h("button", { class: "row-btn primary", "data-nav": "done", onclick: close }, "Done"),
    );
  });
}

// ------------------------------------------------------------ export

export function exportDialog(app: App, then?: () => void) {
  const opts = { what: "mix" as "mix" | number, tail: 2, bits: 16 as 16 | 24, rate: 44100 };
  let status = "";
  let busy = false;
  app.overlays.dialog("Export WAV", (close, rerender) => {
    const s = app.song;
    const whatLabel = opts.what === "mix" ? "Full mix" : `${s.tracks.findIndex((t) => t.id === opts.what) + 1} ${s.tracks.find((t) => t.id === opts.what)?.name ?? ""}`;
    const choices: ("mix" | number)[] = ["mix", ...s.tracks.map((t) => t.id)];
    return h("div", { class: "form" },
      stepper("what", "Export", whatLabel, (d) => { opts.what = choices[(choices.indexOf(opts.what) + d + choices.length) % choices.length]; rerender(); }),
      stepper("tail", "Reverb tail", `${opts.tail} s`, (d) => { opts.tail = [0, 1, 2, 5][([0, 1, 2, 5].indexOf(opts.tail) + d + 4) % 4]; rerender(); }),
      stepper("bits", "Format", `${opts.bits}-bit`, () => { opts.bits = opts.bits === 16 ? 24 : 16; rerender(); }),
      stepper("rate", "Sample rate", `${opts.rate / 1000} kHz`, () => { opts.rate = opts.rate === 44100 ? 48000 : 44100; rerender(); }),
      h("p", { class: "note" }, `Plays the song once top to bottom (scene repeats included), ${s.scenes.length} scene${s.scenes.length > 1 ? "s" : ""}.`),
      status ? h("p", { class: "status" }, status) : null,
      h("button", {
        class: "row-btn primary", "data-nav": "go", disabled: busy,
        onclick: async () => {
          if (busy) return;
          busy = true; status = "Rendering…"; rerender();
          try {
            const t0 = performance.now();
            const buf = await app.engine.render(s, { tail: opts.tail, sampleRate: opts.rate, onlyTrack: opts.what === "mix" ? undefined : opts.what });
            const wav = encodeWav(buf, opts.bits);
            const base = (s.title || "rollbox").replace(/[^\w\- ]+/g, "").trim() || "rollbox";
            const suffix = opts.what === "mix" ? "" : `-${whatLabel.replace(/\s+/g, "-")}`;
            download(`${base}${suffix}.wav`, wav, "audio/wav");
            status = `Done: ${buf.duration.toFixed(1)} s, peak ${peakDb(buf).toFixed(1)} dBFS, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
          } catch (e) {
            status = `Export failed: ${e}`;
          }
          busy = false;
          rerender();
          then?.();
        },
      }, busy ? "Rendering…" : "Render & download"),
      h("button", { class: "row-btn", "data-nav": "close", onclick: close }, "Close"),
    );
  });
}

// ------------------------------------------------------------ settings

export function settingsDialog(app: App) {
  let devices: MediaDeviceInfo[] = [];
  const refreshDevices = async () => {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput" && d.deviceId !== "default");
  };
  let rr: (() => void) | null = null;
  app.overlays.dialog("Settings", (close, rerender) => {
    rr = rerender;
    const st = app.settings, eng = app.engine;
    const devIdx = devices.findIndex((d) => d.deviceId === st.outputDevice);
    const devName = st.outputDevice ? devices[devIdx]?.label || "selected device" : "Windows default";
    const mini = app.midi.miniLabConnected;
    return h("div", { class: "form settings" },
      h("div", { class: "section-title" }, "Audio"),
      stepper("out", "Output", devName, async (d) => {
        if (!devices.length) await refreshDevices();
        const ids = ["", ...devices.map((x) => x.deviceId)];
        st.outputDevice = ids[(ids.indexOf(st.outputDevice) + d + ids.length) % ids.length];
        app.saveSettings();
        await eng.setOutputDevice(st.outputDevice).catch((e) => app.overlays.toast(`Can't switch output: ${e}`));
        rerender();
      }),
      h("button", { class: "row-btn", "data-nav": "names", onclick: async () => {
        try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch { /* names stay hidden */ }
        await refreshDevices(); rerender();
      } }, "Show device names (asks for mic permission)"),
      h("p", { class: "note" }, `Output latency ${((eng.ctx.baseLatency + (eng.ctx.outputLatency || 0)) * 1000).toFixed(0)} ms at ${eng.ctx.sampleRate} Hz. Recorded notes are shifted back by this much.`),
      h("div", { class: "section-title" }, "MIDI"),
      h("p", { class: "note" }, app.midi.error || (app.midi.inputs().length ? `Inputs: ${app.midi.inputs().map((i) => i.name).join(", ")}` : "No MIDI inputs found. Plug one in; it's picked up live.")),
      mini ? h("p", { class: "note ok" }, "MiniLab mkII detected: keys play the selected track (scale-locked), knobs 1-8 = the track's 8 macros, knobs 9-16 = track volumes, pads = drum parts on a drum track, otherwise scene launch. Knob 1 click = play/stop.") : null,
      app.midi.knobModes().length ? h("p", { class: "note" }, `Knob modes seen: ${app.midi.knobModes().join(", ")}`) : null,
      h("button", { class: "row-btn", "data-nav": "monitor", onclick: () => midiMonitor(app) }, "MIDI monitor…"),
      h("div", { class: "section-title" }, "Controller"),
      h("p", { class: "note" }, app.pad.connected ? `Gamepad: ${app.pad.connected}` : "No gamepad seen yet. Press a button on it."),
      stepper("layout", "Button layout", { auto: "Auto-detect", xbox: "Xbox (A bottom)", nintendo: "Nintendo (A right)" }[st.padLayout], (d) => {
        const o: typeof st.padLayout[] = ["auto", "xbox", "nintendo"];
        st.padLayout = o[(o.indexOf(st.padLayout) + d + 3) % 3];
        app.saveSettings();
        rerender();
      }),
      h("div", { class: "section-title" }, "Editing"),
      toggle("preview", "Note preview", st.notePreview, () => { st.notePreview = !st.notePreview; app.saveSettings(); rerender(); }),
      toggle("lock", "Scale lock", st.scaleLock, () => { st.scaleLock = !st.scaleLock; app.saveSettings(); rerender(); app.refresh(); }),
      toggle("rq", "Quantize while recording", st.recQuantize, () => { st.recQuantize = !st.recQuantize; app.saveSettings(); rerender(); }),
      toggle("ci", "Count-in (1 bar) before recording", st.countIn, () => { st.countIn = !st.countIn; app.saveSettings(); rerender(); }),
      h("button", { class: "row-btn primary", "data-nav": "done", onclick: close }, "Done"),
    );
  }, { wide: true });
  void refreshDevices().then(() => rr?.());
}

function toggle(id: string, label: string, on: boolean, fn: () => void) {
  return h("button", { class: "row-btn" + (on ? " on" : ""), "data-nav": id, onclick: fn }, `${label}: ${on ? "on" : "off"}`);
}

function midiMonitor(app: App) {
  let timer = 0;
  app.overlays.dialog("MIDI monitor", (close, rerender) => {
    clearTimeout(timer);
    timer = setTimeout(rerender, 300) as unknown as number;
    const lines = app.midi.monitor.slice(-24).reverse();
    return h("div", { class: "form" },
      h("p", { class: "note" }, "Move each MiniLab knob and hit each pad, then tell me what shows up here if anything is mapped wrong."),
      h("pre", { class: "monitor" }, lines.length ? lines.map((l) => `${l.device.slice(0, 18).padEnd(18)} ${l.text}`).join("\n") : "(waiting for MIDI…)"),
      h("button", { class: "row-btn primary", "data-nav": "done", onclick: () => { clearTimeout(timer); close(); } }, "Done"),
    );
  }, { wide: true, onClose: () => clearTimeout(timer) });
}

// ------------------------------------------------------------ time's up

export function timeUpDialog(app: App) {
  app.engine.stop();
  app.overlays.closeAll();
  const arrange = canArrange(app.song);
  app.overlays.dialog("⏰ Time's up!", (close) => h("div", { class: "form" },
    h("p", { class: "note big" }, "Editing is locked. Finish it:"),
    arrange ? h("button", {
      class: "row-btn primary", "data-nav": "finish",
      onclick: () => {
        close();
        app.history.push(app.song, "Auto-arrange");
        autoArrange(app.song);
        app.changed();
        app.songMode = "song";
        app.show("song");
        exportDialog(app);
      },
    }, "Auto-arrange into a full song, then export") : null,
    h("button", { class: "row-btn" + (arrange ? "" : " primary"), "data-nav": "export", onclick: () => { close(); exportDialog(app); } }, "Export WAV as it is"),
    h("button", { class: "row-btn", "data-nav": "listen", onclick: () => { close(); app.songMode = "song"; app.show("song"); app.engine.play({ kind: "song", fromIndex: 0 }); app.renderHeader(); } }, "Just listen (stays locked)"),
    h("button", { class: "row-btn", "data-nav": "unlock", onclick: () => { close(); app.unlock(); } }, "Unlock and keep going"),
  ));
}

// ------------------------------------------------------------ system menu

export function systemMenu(app: App, newJam: () => void) {
  app.overlays.menu("Rollbox", () => [
    { label: "New jam (dice)…", run: newJam },
    { label: "Song settings…", run: () => songSettings(app) },
    { label: "Export WAV…", run: () => exportDialog(app) },
    { label: "Song screen", hint: "F2", run: () => app.show("song") },
    { label: "Mixer", hint: "F4", run: () => app.show("mix") },
    { label: "Play mode: scene loop", checked: app.songMode === "scene", run: () => { app.songMode = "scene"; app.renderHeader(); } },
    { label: "Play mode: whole song", checked: app.songMode === "song", run: () => { app.songMode = "song"; app.renderHeader(); } },
    { label: "Auto-arrange (one-scene songs)", disabled: !canArrange(app.song), run: () => app.edit("Auto-arrange", () => autoArrange(app.song)) },
    { label: "Settings…", run: () => settingsDialog(app) },
    { label: "Controls…", run: () => helpDialog(app) },
  ]);
}

export function helpDialog(app: App) {
  const row = (k: string, v: string) => h("tr", null, h("td", null, k), h("td", null, v));
  app.overlays.dialog("Controls", (close) => h("div", { class: "form" },
    h("table", { class: "help" },
      h("tr", null, h("th", null, "Gamepad"), h("th", null, "")),
      row("Stick / D-pad", "Move the cursor"),
      row("A", "Place / delete note, open, confirm. Hold A + left/right: note length"),
      row("B", "Back"),
      row("X", "Context menu"),
      row("Y", "Play / stop. Hold: record"),
      row("Right stick", "Turn knob. In the roll: length (←→), velocity (↑↓), or draw the automation lane (↑↓) when one is open"),
      row("LT / ZL (hold)", "Fine adjust"),
      row("RT / ZR (hold) + move", "Select a range"),
      row("RB / R", "Switch piano roll ↔ instrument panel"),
      row("LB / L (hold)", "Jump to any track / scene"),
      row("Start / +", "App menu.  Back / −: undo"),
      h("tr", null, h("th", null, "Keyboard"), h("th", null, "")),
      row("Arrows, Enter, Esc", "Move, confirm (hold Enter + ←→: length), back"),
      row("A S D F G H J K L ; '", "Play notes (scale degrees when scale lock is on), Q-row = octave up"),
      row("Z / X", "Octave down / up"),
      row("Space / Shift+Space", "Play-stop / record"),
      row("Shift + arrows", "Select a range"),
      row("M", "Context menu.  Tab: roll ↔ panel.  ` (hold): jump overlay"),
      row(", .  /  - =", "Knob / note length  ·  velocity"),
      row("Ctrl+Z / Y / C / X / V / D / A", "Undo, redo, copy, cut, paste, duplicate clip, select all"),
      row("Delete", "Delete notes.  F1: app menu.  F2/F3/F4: song / editor / mixer"),
    ),
    h("button", { class: "row-btn primary", "data-nav": "done", onclick: close }, "Done"),
  ), { wide: true });
}
