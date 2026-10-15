// Instrument panels: each instrument has its own layout and look, plus a
// keyboard (synths, scale-locked by default) or pads (drums).

import { DRUM_BASE_NOTE, INSTRUMENTS, drumPartName, formatParam, fromUnit, isDrumKind, paramDef, toUnit } from "../engine/instruments";
import { LEAD_KINDS, POLY_KINDS, XY_PARAMS, hasToolkit } from "../engine/toolkit";
import { FX_TYPES } from "../engine/params";
import type { Track } from "../engine/model";
import { chordName, noteName, scaleById, scaleDegree } from "../engine/music";
import { decodeFile, listSamples, putSample, sampleLabel } from "./samples";
import { SFX, WT_FRAMES, WT_SIZE } from "../engine/instruments3";
import { allPresets, applyPreset, deleteUserPreset, presetPosition, saveUserPreset, userPresets, USER_MARK } from "./presets";
import { getParam } from "../engine/params";
import { RECIPES, genBase, mutateParams, pickSound, soundKey, soundRoles, type SoundRef } from "../engine/sounds";
import { Rng, randomSeed } from "../engine/rng";
import { applySound, noteRoll, pickOptions } from "./sounds";
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
    h("button", { class: "preset-nudge", "data-nav": "preset-nudge", title: "NUDGE: another sound in the same role (bass, lead, pad...) for this instrument, sometimes a new generated one ✦. Undo brings the old one back", onclick: () => nudgePreset(app, track) }, "NUDGE"),
    RECIPES[track.kind] ? h("button", { class: "preset-mutate", "data-nav": "preset-mutate", title: "Mutate: push about half of this sound's knobs clearly in new directions. Press again to keep going; undo steps back", onclick: () => mutateSound(app, track) }, "Mutate") : null,
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
  } else if (track.kind === "chip") {
    body = h("div", { class: "panel-body pixel" },
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Osc"), ctl("wave", "Wave"),
        h("div", { class: "section-title small" }, "Jump"), ctl("jump", "Jump"), ctl("jumpRate", "Rate", "l"),
        h("div", { class: "section-title small" }, "Pitch"), ctl("sweep", "Sweep"), ctl("sweepTime", "Time"), ctl("vibDepth", "Vibrato"), ctl("vibRate", "Vib rate")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Env"), ctl("attack", "A", "s"), ctl("decay", "D", "s"), ctl("sustain", "S", "s"), ctl("release", "R", "s"),
        h("div", { class: "section-title small" }, "Out"), ctl("crush", "CRUSH", "l"), ctl("level", "Level", "s")),
      keyboard(app, track),
    );
  } else if (track.kind === "fm") {
    body = h("div", { class: "panel-body glint" },
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Ratios"), ctl("ratioC", "Carrier"), ctl("ratioM", "Modulator"),
        h("div", { class: "section-title small" }, "FM"), ctl("index", "FM AMOUNT", "l"), ctl("indexDecay", "FM decay"), ctl("indexSus", "FM sustain"), ctl("feedback", "Feedback"), ctl("velIndex", "Vel → FM")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Amp"), ctl("attack", "A", "s"), ctl("decay", "D", "s"), ctl("sustain", "S", "s"), ctl("release", "R", "s"),
        h("div", { class: "section-title small" }, "Out"), ctl("detune", "Stereo", "s"), ctl("level", "Level", "s")),
      keyboard(app, track),
    );
  } else if (track.kind === "wave") {
    body = h("div", { class: "panel-body morph" },
      h("div", { class: "knob-row" },
        wavetableView(app, track),
        h("div", { class: "section-title small" }, "Table"), ctl("table", "Table"), ctl("pos", "POSITION", "l"), ctl("envAmt", "Pos env"), ctl("envDecay", "Env decay"), ctl("lfoAmt", "Pos LFO"), ctl("lfoRate", "LFO rate")),
      h("div", { class: "knob-row" },
        h("div", { class: "section-title small" }, "Voice"), ctl("unison", "Voices"), ctl("detune", "Detune", "s"),
        h("div", { class: "section-title small" }, "Filter"), ctl("cutoff", "Cutoff"), ctl("reso", "Reso", "s"),
        h("div", { class: "section-title small" }, "Amp"), ctl("attack", "A", "s"), ctl("decay", "D", "s"), ctl("sustain", "S", "s"), ctl("release", "R", "s"), ctl("level", "Level", "s")),
      keyboard(app, track),
    );
  } else if (track.kind === "sampler") {
    const part = Math.min(app.ed.drumPart, 7);
    body = h("div", { class: "panel-body grab" },
      h("div", { class: "pads" }, Array.from({ length: 8 }, (_, i) => pad(app, track, i))),
      h("div", { class: "part-edit" },
        h("div", { class: "section-title" }, `Pad ${part + 1} · ${sampleLabel(track.samples?.[part], track.sampleNames, part)}`),
        h("div", { class: "knob-row" },
          h("button", { class: "sound-btn", "data-nav": "sound", onclick: (e: Event) => soundMenu(app, track, part, e.currentTarget as HTMLElement) },
            h("div", { class: "switch-label" }, "Sound"), h("div", { class: "switch-value" }, sampleLabel(track.samples?.[part], track.sampleNames, part) + " ▾")),
          ctl(`p${part}tune`, "Tune"), ctl(`p${part}start`, "Start"), ctl(`p${part}decay`, "Decay"), ctl(`p${part}level`, "Level"), ctl(`p${part}pan`, "Pan")),
        h("div", { class: "knob-row" },
          ctl(`p${part}rev`, "Reverse"), ctl(`p${part}mode`, "Mode"),
          h("div", { class: "section-title small" }, "Master"), ctl("level", "Level"),
          h("div", { class: "note drop-hint" }, "Drop an audio file on a pad to load it.")),
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
  // Synths: SOUND (their own knobs, unchanged) | MORE (the voice toolkit) | XY.
  if (!hasToolkit(track.kind)) return h("div", { class: `panel kind-${track.kind}`, style: `--track:${trackColor(track)}` }, presetBar, body);
  const hasXy = !!XY_PARAMS[track.kind];
  const page = !hasXy && app.ed.panelPage === "xy" ? "main" : app.ed.panelPage ?? "main";
  const tab = (id: "main" | "more" | "xy", label: string, title: string) => h("button", {
    class: "page-tab" + (page === id ? " on" : ""), "data-nav": `page-${id}`, "aria-pressed": String(page === id), title,
    onclick: () => { app.ed.panelPage = id; app.screens.edit.render(); },
  }, label);
  const pages = h("div", { class: "panel-pages", role: "tablist" },
    tab("main", "SOUND", "This instrument's own controls"), tab("more", "MORE", "Filter 2, LFOs, voice, pitch envelope, built-in FX"),
    hasXy ? tab("xy", "XY", "Two parameters on one pad") : null);
  const shown = page === "more" ? morePage(app, track, ctl) : page === "xy" ? xyPage(app, track, host) : body;
  return h("div", { class: `panel kind-${track.kind} page-${page}`, style: `--track:${trackColor(track)}` }, presetBar, pages, shown);
}

type Ctl = (id: string, label?: string, size?: "s" | "m" | "l") => HTMLElement | null;

/** MORE: the shared voice toolkit (filter 2, 2 LFOs, voice, pitch env, pulse width, velocity, built-in FX, performance FX). */
function morePage(app: App, track: Track, ctl: Ctl): HTMLElement {
  const v = (id: string) => getParam(track, id);
  const sec = (title: string, ...kids: (HTMLElement | null)[]) => h("div", { class: "tk-sec" }, h("div", { class: "section-title small" }, title), ...kids);
  // Controls that do nothing in the current setting are dimmed (still reachable).
  const dim = (el: HTMLElement | null, off: boolean) => { if (el && off) el.classList.add("dimmed"); return el; };
  const filterOff = v("tk:fType") === 0;
  const lfo = (n: 1 | 2) => {
    const off = v(`tk:l${n}Dest`) === 0, synced = v(`tk:l${n}Sync`) > 0;
    return sec(`LFO ${n}`, ctl(`tk:l${n}Dest`, "To"), dim(ctl(`tk:l${n}Amt`, "Amount", "l"), off), dim(ctl(`tk:l${n}Shape`, "Shape"), off),
      dim(ctl(`tk:l${n}Rate`, "Rate"), off || synced), dim(ctl(`tk:l${n}Sync`, "Sync"), off), dim(ctl(`tk:l${n}Key`, "Key"), off), dim(ctl(`tk:l${n}Delay`, "Fade in"), off));
  };
  const fxType = FX_TYPES[Math.round(v("ifx:type"))] ?? FX_TYPES[0];
  const fxOff = fxType.id === "off";
  return h("div", { class: "panel-body more-page" },
    h("div", { class: "knob-row" },
      sec("Filter 2", ctl("tk:fType", "Type"), dim(ctl("tk:fCut", "Cutoff", "l"), filterOff), dim(ctl("tk:fRes", "Reso"), filterOff), dim(ctl("tk:fTrack", "Key track"), filterOff),
        dim(ctl("tk:fEnv", "Env"), filterOff), dim(ctl("tk:fA", "A", "s"), filterOff), dim(ctl("tk:fD", "D", "s"), filterOff), dim(ctl("tk:fS", "S", "s"), filterOff), dim(ctl("tk:fR", "R", "s"), filterOff))),
    h("div", { class: "knob-row" }, lfo(1), lfo(2)),
    h("div", { class: "knob-row" },
      POLY_KINDS.includes(track.kind) ? sec("Voice", ctl("tk:mode", "Mode"), ctl("tk:uni", "Unison"), dim(ctl("tk:uniDet", "Detune"), v("tk:uni") <= 1), dim(ctl("tk:glide", "Glide"), v("tk:mode") === 0)) : null,
      sec("Pitch env", ctl("tk:pAmt", "Amount"), dim(ctl("tk:pDec", "Decay"), v("tk:pAmt") === 0)),
      sec("Pulse", ctl("tk:pw", "Width")),
      sec("Velocity", ctl("tk:velAmp", "→ Amp"), ctl("tk:velFilt", "→ Filter"))),
    h("div", { class: "knob-row" },
      sec("Built-in FX", ctl("ifx:type", "Type"), dim(ctl("ifx:a", fxType.a || "Edit 1"), fxOff), dim(ctl("ifx:b", fxType.b || "Edit 2"), fxOff),
        h("span", { class: "note tk-note" }, "Saved with the preset")),
      LEAD_KINDS.includes(track.kind) ? sec("Perform", ctl("tk:pump", "Pump", "l"), ctl("tk:repeat", "Repeat", "l"), dim(ctl("tk:repDiv", "Rate"), v("tk:repeat") === 0)) : null),
  );
}

/** XY: the synth's two most expressive parameters on one pad (mouse, touch, a pad's right stick; moves record as automation). */
function xyPage(app: App, track: Track, host: ControlHost): HTMLElement {
  const [xId, yId] = XY_PARAMS[track.kind]!;
  const xp = paramDef(track.kind, xId)!, yp = paramDef(track.kind, yId)!;
  const dot = h("div", { class: "xy-dot" });
  const readout = h("div", { class: "xy-readout" });
  const pad = h("div", { class: "xy-pad", "data-nav": "xy", "data-xy": `${xId} ${yId}`, tabindex: 0, title: "Drag (or right stick / , . - =) to play both at once" },
    h("span", { class: "xy-axis x" }, `${xp.label} →`), h("span", { class: "xy-axis y" }, `${yp.label} →`), dot) as HTMLElement & { redraw?: () => void };
  const draw = () => {
    const ux = toUnit(xp, getParam(track, xId)), uy = toUnit(yp, getParam(track, yId));
    dot.style.left = `${ux * 100}%`;
    dot.style.top = `${(1 - uy) * 100}%`;
    readout.textContent = `${xp.label} ${formatParam(xp, getParam(track, xId))}  ·  ${yp.label} ${formatParam(yp, getParam(track, yId))}`;
  };
  pad.redraw = draw;
  const setFrom = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const ux = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), uy = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    host.set(xId, fromUnit(xp, ux));
    host.set(yId, fromUnit(yp, uy));
    draw();
  };
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    host.begin(xId); host.begin(yId);
    pad.classList.add("active");
    setFrom(e);
    const move = (ev: PointerEvent) => setFrom(ev);
    const up = () => { pad.classList.remove("active"); pad.removeEventListener("pointermove", move); pad.removeEventListener("pointerup", up); pad.removeEventListener("pointercancel", up); };
    pad.addEventListener("pointermove", move);
    pad.addEventListener("pointerup", up);
    pad.addEventListener("pointercancel", up);
  });
  requestAnimationFrame(draw);
  return h("div", { class: "panel-body xy-page" }, pad, readout,
    h("p", { class: "note" }, "While recording, moves are written into the clip as automation for both parameters."));
}

function previewSound(app: App, track: Track) {
  const g = INSTRUMENTS[track.kind].group;
  app.engine.preview(track.id, isDrumKind(track.kind) ? DRUM_BASE_NOTE : (g === "bass" ? 36 : 60) + app.song.key, 100, 0.4);
}

/** Previous / next through factory then user presets. */
/** A random sound for this track (not the one it has, nor one another track of the same instrument uses). */
/** The sound a track has now, as a dice sound (a user preset counts as the first built-in one). */
export function trackSound(t: Track): SoundRef {
  if (t.gen !== undefined) return { kind: t.kind, preset: genBase(t.kind, t.gen), gen: t.gen };
  return { kind: t.kind, preset: Math.max(0, INSTRUMENTS[t.kind].presets.findIndex((p) => p.name === t.preset)) };
}

/** NUDGE: another sound in the same role on this instrument, fresh ones first; sometimes a generated one. */
export function nudgePreset(app: App, track: Track) {
  const list = allPresets(track.kind), now = trackSound(track);
  const taken = new Set(app.song.tracks.filter((t) => t.kind === track.kind).map((t) => soundKey(trackSound(t))));
  const s = pickSound(soundRoles(now)[0], new Rng(randomSeed()), { ...pickOptions(app.settings.genShare), taken }, [track.kind]);
  if (!s || soundKey(s) === soundKey(now)) return;
  app.edit("Nudge sound", () => applySound(track, s, list));
  noteRoll([s]);
  previewSound(app, track);
  app.overlays.toast(`Sound: ${track.preset}`, 1200);
}

/** Mutate: a few of the knobs this instrument's recipe names move a little. */
function mutateSound(app: App, track: Track) {
  app.edit("Mutate sound", () => { track.params = mutateParams(track.kind, track.params, randomSeed()); });
  previewSound(app, track);
  app.overlays.toast("Mutated: a few knobs moved (undo brings it back)", 1400);
}

function stepPreset(app: App, track: Track, d: number) {
  const list = allPresets(track.kind);
  const i = (presetPosition(track) + d + list.length) % list.length;
  app.edit("Preset", () => applyPreset(track, list[i]));
  previewSound(app, track);
}

function savePresetPrompt(app: App, track: Track) {
  const suggestion = track.preset.replace(/^[★✦]\s*/, "");
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
      ...(track.gen !== undefined ? [{ label: `${track.preset} (generated: ★ Save keeps it)`, checked: true, disabled: true }] : []),
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
  }, h("span", { class: "pad-num" }, String(i + 1)), h("span", { class: "pad-label" },
    track.kind === "sampler" ? sampleLabel(track.samples?.[i], track.sampleNames, i) : drumPartName(track.params, i, track.kind)));
  if (track.kind === "sampler") {
    // Drag an audio file onto a pad to load it there.
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drop-target"); });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop-target");
      const f = e.dataTransfer?.files?.[0];
      if (f) void loadFileToPad(app, track, i, f);
    });
  }
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
        const deg = scaleDegree(k.pitch, song.key, song.scale);
        const el = h("button", { class: "key" + (k.black ? " black" : "") + (deg ? " inkey" : " outkey") + (deg === 1 ? " root" : ""), "data-nav": `key${i}`, "data-note": k.pitch, title: deg ? (deg === 1 ? "Root (1)" : `Degree ${deg}`) : "Out of key" },
          deg === 1 ? h("i", { class: "root-dot", "aria-hidden": "true" }) : null,
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

// ---------------------------------------------------------------- sampler helpers

function setPadSound(app: App, track: Track, pad: number, ref: string, name: string) {
  app.edit("Load sample", () => {
    track.samples = [...(track.samples ?? [])];
    track.sampleNames = [...(track.sampleNames ?? [])];
    track.samples[pad] = ref;
    track.sampleNames[pad] = name;
  });
}

async function loadFileToPad(app: App, track: Track, pad: number, file: File) {
  try {
    const s = await decodeFile(app.engine.ctx, file);
    const id = await putSample(s.name, s.data, s.rate);
    setPadSound(app, track, pad, `user:${id}`, s.name);
    app.overlays.toast(`Loaded "${s.name}" (${(s.data.length / s.rate).toFixed(1)} s) on pad ${pad + 1}`);
    app.engine.preview(track.id, DRUM_BASE_NOTE + pad, 110, 0.6);
  } catch (e) {
    app.overlays.toast(`Couldn't read that file: ${e}`, 4000, { error: true });
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff" });
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

async function soundMenu(app: App, track: Track, pad: number, anchor: HTMLElement) {
  const mine = await listSamples().catch(() => []);
  const r = anchor.getBoundingClientRect();
  const current = track.samples?.[pad];
  app.overlays.menu(`Pad ${pad + 1} sound`, () => [
    { label: "Load audio file…", hint: "WAV, MP3, OGG…", run: async () => { const f = await pickFile(); if (f) await loadFileToPad(app, track, pad, f); } },
    ...SFX.map((name) => ({ label: sampleLabel(`sfx:${name}`), hint: "built in", checked: current === `sfx:${name}`, run: () => { setPadSound(app, track, pad, `sfx:${name}`, ""); app.engine.preview(track.id, DRUM_BASE_NOTE + pad, 110, 0.6); } })),
    ...mine.map((m) => ({ label: m.name, hint: `${m.seconds.toFixed(1)} s`, checked: current === `user:${m.id}`, run: () => { setPadSound(app, track, pad, `user:${m.id}`, m.name); app.engine.preview(track.id, DRUM_BASE_NOTE + pad, 110, 0.6); } })),
  ], { x: r.left, y: r.bottom });
}

// ---------------------------------------------------------------- wavetable view

/** The current frame of a Morph track's table, redrawn when the table or position changes. */
function wavetableView(app: App, track: Track): HTMLElement {
  const cv = h("canvas", { class: "wt-view", width: 168, height: 64 });
  const draw = async () => {
    const mips = await app.engine.mips(Math.round(track.params.table ?? 0));
    const g = cv.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = css.getPropertyValue("--well").trim();
    g.fillRect(0, 0, cv.width, cv.height);
    const frame = Math.round((track.params.pos ?? 0) * (WT_FRAMES - 1));
    const t = mips[0];
    g.strokeStyle = getComputedStyle(cv).getPropertyValue("--track").trim() || "#5ce07a";
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x < cv.width; x++) {
      const v = t[frame * WT_SIZE + Math.floor((x / cv.width) * WT_SIZE)];
      const y = cv.height / 2 - v * (cv.height / 2 - 4);
      if (x) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  };
  (cv as HTMLCanvasElement & { redraw?: () => void }).redraw = () => void draw();
  requestAnimationFrame(() => void draw());
  return cv;
}
