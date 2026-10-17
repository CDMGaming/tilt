// Dialogs: instrument picker, song settings (tempo/tap/swing/key/scale),
// WAV export, settings and the system menu (time's up: timeup.ts).

import { defaultRelayUrl } from "./app";
import { autoArrange, canArrange } from "../engine/arranger";
import { pickPreset, usedPresets } from "../engine/dice";
import { ALL_KINDS, INSTRUMENTS } from "../engine/instruments";
import type { InstrumentKind } from "../engine/model";
import { NOTE_NAMES, SCALES, scaleById } from "../engine/music";
import { encodeWav, peakDb } from "../engine/wav";
import type { App } from "./app";
import { download, h } from "./dom";
import { libraryDialog, safeName } from "./library";
import { shareCodeDialog } from "./share";
import { enterCodeDialog, shareSongDialog } from "./sharesong";
import { tutorialLabel, tutorialStatus } from "./tutorial";
import { lastInput } from "./lastinput";
import { dmdText } from "./dmd";

declare const __BUILD__: string;
import { phraseGridDialog } from "./phrasegrid";
import { exportMidi } from "../engine/smf";
import { zip } from "../engine/zip";
import { stepper } from "./overlay";
import { GEN_SHARES } from "./sounds";

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

/**
 * Game mode: the pinball side of TILT. Off (the default) it's a quick-start DAW: the timer
 * pauses, and at zero says TIME with unlimited extra balls. On: challenge cards, no pausing,
 * editing locks at zero, the TILT flash and buzz, then SONG COMPLETE with one EXTRA BALL.
 */
export function gameModeDialog(app: App, onChange?: () => void) {
  const st = app.settings;
  app.overlays.dialog("Game mode", (_close, rerender) => h("div", { class: "form" },
    h("button", { class: "switch-row" + (st.gameMode ? " on" : ""), "data-nav": "game", onclick: () => { st.gameMode = !st.gameMode; app.saveSettings(); rerender(); app.renderHeader(); onChange?.(); } },
      h("span", { class: "switch-row-label" }, "Game mode"), h("span", { class: "switch-row-value" }, st.gameMode ? "ON" : "OFF")),
    h("p", { class: "note" }, "With game mode on:"),
    h("ul", { class: "note game-list" },
      h("li", null, "Challenge cards: dealt on the setup screen, shown in the top bar."),
      h("li", null, "No pausing the timer: the clock is the game."),
      h("li", null, "At zero, editing locks: TILT flashes with a buzz, then SONG COMPLETE with your challenge results. Editing stays locked until you choose what's next."),
      h("li", null, "EXTRA BALL: five more minutes, once per session."),
    ),
    h("p", { class: "note" }, "Off (the default), the timer can be paused, and at zero the display says TIME and the same card comes up, with as many extra balls as you like. Nothing locks."),
    h("p", { class: "note" }, "Either way, at zero the bar that's playing finishes and fades out, and the song is kept as a timed take (Songs → the song → Versions)."),
    st.gameMode ? stepper("cards", "Challenge cards", app.dice.cards ? String(app.dice.cards) : "Off", (d) => {
      app.dice.cards = Math.max(0, Math.min(3, app.dice.cards + d));
      app.saveDice();
      rerender();
      onChange?.();
    }) : "",
    h("button", { class: "row-btn primary", "data-nav": "ok", onclick: () => _close() }, "Done")));
}

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
        await eng.setOutputDevice(st.outputDevice).catch((e) => app.overlays.toast(`Can't switch output: ${e}`, 4000, { error: true }));
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
      h("p", { class: "note" }, app.engine.externalTempo ? `Following external clock at ${app.engine.externalTempo.toFixed(1)} bpm.` : "Follow: TILT starts, stops and keeps tempo with incoming MIDI clock. Send: it drives other gear (and Ableton, with Sync on its MIDI input) while it plays."),
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
      h("div", { class: "section-title" }, "Timer"),
      toggle("tick", "Soft tick in the last 10 seconds", !!st.timerTick, () => { st.timerTick = !st.timerTick; app.saveSettings(); rerender(); }),
      stepper("after-save", "After Save as-is", { "": "Ask", library: "Go to my songs", stay: "Stay here" }[st.afterTimedSave ?? ""], (d) => {
        const o: ("" | "library" | "stay")[] = ["", "library", "stay"];
        st.afterTimedSave = o[(o.indexOf(st.afterTimedSave ?? "") + d + 3) % 3];
        app.saveSettings();
        rerender();
      }),
      toggle("gas", "Show the phrase grid right after START", st.gridAtStart, () => { st.gridAtStart = !st.gridAtStart; app.saveSettings(); rerender(); }),
      h("div", { class: "section-title" }, "Sounds"),
      stepper("genshare", "Generated sounds", st.genShare ? `${Math.round(st.genShare * 100)}% of rolls` : "Off: curated only", (d) => {
        const i = GEN_SHARES.indexOf(st.genShare);
        st.genShare = GEN_SHARES[Math.max(0, Math.min(GEN_SHARES.length - 1, (i < 0 ? 2 : i) + d))];
        app.saveSettings();
        rerender();
      }),
      h("p", { class: "note" }, "The dice and NUDGE pick a sound by role (drums, bass, lead, pad, keys, pluck, arp, fx). Some are new ones grown from an instrument's recipe, marked ✦; they're saved in the song, and ★ Save keeps one for every song."),
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
  const server = h("input", { class: "text-input", "data-nav": "server", value: st.relayUrl, placeholder: defaultRelayUrl() }) as HTMLInputElement;
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
        h("p", { class: "note" }, "Leave empty to use the server this page came from. Everyone in a game must use the same one.")),
      status,
      h("button", { class: "row-btn primary", "data-nav": "go", onclick: () => void go() }, mode === "host" ? "Open the game" : "Join"),
      h("button", { class: "row-btn", "data-nav": "cancel", onclick: close }, "Cancel"));
  });
}

export function systemMenu(app: App, newJam: () => void) {
  app.overlays.menu(`TILT · ${app.song.title}`, () => [
    ...(app.couch ? [{ label: "End couch mode", run: () => app.endCouch() }] : []),
    { label: "⚄ Dice: new jam…", run: newJam },
    { label: "▤ Songs (library)…", run: () => libraryDialog(app, { onOpen: () => app.show("song") }) },
    { label: app.couch ? "🛋 Back to the couch" : "👥 Together: couch or online…", run: () => (app.couch ? app.show("couch") : playTogetherDialog(app)) },
    { label: "⬇ Export (WAV, stems, MIDI)…", run: () => exportDialog(app) },
    { label: "⇪ Share song…", disabled: !app.song.tracks.length, run: () => shareSongDialog(app) },
    { label: "🎲 Share setup code…", disabled: !app.song.tracks.length, run: () => shareCodeDialog(app) },
    { label: "Open a code or link…", run: () => enterCodeDialog(app) },
    { label: "⚙ Settings…", run: () => settingsDialog(app) },
    { label: "🎮 Game mode…", checked: app.settings.gameMode, run: () => gameModeDialog(app, () => app.refresh()) },
    { label: "💡 Stuck? Phrase grid for this scene…", disabled: app.locked, run: () => phraseGridDialog(app, { sceneId: app.currentSceneId(), onDone: () => app.refresh() }) },
    { label: "Song settings…", run: () => songSettings(app) },
    { label: "Song screen", hint: "F2", run: () => app.show("song") },
    { label: "Edit screen", hint: "F3", disabled: !app.song.tracks.length, run: () => app.show("edit") },
    { label: "Mixer", hint: "F4", run: () => app.show("mix") },
    { label: "Play mode: SCENE (loop the scene)", hint: "C", checked: app.songMode === "scene", run: () => app.setSongMode("scene") },
    { label: "Play mode: SONG (scenes in order)", hint: "C", checked: app.songMode === "song", run: () => app.setSongMode("song") },
    { label: app.songMode === "song" ? "Loop the song" : "Loop the scene", checked: app.loopOn(), keepOpen: true, run: () => app.toggleLoop() },
    { label: "Metronome (click)", checked: app.song.metronome, keepOpen: true, run: () => app.edit("Metronome", () => (app.song.metronome = !app.song.metronome)) },
    { label: "Auto-arrange (one-scene songs)", disabled: !canArrange(app.song), run: () => app.edit("Auto-arrange", () => autoArrange(app.song)) },
    { label: app.learning ? "MIDI learn: finish" : "MIDI learn…", run: () => app.setLearning(!app.learning) },
    { label: "Oscilloscope", run: () => app.toggleScope?.() },
    { label: "Help: controls, tutorial, about…", hint: "?", run: () => helpDialog(app) },
    { label: tutorialLabel(), run: () => app.openTutorial?.() },
  ]);
}

type HelpPage = "controls" | "tutorial" | "about";
type ControlsTab = "gamepad" | "keyboard" | "touch" | "setup" | "midi";

const CONTROLS: Record<ControlsTab, { label: string; rows: [string, string][] }> = {
  gamepad: { label: "Gamepad", rows: [
    ["Stick / D-pad", "Move the cursor"],
    ["A", "Place / delete note, open, confirm. Hold A + left/right: note length"],
    ["B", "Back"],
    ["X", "Context menu"],
    ["Y", "Play / stop. Hold: record. On the setup screen: NUDGE (hold: new song)"],
    ["Right stick", "Turn knob. In the roll: length (←→), velocity (↑↓), or draw the automation lane (↑↓) when one is open"],
    ["LT / ZL (hold)", "Fine adjust.  + up / down on the Song screen: move the scene.  + LB / RB: shorter / longer new notes"],
    ["X in the piano roll", "Split, join, legato, set length, new note length"],
    ["RT / ZR (hold) + move", "Select a range"],
    ["RB / R", "Switch piano roll ↔ instrument panel. Hold: roll only / split / panel only"],
    ["LB / L", "Jump to an instrument or phrase: hold, move, release. A quick tap leaves it open (A picks, B cancels). Couch / online: a free instrument becomes yours, another player's opens read-only (☰: ask to swap)"],
    ["Left stick click (L3)", "Play: SCENE (this scene) ↔ SONG (the song chain)"],
    ["Right stick click (R3)", "Tutorial: I'm ready (next step)"],
    ["Start / +", "App menu.  Back / −: undo"],
  ] },
  keyboard: { label: "Keyboard", rows: [
    ["Arrows, Enter, Esc", "Move, confirm (hold Enter + ←→: length), back"],
    ["A S D F G H J K L ; '", "Play notes (scale degrees when scale lock is on), Q-row = octave up"],
    ["Z / X", "Octave down / up"],
    ["Space / Shift+Space", "Play-stop / record. On the setup screen: NUDGE / new song"],
    ["C", "Play: SCENE (this scene) ↔ SONG (all the scenes in order)"],
    ["Alt + ↑ / ↓", "Song screen: move the scene up / down"],
    ["Shift + arrows", "Select a range"],
    ["M", "Context menu.  Tab: roll ↔ panel"],
    ["` (backtick)", "Jump to an instrument or phrase: hold, arrows, release. Tap: it stays open to click or pick with Enter; Esc cancels"],
    [", .  /  - =", "Knob / note length  ·  velocity"],
    ["Ctrl+Z / Y / C / X / V / D / A", "Undo, redo, copy, cut, paste, duplicate clip, select all"],
    ["B / N", "New notes shorter / longer (1/32 … 1 bar; the ♪ picker adds dotted and triplet)"],
    ["Ctrl+E / J / G / K", "Split the note at the cursor / join the selected notes / legato (each to the next note) / set the selection to the picked length"],
    ["Delete", "Delete notes"],
    ["F1 / F2 / F3 / F4", "App menu / song / editor / mixer"],
    ["?", "Help"],
    ["Ctrl+Enter", "Tutorial: I'm ready (next step)"],
  ] },
  touch: { label: "Mouse & touch", rows: [
    ["SCENE | SONG (by ▶)", "What Play plays: this scene, or the song chain"],
    ["Song chain (top of the Song screen)", "What SONG plays, left to right. Click a chip: repeat it, swap its scene, play from it, remove it. Drag (or long-press + drag) to reorder; + adds a scene. A scene can be in it more than once"],
    ["⟳ Loop", "On: it repeats. Off (Once): it plays one time and stops. Works for SCENE and SONG"],
    ["A scene's ▶", "SCENE: play that scene.  SONG: play the song from there"],
    ["Scene ⋮⋮ grip / long-press + drag", "Move the scene"],
    ["A scene's name", "Intro, Verse, Chorus, Bridge, Drop, Outro: each has its colour"],
    ["Right-click / long-press", "The menu for a scene, clip or track (a sheet from the bottom on phones)"],
    ["Move / copy to… (clip menu)", "Then click or tap the cell it goes to. Cancel in the bar, or tap the clip again"],
    ["Drag a clip (mouse)", "Drop it on another cell: move, copy or swap"],
    ["♪ 1/16 ▾ (editor toolbar)", "Length of new notes, remembered per track. Click a spot: a note that long; drag: size it by hand"],
    ["Alt+click a note", "Split it at the grid line you clicked"],
    ["Jump to… (couch quarters, or `)", "Click a column (instrument), a scene name or a cell to go there; click outside to cancel. Couch / online: each column shows whose it is"],
    ["NUDGE / Mutate (sound panel)", "NUDGE: another sound in the same role. Mutate: push about half the knobs clearly. Undo brings either back"],
    ["🎲 code (Song screen, top left)", "Share the song's setup code: copy it, a link that opens TILT with it, or a new song from it"],
  ] },
  setup: { label: "Setup screen", rows: [
    ["A / Enter / click on a value", "Pick it from a list (or − / + for tempo and swing). Editing a field HOLDs it"],
    ["HOLD", "Held fields stay put. Lineup / Sounds: each slot can be chosen on its own or left as ?"],
    ["NUDGE (Y, Space)", "Re-roll everything that isn't held: each ? slot gets a role (drums, bass, lead, pad...), then a sound for it from any instrument, avoiding ones from your last 10 rolls.  Release all: let go of every hold"],
    ["Slot ▾ → ? A role, any instrument", "Ask a slot for a role (say, any pad): NUDGE picks the instrument"],
    ["✦ sounds", "Generated from an instrument's recipe (Settings → Sounds sets how often). Saved in the song; ★ Save keeps one for every song"],
    ["Setups ▾ / Save setup…", "Save the held fields under a name; loading one brings them back held"],
    ["Timer", "Off, 5, 10, 15 or 20 minutes. ❚❚ next to the display pauses it (phones: tap the timer). 1 MINUTE: it turns amber; the last 10 seconds flash and count down (Settings → Timer: a soft tick)"],
    ["Time's up", "The bar finishes and fades, the song is kept as a timed take, then a card: Play it back, Save as-is, EXTRA BALL (+5 min), Keep working"],
    ["Game mode…", "Challenge cards, no pausing, editing locked at zero until you choose, one extra ball, the TILT flash (off by default)"],
  ] },
  midi: { label: "MIDI", rows: [
    ["Keyboard / pads", "Play the instrument you're on; held notes light its keys and pads"],
    ["MIDI learn", "TILT menu → MIDI learn: touch a knob, move a hardware control"],
    ["Transport", "Play / stop / record CCs and clock sync in Settings"],
  ] },
};

/** Help: Controls (by input; the one you're using first), the tutorial, about TILT. */
export function helpDialog(app: App, page: HelpPage = "controls") {
  const li = lastInput();
  let tab: ControlsTab = li === "gamepad" ? "gamepad" : li === "keyboard" ? "keyboard" : "touch";
  app.overlays.dialog("Help", (close, rerender) => {
    const pageBtn = (id: HelpPage, label: string) =>
      h("button", { class: "help-tab" + (page === id ? " on" : ""), "data-nav": `help-${id}`, "aria-pressed": String(page === id), onclick: () => { page = id; rerender(); } }, label);
    const body = page === "controls" ? h("div", { class: "help-page" },
      h("div", { class: "help-chips" }, (Object.keys(CONTROLS) as ControlsTab[]).map((k) =>
        h("button", { class: "chip-tab" + (tab === k ? " on" : ""), "data-nav": `ctl-${k}`, onclick: () => { tab = k; rerender(); } }, CONTROLS[k].label))),
      h("table", { class: "help" }, CONTROLS[tab].rows.map(([k, v]) => h("tr", null, h("td", null, k), h("td", null, v)))))
      : page === "tutorial" ? (() => {
        const st = tutorialStatus();
        return h("div", { class: "help-page" },
          h("p", { class: "note big" }, "Your first song in 5 minutes: drums, bass and a lead in C minor, one step at a time. Each step finishes when you do it; Skip does it for you."),
          h("p", { class: "note" }, st.finished ? "You've finished it. Run it again any time." : st.step > 0 ? `You stopped at step ${st.step + 1} of ${st.total}.` : "Not started yet."),
          h("div", { class: "help-actions" },
            st.step > 0 && !st.finished ? h("button", { class: "row-btn primary", "data-nav": "tut-go", onclick: () => { close(); app.openTutorial?.(false); } }, `Continue (step ${st.step + 1})`) : "",
            h("button", { class: "row-btn" + (st.step > 0 && !st.finished ? "" : " primary"), "data-nav": "tut-new", onclick: () => { close(); app.openTutorial?.(true); } }, st.step > 0 || st.finished ? "Start over" : "Start the tutorial")));
      })()
      : h("div", { class: "help-page about" },
        h("div", { class: "about-logo" }, dmdText("TILT", { height: 30, slant: 7, unlit: false })),
        h("p", { class: "note big" }, "Just a nudge. Roll a key, a tempo and a lineup of instruments, then build a song out of scenes."),
        h("ul", { class: "note game-list" },
          h("li", null, "Your songs live in this browser (Songs…). Export a song file to back it up or move it to another device."),
          h("li", null, "A 🎲 code or link shares a starting point: key, scale, tempo, swing, instruments and sounds."),
          h("li", null, "Play together: couch mode on one screen, or online with a 4-letter code."),
          h("li", null, "Works with a mouse, a keyboard, touch, a gamepad, MIDI keyboards and Push 1.")),
        h("p", { class: "note" }, `Build ${__BUILD__}`));
    return h("div", { class: "form help-hub" },
      h("div", { class: "help-tabs", role: "tablist" }, pageBtn("controls", "Controls"), pageBtn("tutorial", "Tutorial"), pageBtn("about", "About")),
      body,
      h("button", { class: "row-btn", "data-nav": "done", onclick: close }, "Close"));
  }, { wide: true });
}
