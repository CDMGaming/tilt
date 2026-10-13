// Dialogs: instrument picker, song settings (tempo/tap/swing/key/scale),
// WAV export, settings, the time-up flow and the system menu.

import { autoArrange, canArrange } from "../engine/arranger";
import { pickPreset, usedPresets } from "../engine/dice";
import { ALL_KINDS, INSTRUMENTS } from "../engine/instruments";
import type { InstrumentKind } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { encodeWav, peakDb } from "../engine/wav";
import type { App } from "./app";
import { download, h } from "./dom";
import { libraryDialog, safeName } from "./library";
import { challengeStatus } from "../engine/challenges";
import { phraseGridDialog } from "./phrasegrid";
import { exportMidi } from "../engine/smf";
import { zip } from "../engine/zip";
import { stepper } from "./overlay";

const KINDS: InstrumentKind[] = ALL_KINDS;

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

type ExportWhat = "mix" | "stems" | "midi" | number;

export function exportDialog(app: App, then?: () => void) {
  const opts = { what: "mix" as ExportWhat, tail: 2, bits: 16 as 16 | 24, rate: 44100 };
  let status = "";
  let busy = false;
  app.overlays.dialog("Export", (close, rerender) => {
    const s = app.song;
    const label = (w: ExportWhat) =>
      w === "mix" ? "Full mix (WAV)" : w === "stems" ? "All stems (zip of WAVs)" : w === "midi" ? "MIDI file (.mid)"
        : `Track ${s.tracks.findIndex((t) => t.id === w) + 1}: ${INSTRUMENTS[s.tracks.find((t) => t.id === w)!.kind].name} (WAV)`;
    const choices: ExportWhat[] = ["mix", "stems", "midi", ...s.tracks.map((t) => t.id)];
    const audio = opts.what !== "midi";
    const base = safeName(s.title);
    const run = async () => {
      if (busy) return;
      busy = true; status = "Rendering…"; rerender();
      try {
        const t0 = performance.now();
        const took = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`;
        if (opts.what === "midi") {
          download(`${base}.mid`, exportMidi(s), "audio/midi");
          status = `Done: MIDI file with ${s.tracks.length} tracks (drums on channel 10, General MIDI notes).`;
        } else if (opts.what === "stems") {
          const files: { name: string; data: Uint8Array }[] = [];
          for (let i = 0; i < s.tracks.length; i++) {
            const t = s.tracks[i];
            status = `Rendering stem ${i + 1} of ${s.tracks.length}…`; rerender();
            const buf = await app.engine.render(s, { tail: opts.tail, sampleRate: opts.rate, onlyTrack: t.id });
            files.push({ name: `${String(i + 1).padStart(2, "0")} ${INSTRUMENTS[t.kind].name} - ${safeName(t.preset)}.wav`, data: encodeWav(buf, opts.bits) });
          }
          status = "Rendering the full mix…"; rerender();
          const mix = await app.engine.render(s, { tail: opts.tail, sampleRate: opts.rate });
          files.push({ name: `00 Full mix.wav`, data: encodeWav(mix, opts.bits) });
          files.push({ name: `${base}.mid`, data: exportMidi(s) });
          download(`${base} stems.zip`, zip(files), "application/zip");
          status = `Done: ${s.tracks.length} stems + full mix + MIDI in one zip, ${mix.duration.toFixed(1)} s long, rendered in ${took()}. All stems start at 0:00, so they line up when dropped into a DAW.`;
        } else {
          const buf = await app.engine.render(s, { tail: opts.tail, sampleRate: opts.rate, onlyTrack: opts.what === "mix" ? undefined : opts.what });
          const suffix = opts.what === "mix" ? "" : ` - track ${s.tracks.findIndex((t) => t.id === opts.what) + 1}`;
          download(`${base}${suffix}.wav`, encodeWav(buf, opts.bits), "audio/wav");
          status = `Done: ${buf.duration.toFixed(1)} s, peak ${peakDb(buf).toFixed(1)} dBFS, rendered in ${took()}.`;
        }
      } catch (e) {
        status = `Export failed: ${e}`;
      }
      busy = false;
      rerender();
      then?.();
    };
    return h("div", { class: "form" },
      stepper("what", "Export", label(opts.what), (d) => { opts.what = choices[(choices.indexOf(opts.what) + d + choices.length) % choices.length]; rerender(); }),
      audio ? stepper("tail", "Reverb tail", `${opts.tail} s`, (d) => { opts.tail = [0, 1, 2, 5][([0, 1, 2, 5].indexOf(opts.tail) + d + 4) % 4]; rerender(); }) : null,
      audio ? stepper("bits", "Format", `${opts.bits}-bit`, () => { opts.bits = opts.bits === 16 ? 24 : 16; rerender(); }) : null,
      audio ? stepper("rate", "Sample rate", `${opts.rate / 1000} kHz`, () => { opts.rate = opts.rate === 44100 ? 48000 : 44100; rerender(); }) : null,
      h("p", { class: "note" }, `Plays the song once top to bottom (scene repeats included), ${s.scenes.length} scene${s.scenes.length > 1 ? "s" : ""}.`),
      status ? h("p", { class: "status" }, status) : null,
      h("button", { class: "row-btn primary", "data-nav": "go", disabled: busy, onclick: run }, busy ? "Working…" : "Export & download"),
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
      app.midi.pushConnected ? h("p", { class: "note ok" }, "Push 1 connected: Session button = clip grid, Note button = steps + keys, encoders = macros (upper buttons: Macros / Mixer / FX), Play / Record / Tap / Undo / Double / Quantize / Mute / Solo work. The LCD shows the countdown.") : null,
      app.midi.knobModes().length ? h("p", { class: "note" }, `Knob modes seen: ${app.midi.knobModes().join(", ")}`) : null,
      stepper("sync", "MIDI sync", { int: "Internal", ext: "Follow external clock", auto: "Auto (follow when clock arrives)" }[st.midiSync], (d) => {
        const o: typeof st.midiSync[] = ["auto", "int", "ext"];
        st.midiSync = o[(o.indexOf(st.midiSync) + d + 3) % 3];
        app.saveSettings();
        rerender();
      }),
      stepper("clockout", "Send clock to", st.clockOut ? app.midi.outputs().find((o) => o.id === st.clockOut)?.name ?? "(disconnected)" : "Off", (d) => {
        const ids = ["", ...app.midi.outputs().map((o) => o.id)];
        st.clockOut = ids[(ids.indexOf(st.clockOut) + d + ids.length) % ids.length];
        app.saveSettings();
        rerender();
      }),
      h("p", { class: "note" }, app.engine.externalTempo ? `Following external clock at ${app.engine.externalTempo.toFixed(1)} bpm.` : "Follow: Rollbox starts, stops and keeps tempo with incoming MIDI clock. Send: it drives other gear (and Ableton, with Sync on its MIDI input) while it plays."),
      h("button", { class: "row-btn", "data-nav": "monitor", onclick: () => midiMonitor(app) }, "MIDI monitor…"),
      h("button", { class: "row-btn", "data-nav": "learn-play", onclick: () => { app.learnTransport = "play"; app.overlays.toast("Press the button on your MIDI device for play / stop"); } },
        `Transport CC, play / stop: ${st.transport.play ? `CC ${st.transport.play.cc} ch ${st.transport.play.ch + 1}` : "not set"} (click, then press a button)`),
      h("button", { class: "row-btn", "data-nav": "learn-rec", onclick: () => { app.learnTransport = "record"; app.overlays.toast("Press the button on your MIDI device for record"); } },
        `Transport CC, record: ${st.transport.record ? `CC ${st.transport.record.cc} ch ${st.transport.record.ch + 1}` : "not set"}`),
      h("button", { class: "row-btn", "data-nav": "learn", onclick: () => { close(); app.setLearning(true); } }, "MIDI learn for knobs…"),
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
      toggle("gas", "Show the phrase grid right after START", st.gridAtStart, () => { st.gridAtStart = !st.gridAtStart; app.saveSettings(); rerender(); }),
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
    ...challengeStatus(app.song).map((c) => h("p", { class: "note" }, `${c.met ? "✅" : "⬜"} ${c.text}`)),
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

/** Solo is the default; this is the door to playing with other people. */
export function playTogetherDialog(app: App) {
  app.overlays.dialog("Play together", (close) => h("div", { class: "form together" },
    h("button", { class: "row-btn primary", "data-nav": "couch", onclick: () => { close(); app.startCouch(); } },
      h("div", { class: "together-title" }, app.couch ? "🛋 Back to the couch" : "🛋 Couch: everyone on this computer"),
      h("div", { class: "note" }, "2 to 4 players, one controller each (gamepads, the keyboard, MIDI keyboards, the Push). The screen splits in four; each player gets one instrument. The others join by pressing A / Enter / a note.")),
    h("button", { class: "row-btn", "data-nav": "host", onclick: () => { close(); onlineDialog(app, "host"); } },
      h("div", { class: "together-title" }, "🌐 Host an online game"),
      h("div", { class: "note" }, "Friends join with a code. Everyone gets one instrument and paints notes into it; the loop plays on every computer.")),
    h("button", { class: "row-btn", "data-nav": "join", onclick: () => { close(); onlineDialog(app, "join"); } },
      h("div", { class: "together-title" }, "🔗 Join an online game"),
      h("div", { class: "note" }, "Type the code the host gives you. Their song opens here (yours stays in your library).")),
    h("button", { class: "row-btn", "data-nav": "close", onclick: close }, "Back")));
}

/** Host or join: your name, the code (joining), and the server (advanced). */
export function onlineDialog(app: App, mode: "host" | "join") {
  const st = app.settings;
  const name = h("input", { class: "text-input", "data-nav": "name", value: st.netName, placeholder: "Your name", maxlength: 20 }) as HTMLInputElement;
  const code = h("input", { class: "text-input code-input", "data-nav": "code", placeholder: "Game code (4 letters)", maxlength: 4 }) as HTMLInputElement;
  const server = h("input", { class: "text-input", "data-nav": "server", value: st.relayUrl, placeholder: `ws://${location.hostname || "localhost"}:8787` }) as HTMLInputElement;
  const status = h("p", { class: "note" }, "");
  app.overlays.dialog(mode === "host" ? "Host an online game" : "Join an online game", (close) => {
    const go = async () => {
      st.netName = name.value.trim().slice(0, 20);
      st.relayUrl = server.value.trim();
      app.saveSettings();
      status.textContent = "Connecting…";
      try {
        if (mode === "host") {
          const room = await app.hostOnline();
          close();
          app.overlays.dialog("Your game is open", (done) => h("div", { class: "form" },
            h("p", { class: "note" }, "Friends choose Play together → Join and type:"),
            h("div", { class: "big-code" }, room),
            h("p", { class: "note" }, "They need to reach the same online server as you."),
            h("button", { class: "row-btn primary", "data-nav": "ok", onclick: done }, "Start jamming")));
        } else {
          if (code.value.trim().length !== 4) { status.textContent = "The code is 4 letters"; return; }
          await app.joinOnline(code.value);
          status.textContent = "Connected, waiting for the host's song…";
          setTimeout(close, 300);
        }
      } catch (e) {
        status.textContent = String(e);
      }
    };
    return h("div", { class: "form" },
      h("label", { class: "field" }, "Your name", name),
      mode === "join" ? h("label", { class: "field" }, "Game code", code) : "",
      h("details", { class: "advanced" }, h("summary", null, "Online server"), server,
        h("p", { class: "note" }, "Leave empty to use the server on this computer (run: deno run -A tools/relay.ts).")),
      status,
      h("button", { class: "row-btn primary", "data-nav": "go", onclick: () => void go() }, mode === "host" ? "Open the game" : "Join"),
      h("button", { class: "row-btn", "data-nav": "cancel", onclick: close }, "Cancel"));
  });
}

export function systemMenu(app: App, newJam: () => void) {
  app.overlays.menu("Rollbox", () => [
    ...(app.couch ? [{ label: "End couch mode", run: () => app.endCouch() }] : []),
    { label: app.couch ? "🛋 Back to the couch" : "👥 Play together…", run: () => (app.couch ? app.show("couch") : playTogetherDialog(app)) },
    { label: "New jam (dice)…", run: newJam },
    { label: "Songs (library)…", run: () => libraryDialog(app, { onOpen: () => app.show("song") }) },
    { label: "💡 Stuck? Phrase grid for this scene…", disabled: app.locked, run: () => phraseGridDialog(app, { sceneId: app.currentSceneId(), onDone: () => app.refresh() }) },
    { label: "Song settings…", run: () => songSettings(app) },
    { label: "Export (WAV, stems, MIDI)…", run: () => exportDialog(app) },
    { label: "Song screen", hint: "F2", run: () => app.show("song") },
    { label: "Mixer", hint: "F4", run: () => app.show("mix") },
    { label: "Play mode: scene loop", checked: app.songMode === "scene", run: () => { app.songMode = "scene"; app.renderHeader(); } },
    { label: "Play mode: whole song", checked: app.songMode === "song", run: () => { app.songMode = "song"; app.renderHeader(); } },
    { label: "Auto-arrange (one-scene songs)", disabled: !canArrange(app.song), run: () => app.edit("Auto-arrange", () => autoArrange(app.song)) },
    { label: app.learning ? "MIDI learn: finish" : "MIDI learn…", run: () => app.setLearning(!app.learning) },
    { label: "Oscilloscope", run: () => app.toggleScope?.() },
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
      row("Right stick", "Turn knob. In the roll: length (←→), velocity (↑↓), or draw the automation lane (↑↓) when one is open. Delete removes the lane point at the cursor"),
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
      h("tr", null, h("th", null, "MIDI"), h("th", null, "")),
      row("MIDI learn", "App menu → MIDI learn: touch a knob, move a hardware control. Transport CCs in Settings"),
    ),
    h("button", { class: "row-btn primary", "data-nav": "done", onclick: close }, "Done"),
  ), { wide: true });
}
