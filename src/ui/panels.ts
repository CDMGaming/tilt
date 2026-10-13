// Instrument panels: each instrument has its own layout and look, plus a
// keyboard (synths, scale-locked by default) or pads (drums).

import { DRUM_BASE_NOTE, INSTRUMENTS, drumPartName, paramDef } from "../engine/instruments";
import type { Track } from "../engine/model";
import { chordName, noteName, scaleById } from "../engine/music";
import { loadPreset, presetIndex } from "../engine/songops";
import { getParam } from "../engine/params";
import { expandPitch } from "../engine/timeline";
import type { App } from "./app";
import { h, TRACK_COLORS } from "./dom";
import { control, type ControlHost } from "./knob";

export function buildPanel(app: App, track: Track): HTMLElement {
  const host: ControlHost = {
    get: (id) => getParam(track, id),
    set: (id, v) => app.setParam(track, id, v),
    begin: (id) => app.setParam(track, id, getParam(track, id), true),
  };
  const ctl = (id: string, label?: string, size?: "s" | "m" | "l") => {
    const p = paramDef(track.kind, id);
    return p ? control(p, host, { label, size }) : null;
  };
  const def = INSTRUMENTS[track.kind];

  const presetBar = h("div", { class: "preset-bar" },
    h("div", { class: "inst-name" }, def.name, h("span", { class: "inst-role" }, def.role)),
    h("button", { class: "preset-step", "data-nav": "preset-prev", onclick: () => app.edit("Preset", () => loadPreset(track, presetIndex(track) - 1)) }, "◀"),
    h("button", { class: "preset-name", "data-nav": "preset-list", onclick: () => presetMenu(app, track) }, track.preset),
    h("button", { class: "preset-step", "data-nav": "preset-next", onclick: () => app.edit("Preset", () => loadPreset(track, presetIndex(track) + 1)) }, "▶"),
  );

  let body: HTMLElement;
  if (track.kind === "drums") {
    const part = app.ed.drumPart;
    body = h("div", { class: "panel-body kitbox" },
      h("div", { class: "pads" }, Array.from({ length: 8 }, (_, i) => pad(app, track, i))),
      h("div", { class: "part-edit" },
        h("div", { class: "section-title" }, `Pad ${part + 1} · ${drumPartName(track.params, part)}`),
        h("div", { class: "knob-row" },
          ctl(`p${part}smp`, "Sound", "l"), ctl(`p${part}tune`, "Tune"), ctl(`p${part}decay`, "Decay"),
          ctl(`p${part}level`, "Level"), ctl(`p${part}pan`, "Pan")),
        h("div", { class: "knob-row" },
          h("div", { class: "section-title small" }, "Part FX"), ctl(`p${part}drive`, "Drive"), ctl(`p${part}tone`, "Tone"),
          h("div", { class: "section-title small" }, "Master"), ctl("choke", "Hat choke"), ctl("level", "Level")),
      ),
    );
  } else if (track.kind === "acid") {
    body = h("div", { class: "panel-body squelch" },
      h("div", { class: "knob-row" },
        ctl("wave", "Wave"), ctl("cutoff", "Cutoff", "l"), ctl("reso", "Reso", "l"), ctl("envmod", "Env mod"),
        ctl("decay", "Decay"), ctl("accent", "Accent"), ctl("bite", "BITE", "l")),
      h("div", { class: "knob-row" },
        ctl("glide", "Glide"), ctl("sub", "Sub"), ctl("level", "Level"),
        h("div", { class: "section-title small" }, "Arp"), ctl("arpOn", "Arp"), ctl("arpMode", "Mode"), ctl("arpRate", "Rate"), ctl("arpRange", "Oct")),
      keyboard(app, track),
    );
  } else {
    body = h("div", { class: "panel-body chordette" },
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Chord"), ctl("chord", "Chord"), ctl("spread", "Voicing"),
        h("div", { class: "section-title small" }, "Osc"), ctl("wave1", "Osc 1"), ctl("wave2", "Osc 2"), ctl("semi2", "Semi"), ctl("detune", "Detune"), ctl("mix", "Mix")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Filter"), ctl("cutoff", "Cutoff", "l"), ctl("reso", "Reso"), ctl("fenv", "Env"), ctl("fdecay", "F decay"),
        h("div", { class: "section-title small" }, "Amp"), ctl("attack", "A", "s"), ctl("decay", "D", "s"), ctl("sustain", "S", "s"), ctl("release", "R", "s"),
        ctl("width", "Width", "s"), ctl("level", "Level", "s")),
      keyboard(app, track),
    );
  }
  return h("div", { class: `panel kind-${track.kind}`, style: `--track:${TRACK_COLORS[track.color]}` }, presetBar, body);
}

function presetMenu(app: App, track: Track) {
  const def = INSTRUMENTS[track.kind];
  app.overlays.menu(`${def.name} presets`, () => def.presets.map((p, i) => ({
    label: p.name,
    checked: p.name === track.preset,
    keepOpen: true,
    run: () => { app.edit("Preset", () => loadPreset(track, i)); app.engine.preview(track.id, track.kind === "drums" ? DRUM_BASE_NOTE : 48 + app.song.key, 100, 0.3); },
  })));
}

function pad(app: App, track: Track, i: number): HTMLElement {
  const note = DRUM_BASE_NOTE + i;
  const el = h("button", {
    class: "pad" + (app.ed.drumPart === i ? " selected" : ""), "data-nav": `pad${i}`, "data-note": note,
  }, h("span", { class: "pad-num" }, String(i + 1)), h("span", { class: "pad-label" }, drumPartName(track.params, i)));
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    app.noteInput(note, 110, true);
    if (app.ed.drumPart !== i) { app.ed.drumPart = i; app.screens.edit.render(); }
  });
  el.addEventListener("pointerup", () => app.noteInput(note, 0, false));
  return el;
}

/** On-screen keyboard. Scale lock: two octaves of scale degrees only. Otherwise a chromatic piano. */
function keyboard(app: App, track: Track): HTMLElement {
  const song = app.song;
  const base = (app.ed.octave + 1) * 12;
  const keys: { pitch: number; label: string; sub?: string; black?: boolean }[] = [];
  if (app.settings.scaleLock) {
    const steps = scaleById(song.scale).steps;
    for (let d = 0; d <= steps.length * 2; d++) {
      const pitch = base + song.key + steps[d % steps.length] + 12 * Math.floor(d / steps.length);
      const chord = expandPitch(song, track, pitch);
      keys.push({ pitch, label: noteName(pitch), sub: chord.length > 1 ? chordName(chord) : undefined });
    }
  } else {
    for (let s = 0; s <= 24; s++) {
      const pitch = base + s;
      keys.push({ pitch, label: noteName(pitch), black: [1, 3, 6, 8, 10].includes(s % 12) });
    }
  }
  const octave = (d: -1 | 1) => { app.ed.octave = Math.max(0, Math.min(7, app.ed.octave + d)); app.screens.edit.render(); };
  return h("div", { class: "keyboard-wrap" },
    h("button", { class: "oct-btn", "data-nav": "oct-down", onclick: () => octave(-1) }, "◀", h("small", null, `oct ${app.ed.octave}`)),
    h("div", { class: "keyboard" + (app.settings.scaleLock ? " locked" : " chromatic") },
      keys.map((k, i) => {
        const el = h("button", { class: "key" + (k.black ? " black" : ""), "data-nav": `key${i}`, "data-note": k.pitch },
          h("span", null, k.label), k.sub ? h("small", null, k.sub) : null);
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); app.noteInput(k.pitch, 100, true); el.classList.add("down"); });
        const up = () => { if (el.classList.contains("down")) { app.noteInput(k.pitch, 0, false); el.classList.remove("down"); } };
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
        return el;
      })),
    h("button", { class: "oct-btn", "data-nav": "oct-up", onclick: () => octave(1) }, "▶"),
  );
}
