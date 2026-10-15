// Instrument panels: each instrument has its own layout and look, plus a
// keyboard (synths, scale-locked by default) or pads (drums).

import { CHORD_CATS, DRUM_BASE_NOTE, DRUM_PART_LABELS, INSTRUMENTS, KITS, drumPartName, kitSoundName, formatParam, fromUnit, isDrumKind, paramDef, toUnit } from "../engine/instruments";
import { LEAD_KINDS, POLY_KINDS, XY_PARAMS, hasToolkit } from "../engine/toolkit";
import { FX_TYPES } from "../engine/params";
import type { Track } from "../engine/model";
import { chordName, noteName, scaleById, scaleDegree } from "../engine/music";
import { decodeFile, listSamples, putSample, sampleLabel } from "./samples";
import { SFX, WT_FRAMES, WT_SIZE } from "../engine/instruments3";
import { allPresets, applyPreset, deleteUserPreset, presetPosition, saveUserPreset, userPresets, USER_MARK, type PresetEntry } from "./presets";
import { getParam } from "../engine/params";
import { RECIPES, genBase, mutateParams, pickSound, soundKey, soundRoles, type SoundRef } from "../engine/sounds";
import { Rng, randomSeed } from "../engine/rng";
import { applySound, noteRoll, pickOptions } from "./sounds";
import { expandPitch } from "../engine/timeline";
import type { App } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
import { control, type ControlHost } from "./knob";

/** Instruments rebuilt in the overhaul (docs/instruments.md): their own panel only, no MORE page. */
const REDESIGNED = new Set<Track["kind"]>(["acid", "analog", "drums", "poly", "lead"]);
/** Chordette: the category its sound list shows (null: the current sound's). */
let chordetteCat: string | null = null;
/** Kitbox: the channel whose More drawer is open (per session). */
let kitboxMore: number | null = null;
/** Squelch's arp lid, open or shut (per session). */
let squelchLid = false;

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
  const fdr = (id: string, label?: string) => {
    const p = paramDef(track.kind, id);
    return p ? control(p, host, { label, fader: true }) : null;
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
    // Kitbox: the kit on a phosphor LCD with the master controls (Punch and Smack are the
    // character controls), then eight channel strips; a strip's More opens its drawer.
    const kit = Math.round(track.params.kit ?? 0);
    const more = kitboxMore !== null && kitboxMore < 8 ? kitboxMore : null;
    const strip = (i: number) => h("div", { class: `kb-strip c${i}` + (app.ed.drumPart === i ? " sel" : "") },
      pad(app, track, i),
      h("button", { class: "kb-sound", "data-nav": `sound${i}`, title: "Choose this channel's sound (any kit)", onclick: (e: Event) => kitSoundMenu(app, track, i, e.currentTarget as HTMLElement) },
        kitSoundName(Math.round(track.params[`p${i}smp`] ?? i)), " ▾"),
      h("div", { class: "kb-knobs" }, ctl(`p${i}tune`, "Tune", "s"), ctl(`p${i}decay`, "Time", "s"), ctl(`p${i}pan`, "Pan", "s"), ctl(`p${i}send`, "Room", "s")),
      ctl(`p${i}level`, "Level"),
      h("button", { class: "kb-more" + (more === i ? " on" : ""), "data-nav": `more${i}`, "aria-expanded": String(more === i), title: "One-shot / gate, reverse, choke group, velocity, filter, start",
        onclick: () => { kitboxMore = more === i ? null : i; app.ed.drumPart = i; app.screens.edit.render(); } }, more === i ? "More ▴" : "More ▾"));
    const stepKit = (d: number) => setKit(app, track, (kit + d + KITS.length) % KITS.length);
    body = h("div", { class: "panel-body kitbox" },
      h("div", { class: "kb-top" },
        h("div", { class: "kb-lcd" },
          h("button", { class: "kb-step", "data-nav": "kit-prev", title: "Previous kit", onclick: () => stepKit(-1) }, "◀"),
          h("button", { class: "kb-kit", "data-nav": "kit", title: "Choose a kit: loads its eight sounds", onclick: (e: Event) => kitMenu(app, track, e.currentTarget as HTMLElement) },
            h("span", { class: "kb-lcd-small" }, `KIT ${String(kit + 1).padStart(2, "0")}`), h("span", { class: "kb-lcd-big" }, KITS[kit].toUpperCase())),
          h("button", { class: "kb-step", "data-nav": "kit-next", title: "Next kit", onclick: () => stepKit(1) }, "▶")),
        h("div", { class: "kb-master" }, ctl("punch", "★ Punch", "l"), ctl("smack", "★ Smack", "l"), ctl("time", "Time"), ctl("room", "Room"), ctl("level", "Level"))),
      h("div", { class: "kb-strips" }, Array.from({ length: 8 }, (_, i) => strip(i))),
      more !== null ? h("div", { class: `kb-drawer c${more}` },
        h("span", { class: "kb-drawer-title" }, `${more + 1} · ${DRUM_PART_LABELS[more]}`),
        ctl(`p${more}gate`, "Play"), ctl(`p${more}rev`, "Reverse"), ctl(`p${more}choke`, "Choke"),
        ctl(`p${more}vel`, "Velocity"), ctl(`p${more}tone`, "Filter"), ctl(`p${more}start`, "Start")) : null,
    );
  } else if (track.kind === "analog") {
    // Thump Lab: eight compact modules, each with only the controls that matter for that drum,
    // its pad on top and a Level / Pan foot; the master strip holds the ★ Model switch.
    const mod = (i: number, ids: string[], foot: [string, string]) => h("div", { class: `tl-mod m${i}` + (app.ed.drumPart === i ? " sel" : "") },
      pad(app, track, i),
      h("div", { class: "tl-knobs" }, ids.map((id) => ctl(id, undefined, "s"))),
      h("div", { class: "tl-foot" }, ctl(foot[0], "Level", "s"), ctl(foot[1], "Pan", "s")));
    body = h("div", { class: "panel-body thumplab" },
      h("div", { class: "tl-rack" },
        mod(0, ["kTune", "kDecay", "kBend", "kBoost", "kClick"], ["kLevel", "kPan"]),
        mod(1, ["sTune", "sDecay", "sSnappy", "sPunch", "sTone"], ["sLevel", "sPan"]),
        mod(2, ["cDecay", "cSpread", "cTone", "cRoom"], ["cLevel", "cPan"]),
        mod(3, ["hDecay", "hTone", "hMetal"], ["hLevel", "hPan"]),
        mod(4, ["oDecay", "oTone", "oMetal"], ["oLevel", "oPan"]),
        mod(5, ["ltTune", "ltDecay", "ltBend", "ltNoise"], ["ltLevel", "ltPan"]),
        mod(6, ["htTune", "htDecay", "htBend", "htNoise"], ["htLevel", "htPan"]),
        mod(7, ["pType", "pTune", "pDecay", "pDepth", "pSpeed"], ["pLevel", "pPan"])),
      h("div", { class: "tl-master" },
        h("div", { class: "tl-logo" }, "THUMP", h("br"), "LAB"),
        ctl("model", "★ Model", "l"), ctl("accent", "Accent"), ctl("level", "Level")),
    );
  } else if (track.kind === "lead") {
    // Razor: eight faders with lit caps; Scream, Sweep and Glide are the character controls.
    body = h("div", { class: "panel-body razor" },
      h("div", { class: "rz-plate" },
        h("div", { class: "rz-logo" }, "RAZOR", h("span", null, "SYNC LEAD")),
        h("div", { class: "rz-faders" },
          h("div", { class: "rz-group char" }, fdr("scream", "★ Scream"), fdr("sweep", "★ Sweep")),
          h("div", { class: "rz-group" }, fdr("cutoff", "Tone"), fdr("unison", "Voices"), fdr("spread", "Spread")),
          h("div", { class: "rz-group" }, fdr("attack", "Attack"), fdr("release", "Release")),
          h("div", { class: "rz-group char" }, fdr("glide", "★ Glide")))),
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
    // Squelch: one row of big knobs (Bite and Gnaw are the character controls), the arp under a lid.
    const arpOn = (track.params.arpOn ?? 0) >= 0.5;
    body = h("div", { class: "panel-body squelch" },
      h("div", { class: "sq-plate" },
        h("div", { class: "sq-head" },
          h("span", { class: "sq-logo" }, "SQUELCH"),
          h("span", { class: "sq-accent" }, h("span", { class: "sq-led", style: `--glow:${(track.params.accent ?? 0.5).toFixed(2)}` }), "ACCENT")),
        h("div", { class: "knob-row sq-row" },
          ctl("wave", "Wave"), ctl("cutoff", "Cutoff", "l"), ctl("reso", "Reso", "l"), ctl("envmod", "Env"), ctl("decay", "Decay"),
          h("div", { class: "sq-char" }, ctl("bite", "★ Bite", "l"), ctl("gnaw", "★ Gnaw", "l")),
          ctl("accent", "Accent"), ctl("glide", "Slide")),
        h("button", {
          class: "sq-lid" + (squelchLid ? " open" : ""), "data-nav": "arp-lid", "aria-expanded": String(squelchLid),
          title: "The arpeggiator: hold notes and it plays them in steps, locked to the song",
          onclick: () => { squelchLid = !squelchLid; app.screens.edit.render(); },
        }, squelchLid ? "ARP ▴" : "ARP ▾", arpOn ? h("span", { class: "sq-on" }, " · ON") : ""),
        squelchLid ? h("div", { class: "knob-row sq-arp" }, ctl("arpOn", "Arp"), ctl("arpMode", "Mode"), ctl("arpRate", "Rate"), ctl("arpRange", "Oct")) : null),
      keyboard(app, track),
    );
  } else {
    // Chordette: an 80s workstation. Category buttons and a sound list on the LCD, then the
    // knob row (Strum, Warmth and Voicing are the character controls).
    const factory = INSTRUMENTS.poly.presets, mine = userPresets("poly");
    const curCat = factory.find((x) => x.name === track.preset)?.cat ?? (track.preset.startsWith(USER_MARK) ? "User" : "Keys");
    const cat = chordetteCat ?? curCat;
    const cats = [...CHORD_CATS, ...(mine.length ? ["User"] : [])];
    const list: PresetEntry[] = cat === "User"
      ? mine.map((x) => ({ name: USER_MARK + x.name, params: x.params, user: true }))
      : factory.filter((x) => x.cat === cat).map((x) => ({ name: x.name, params: x.params, user: false }));
    body = h("div", { class: "panel-body chordette" },
      h("div", { class: "cd-face" },
        h("div", { class: "cd-left" },
          h("div", { class: "cd-cats" }, cats.map((c) => h("button", {
            class: "cd-cat" + (c === cat ? " on" : ""), "data-nav": `cat-${c}`, "aria-pressed": String(c === cat),
            onclick: () => { chordetteCat = c; app.screens.edit.render(); },
          }, c))),
          h("div", { class: "cd-lcd", role: "listbox" }, list.map((x) => h("button", {
            class: "cd-row" + (x.name === track.preset ? " on" : ""), role: "option", "data-nav": `snd-${x.name}`, "aria-selected": String(x.name === track.preset),
            onclick: () => { app.edit("Preset", () => applyPreset(track, x)); previewSound(app, track); },
          }, x.name === track.preset ? "▶ " : "  ", x.name)))),
        h("div", { class: "cd-knobs" },
          ctl("chord", "Chord"),
          h("div", { class: "cd-char" }, ctl("strum", "★ Strum", "l"), ctl("warmth", "★ Warmth", "l"), ctl("voicing", "★ Voicing", "l")),
          ctl("attack", "Attack"), ctl("release", "Release"), ctl("level", "Level"))),
      keyboard(app, track),
    );
  }
  // Synths: SOUND (their own knobs, unchanged) | MORE (the voice toolkit) | XY.
  // A redesigned instrument has only its own panel: the toolkit is hidden voicing its presets set.
  if (!hasToolkit(track.kind) || REDESIGNED.has(track.kind)) return h("div", { class: `panel kind-${track.kind}`, style: `--track:${trackColor(track)}` }, presetBar, body);
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

/** Load a kit: its eight sounds go to the eight channels; the rest of the settings stay. */
function setKit(app: App, track: Track, k: number) {
  app.edit("Kit", () => {
    track.params.kit = k;
    for (let i = 0; i < 8; i++) track.params[`p${i}smp`] = k * 8 + i;
  });
  setTimeout(() => app.engine.preview(track.id, DRUM_BASE_NOTE, 100, 0.4), 250); // after the kit has loaded
}

function kitMenu(app: App, track: Track, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  app.overlays.menu("Kits", () => KITS.map((name, k) => ({
    label: name, checked: Math.round(track.params.kit ?? 0) === k, keepOpen: true, run: () => setKit(app, track, k),
  })), { x: r.left, y: r.bottom + 4 });
}

/** A channel's sound: the same part from every kit first, then any sound of any kit. */
function kitSoundMenu(app: App, track: Track, part: number, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const set = (smp: number) => {
    app.edit("Sound", () => (track.params[`p${part}smp`] = smp));
    setTimeout(() => app.engine.preview(track.id, DRUM_BASE_NOTE + part, 100, 0.4), 200);
  };
  const cur = Math.round(track.params[`p${part}smp`] ?? part);
  app.overlays.menu(`${part + 1} · ${DRUM_PART_LABELS[part]} sound`, () => [
    ...KITS.map((_, k) => ({ label: kitSoundName(k * 8 + part), checked: cur === k * 8 + part, keepOpen: true, run: () => set(k * 8 + part) })),
    { label: "Any sound", sub: () => KITS.map((name, k) => ({
      label: name, sub: () => Array.from({ length: 8 }, (_, q) => ({ label: kitSoundName(k * 8 + q), checked: cur === k * 8 + q, keepOpen: true, run: () => set(k * 8 + q) })),
    })) },
  ], { x: r.left, y: r.bottom + 4 });
}

function previewSound(app: App, track: Track) {
  const g = INSTRUMENTS[track.kind].group;
  app.engine.preview(track.id, isDrumKind(track.kind) ? DRUM_BASE_NOTE : (g === "bass" ? 36 : 60) + app.song.key, 100, 0.4);
}

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
