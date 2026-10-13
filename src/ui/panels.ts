// Instrument panels: each instrument has its own layout and look, plus a
// keyboard (synths, scale-locked by default) or pads (drums).

import { DRUM_BASE_NOTE, INSTRUMENTS, drumPartName, isDrumKind, paramDef } from "../engine/instruments";
import type { Track } from "../engine/model";
import { chordName, noteName, scaleById } from "../engine/music";
import { allPresets, applyPreset, deleteUserPreset, presetPosition, saveUserPreset, userPresets, USER_MARK } from "./presets";
import { getParam } from "../engine/params";
import { expandPitch } from "../engine/timeline";
import type { App } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
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
    h("button", { class: "preset-step", "data-nav": "preset-prev", onclick: () => stepPreset(app, track, -1) }, "◀"),
    h("button", { class: "preset-name", "data-nav": "preset-list", onclick: () => presetMenu(app, track) }, track.preset),
    h("button", { class: "preset-step", "data-nav": "preset-next", onclick: () => stepPreset(app, track, 1) }, "▶"),
    h("button", { class: "preset-save", "data-nav": "preset-save", title: "Save this sound as a user preset", onclick: () => savePresetPrompt(app, track) }, "★ Save"),
  );

  let body: HTMLElement;
  if (track.kind === "drums") {
    const part = app.ed.drumPart;
    body = h("div", { class: "panel-body kitbox" },
      h("div", { class: "pads" }, Array.from({ length: 8 }, (_, i) => pad(app, track, i))),
      h("div", { class: "part-edit" },
        h("div", { class: "section-title" }, `Pad ${part + 1} · ${drumPartName(track.params, part, track.kind)}`),
        h("div", { class: "knob-row" },
          ctl(`p${part}smp`, "Sound", "l"), ctl(`p${part}tune`, "Tune"), ctl(`p${part}decay`, "Decay"),
          ctl(`p${part}level`, "Level"), ctl(`p${part}pan`, "Pan")),
        h("div", { class: "knob-row" },
          h("div", { class: "section-title small" }, "Part FX"), ctl(`p${part}drive`, "Drive"), ctl(`p${part}tone`, "Tone"),
          h("div", { class: "section-title small" }, "Master"), ctl("choke", "Hat choke"), ctl("level", "Level")),
      ),
    );
  } else if (track.kind === "analog") {
    const mod = (i: number, title: string, ids: string[], extra?: string) => h("div", { class: `module m${i}` },
      h("div", { class: "module-title" }, title),
      ids.map((id) => ctl(id, undefined, "s")),
      extra ? ctl(extra, "Shape") : null);
    body = h("div", { class: "panel-body thumplab" },
      h("div", { class: "pads four" }, Array.from({ length: 4 }, (_, i) => pad(app, track, i))),
      h("div", { class: "modules" },
        mod(0, "Kick", ["kTune", "kDecay", "kBend", "kDrive", "kLevel"]),
        mod(1, "Snare", ["sTune", "sDecay", "sSnappy", "sTone", "sLevel"]),
        mod(2, "Tom", ["tTune", "tDecay", "tBend", "tNoise", "tLevel"]),
        mod(3, "Perc", ["pTune", "pDecay", "pDepth", "pLevel"], "pShape")),
      h("div", { class: "knob-row" }, ctl("level", "Master")),
    );
  } else if (track.kind === "lead") {
    body = h("div", { class: "panel-body razor" },
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Osc"), ctl("wave", "Wave"), ctl("sync", "SYNC", "l"), ctl("syncEnv", "Sync env"),
        h("div", { class: "section-title small" }, "Unison"), ctl("unison", "Voices"), ctl("detune", "Detune"), ctl("spread", "Spread"),
        h("div", { class: "section-title small" }, "Filter"), ctl("cutoff", "Cutoff", "l"), ctl("reso", "Reso"), ctl("fenv", "Env"), ctl("envDecay", "Env decay")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Amp"), ctl("attack", "Attack", "s"), ctl("release", "Release", "s"),
        h("div", { class: "section-title small" }, "Play"), ctl("glide", "Glide", "s"), ctl("legato", "Legato"), ctl("vibRate", "Vib rate", "s"), ctl("vibDepth", "Vibrato", "s"), ctl("level", "Level", "s")),
      keyboard(app, track),
    );
  } else if (track.kind === "wobble") {
    body = h("div", { class: "panel-body wobbler" },
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Carrier"), ctl("wave", "Wave"), ctl("sub", "Sub"),
        h("div", { class: "section-title small" }, "X-mod"), ctl("xWave", "Wave"), ctl("xTune", "Tune"), ctl("xmod", "X-MOD", "l"),
        h("div", { class: "section-title small" }, "Filter"), ctl("cutoff", "Cutoff", "l"), ctl("reso", "Reso"), ctl("crush", "Crush")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Wobble"), ctl("wobble", "WOBBLE", "l"), ctl("wobRate", "Rate"), ctl("wobShape", "Shape"),
        h("div", { class: "section-title small" }, "Out"), ctl("glide", "Glide", "s"), ctl("width", "Stereo", "s"), ctl("level", "Level", "s")),
      keyboard(app, track),
    );
  } else if (track.kind === "pad") {
    body = h("div", { class: "panel-body haze" },
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Layers"), ctl("wave", "Wave"), ctl("low", "Low", "s"), ctl("hi", "Hi", "s"), ctl("higher", "Higher", "s"), ctl("noise", "Noise", "s"), ctl("detune", "Detune", "s"),
        h("div", { class: "section-title small" }, "Filter"), ctl("cutoff", "Cutoff", "l"), ctl("reso", "Reso")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Env"), ctl("attack", "A", "s"), ctl("decay", "D", "s"), ctl("sustain", "S", "s"), ctl("release", "R", "s"),
        h("div", { class: "section-title small" }, "Lo-fi"), ctl("lofi", "LO-FI", "l"), ctl("wow", "Wow"),
        h("div", { class: "section-title small" }, "Reverb"), ctl("revTime", "Time"), ctl("revLevel", "Level"),
        ctl("width", "Width", "s"), ctl("level", "Out", "s")),
      keyboard(app, track),
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
  return h("div", { class: `panel kind-${track.kind}`, style: `--track:${trackColor(track)}` }, presetBar, body);
}

function previewSound(app: App, track: Track) {
  const g = INSTRUMENTS[track.kind].group;
  app.engine.preview(track.id, isDrumKind(track.kind) ? DRUM_BASE_NOTE : (g === "bass" ? 36 : 60) + app.song.key, 100, 0.4);
}

/** Previous / next through factory then user presets. */
function stepPreset(app: App, track: Track, d: number) {
  const list = allPresets(track.kind);
  const i = (presetPosition(track) + d + list.length) % list.length;
  app.edit("Preset", () => applyPreset(track, list[i]));
  previewSound(app, track);
}

function savePresetPrompt(app: App, track: Track) {
  const suggestion = track.preset.replace(/^★\s*/, "");
  const name = prompt(`Save this ${INSTRUMENTS[track.kind].name} sound as`, suggestion);
  if (!name?.trim()) return;
  const stored = saveUserPreset(track, name);
  app.edit("Save preset", () => (track.preset = stored));
  app.overlays.toast(`Saved ${stored}. It's in the preset list for every song.`);
}

function presetMenu(app: App, track: Track) {
  const def = INSTRUMENTS[track.kind];
  app.overlays.menu(`${def.name} presets`, () => {
    const user = userPresets(track.kind);
    return [
      ...allPresets(track.kind).map((p) => ({
        label: p.name,
        checked: p.name === track.preset,
        keepOpen: true,
        run: () => { app.edit("Preset", () => applyPreset(track, p)); previewSound(app, track); },
      })),
      { label: "★ Save current sound…", run: () => savePresetPrompt(app, track) },
      {
        label: "Delete a user preset", disabled: !user.length,
        sub: () => user.map((u) => ({ label: USER_MARK + u.name, run: () => { deleteUserPreset(track.kind, u.name); app.overlays.toast(`Deleted ${u.name}`); } })),
      },
    ];
  });
}

function pad(app: App, track: Track, i: number): HTMLElement {
  const note = DRUM_BASE_NOTE + i;
  const el = h("button", {
    class: "pad" + (app.ed.drumPart === i ? " selected" : ""), "data-nav": `pad${i}`, "data-note": note,
  }, h("span", { class: "pad-num" }, String(i + 1)), h("span", { class: "pad-label" }, drumPartName(track.params, i, track.kind)));
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
