// Edit screen: piano roll on top, the track's instrument panel below.

import { DRUM_BASE_NOTE, INSTRUMENTS } from "../engine/instruments";
import { MAX_BARS, TICKS_PER_BAR, type Clip, type Note } from "../engine/model";
import { inScale, NOTE_NAMES, noteName, scaleById, snapToScale, stepInScale } from "../engine/music";
import { getParam, paramInfo } from "../engine/params";
import { fxDef } from "../engine/params";
import { drumCount, isDrumKind, toUnit } from "../engine/instruments";
import {
  NOTE_LENGTHS, addNote, duplicateClip, ensureClip, joinNotes, laneValue, legatoNotes, lengthLabel, makeLength, noteAt, outOfKeyNotes,
  quantizeClip, setAutoPoint, setClipBars, setNoteLength, snapClipToScale, splitLength, splitNote, type LengthMod,
} from "../engine/songops";
import { mods, type Action } from "./actions";
import type { App, EditorLayout, Screen } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
import type { MenuItem } from "./overlay";
import { SpatialNav } from "./nav";
import { buildPanel } from "./panels";
import { PianoRoll } from "./roll";
import { channelStrip } from "./mixer";
import { isPhone } from "./phone";

/** Couch mode: a compact editor locked to one player's instrument. */
export interface CouchEditorOpts {
  /** Extra menu items (change instrument, leave the game...). */
  extraMenu: () => MenuItem[];
}

export class EditorScreen implements Screen {
  el = h("div", { class: "editor" });
  private roll: PianoRoll;
  private toolbar = h("div", { class: "ed-toolbar" });
  private rollWrap = h("div", { class: "roll-wrap" });
  private panelWrap = h("div", { class: "panel-wrap" });
  private mixWrap = h("div", { class: "mix-wrap" });
  private nav = new SpatialNav(() => (this.app.ed.focus === "mix" ? this.mixWrap : this.panelWrap));

  /** Put the panel's (gamepad / keyboard) focus on a control, e.g. a knob by its parameter. */
  focusControl(param: string) {
    const el = this.panelWrap.querySelector<HTMLElement>(`[data-param="${param}"]`);
    if (el) this.nav.set(el);
  }
  private heldKey: HTMLElement | null = null;
  private meter = h("div", { class: "meter" }, h("div", { class: "meter-fill" }));
  private peak = 0;

  constructor(private app: App, private couch?: CouchEditorOpts) {
    this.roll = new PianoRoll(app, (x, y) => this.openMenu({ x, y }), (n, tick, x, y) => this.noteMenu(n, tick, { x, y }));
    this.rollWrap.appendChild(this.roll.canvas);
    this.el.append(this.toolbar, this.rollWrap, this.panelWrap);
    this.el.append(this.mixWrap); // the mix view (couch quarters, phones)
    this.panelWrap.addEventListener("pointerdown", () => { if (app.ed.focus === "roll" && !couch) { app.ed.focus = "panel"; this.paintFocus(); } });
  }

  /** Desktop editor layout: piano roll only, both, or the instrument panel only (\\ key, RB held). */
  setLayout(v?: EditorLayout) {
    const ed = this.app.ed, order: EditorLayout[] = ["split", "roll", "panel"];
    ed.layout = v ?? order[(order.indexOf(ed.layout ?? "split") + 1) % order.length];
    if (ed.layout === "roll" && ed.focus !== "roll") ed.focus = "roll";
    if (ed.layout === "panel") ed.focus = "panel";
    if (ed.layout === "split" && ed.focus === "mix") ed.focus = "roll";
    this.render();
    this.app.overlays.toast(ed.layout === "roll" ? "Piano roll only" : ed.layout === "panel" ? "Instrument panel only" : "Roll + panel", 900);
  }

  /** One view at a time (notes / sound / mix): couch quarters and phones. */
  private get compact() { return !!this.couch || isPhone(); }

  /** Couch quarters show one view at a time: notes, sound, or mix. */
  private setView(v: "roll" | "panel" | "mix") { this.app.ed.focus = v; this.render(); }

  private get clip(): Clip | undefined { return this.app.track()?.clips[this.app.ed.sceneId]; }

  render() {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track) return;
    if (this.compact) { this.renderCouch(); return; }
    this.el.classList.remove("couch-ed", "view-roll", "view-panel", "view-mix");
    if (ed.focus === "mix") ed.focus = "roll";
    const scene = app.song.scenes.find((s) => s.id === ed.sceneId);
    const clip = this.clip;
    const ti = app.song.tracks.indexOf(track);
    const si = app.song.scenes.indexOf(scene!);
    const btn = (label: string, on: boolean | null, onclick: () => void, title?: string) =>
      h("button", { class: "tb-btn" + (on ? " on" : ""), onclick, title }, label);
    // One row: where you are, the clip's length, the grid, the everyday tools, the layout, and ⋯ for the rest.
    const lay = ed.layout ?? "split";
    // Narrow windows show the short label (CSS picks), so the row never runs off the screen.
    const twin = (long: string, short: string, on: boolean, onclick: () => void, title: string) =>
      h("button", { class: "tb-btn" + (on ? " on" : ""), onclick, title }, h("span", { class: "lbl-long" }, long), h("span", { class: "lbl-short" }, short));
    const layBtn = (v: EditorLayout, label: string, title: string) =>
      h("button", { class: "tb-btn seg" + (lay === v ? " on" : ""), "data-coach": v === "panel" ? "sound" : null, onclick: () => this.setLayout(v), title }, label);
    this.toolbar.replaceChildren(
      h("div", { class: "tb-track", style: `--track:${trackColor(track)}` },
        h("button", { class: "tb-arrow", onclick: () => this.switchTrack(-1), title: "Previous instrument" }, "‹"),
        h("span", { class: "tb-trackname" }, `${ti + 1} · ${INSTRUMENTS[track.kind].name}`),
        h("button", { class: "tb-arrow", onclick: () => this.switchTrack(1), title: "Next instrument" }, "›")),
      h("div", { class: "tb-scene" },
        h("button", { class: "tb-arrow", onclick: () => this.switchScene(-1), title: "Previous scene" }, "‹"),
        h("span", null, `${si + 1} · ${scene?.name ?? ""}`),
        h("button", { class: "tb-arrow", onclick: () => this.switchScene(1), title: "Next scene" }, "›")),
      h("div", { class: "tb-group", title: "Clip length in bars" },
        h("span", { class: "tb-label" }, "Bars"),
        btn("−", null, () => this.setBars((clip?.bars ?? 1) - 1)),
        h("span", { class: "tb-value" }, String(clip?.bars ?? "—")),
        btn("+", null, () => this.setBars((clip?.bars ?? 1) + 1))),
      h("div", { class: "tb-group" },
        btn("1/8", ed.grid === 48, () => this.setGrid(48)),
        btn("1/16", ed.grid === 24, () => this.setGrid(24)),
        btn("1/32", ed.grid === 12, () => this.setGrid(12)),
        btn("3", ed.triplet, () => { ed.triplet = !ed.triplet; this.snapCursor(); this.render(); }, "Triplets")),
      this.lengthButton(),
      h("div", { class: "tb-group" },
        btn("Step", ed.stepInput, () => this.toggleStep(), "Step input: play notes while stopped, the cursor advances"),
        twin("Velocity", "Vel", ed.velView && !ed.autoKey, () => { ed.velView = !(ed.velView && !ed.autoKey); ed.autoKey = null; this.render(); }, "Velocity lane"),
        twin(ed.autoKey ? `Auto: ${paramInfo(track, ed.autoKey)?.label ?? ed.autoKey} ▾` : "Automation ▾", "Auto ▾", !!ed.autoKey, () => this.lanePicker(), "Show an automation lane: draw volume, filter, FX... across the clip"),
        !isDrumKind(track.kind) ? twin(app.settings.scaleLock ? "Scale lock ●" : "Scale lock ○", app.settings.scaleLock ? "Lock ●" : "Lock ○", app.settings.scaleLock, () => this.toggleLock(), "Scale lock: only notes in the song's key") : null,
        this.outKeyButton()),
      h("div", { class: "spacer" }),
      h("div", { class: "tb-group layout-seg", title: "Roll only / split / panel only (\\ key, or hold RB)" },
        layBtn("roll", "Roll", "Piano roll only"), layBtn("split", "Split", "Piano roll and instrument panel"), layBtn("panel", "Sound", "The instrument's sound panel only")),
      h("button", { class: "tb-btn menu-btn", onclick: () => this.openMenu(), title: "More: quantize, duplicate, zoom, hide out-of-key... (X / M)" }, "⋯"),
    );
    this.el.classList.toggle("layout-roll", lay === "roll");
    this.el.classList.toggle("layout-panel", lay === "panel");
    this.panelWrap.replaceChildren(buildPanel(app, track));
    this.panelWrap.dataset.panelTrack = String(track.id); // keys / pads light up for notes from any input
    app.markLearned(this.panelWrap, track.id);
    this.roll.invalidate();
    this.paintFocus();
  }

  /** The couch quarter: a short toolbar, then the notes, the sound panel or the mix strip. */
  private renderCouch() {
    const app = this.app, ed = app.ed, track = app.track()!, clip = this.clip;
    const btn = (label: string, on: boolean | null, onclick: () => void, title?: string) =>
      h("button", { class: "tb-btn" + (on ? " on" : ""), onclick, title }, label);
    const tab = (v: "roll" | "panel" | "mix", label: string) => {
      const b = btn(label, ed.focus === v, () => this.setView(v), "Switch view (RB / Tab)");
      if (v === "panel") b.dataset.coach = "sound";
      return b;
    };
    const roll = ed.focus === "roll";
    this.el.classList.add("couch-ed");
    // A phone (not a couch seat) can still move between instruments.
    const ti = app.song.tracks.indexOf(track);
    const picker = !this.couch ? h("div", { class: "tb-track", style: `--track:${trackColor(track)}` },
      h("button", { class: "tb-arrow", onclick: () => this.switchTrack(-1) }, "‹"),
      h("span", { class: "tb-trackname" }, `${ti + 1} · ${INSTRUMENTS[track.kind].name}`),
      h("button", { class: "tb-arrow", onclick: () => this.switchTrack(1) }, "›")) : "";
    this.toolbar.replaceChildren(
      picker,
      h("div", { class: "tb-group tabs" }, tab("roll", "Notes"), tab("panel", "Sound"), tab("mix", "Mix")),
      this.outKeyButton() ?? "",
      h("button", { class: "tb-btn menu-btn", onclick: () => this.openMenu() }, "☰"),
      roll ? h("div", { class: "tb-tools" },
        h("div", { class: "tb-group" },
          h("span", { class: "tb-label" }, "Bars"),
          btn("−", null, () => this.setBars((clip?.bars ?? 1) - 1)),
          h("span", { class: "tb-value" }, String(clip?.bars ?? "—")),
          btn("+", null, () => this.setBars((clip?.bars ?? 1) + 1)),
          btn("×2", null, () => this.duplicate(), "Double the clip, notes included")),
        this.lengthButton(),
        h("div", { class: "tb-group" },
          btn("−", null, () => { this.roll.zoom(-1); this.render(); }, "Zoom out"),
          h("span", { class: "tb-value zoom-value" }, this.roll.zoomLabel()),
          btn("+", null, () => { this.roll.zoom(1); this.render(); }, "Zoom in")),
        h("div", { class: "tb-group" },
          btn("1/8", ed.grid === 48, () => this.setGrid(48)),
          btn("1/16", ed.grid === 24, () => this.setGrid(24)),
          btn("1/32", ed.grid === 12, () => this.setGrid(12)),
          btn("Step", ed.stepInput, () => this.toggleStep(), "Step input: play notes while stopped, the cursor advances"))) : "",
    );
    this.el.classList.toggle("view-roll", ed.focus === "roll");
    this.el.classList.toggle("view-panel", ed.focus === "panel");
    this.el.classList.toggle("view-mix", ed.focus === "mix");
    if (ed.focus === "panel") {
      const panel = buildPanel(app, track);
      this.panelWrap.replaceChildren(panel);
      this.panelWrap.dataset.panelTrack = String(track.id);
      app.markLearned(this.panelWrap, track.id);
      requestAnimationFrame(() => this.fitPanel(panel));
    } else this.panelWrap.replaceChildren();
    if (ed.focus === "mix") this.mixWrap.replaceChildren(channelStrip(app, track, app.song.tracks.indexOf(track), this.meter));
    else this.mixWrap.replaceChildren();
    this.roll.invalidate();
    this.paintFocus();
  }

  /** Shrink the sound panel to fit its quarter (instrument panels are laid out for a full screen). */
  private fitPanel(panel: HTMLElement) {
    panel.style.zoom = "";
    const avail = this.panelWrap.clientHeight, aw = this.panelWrap.clientWidth;
    const need = panel.scrollHeight, nw = panel.scrollWidth;
    const z = Math.min(1, avail / Math.max(1, need), aw / Math.max(1, nw));
    if (z < 1) panel.style.zoom = String(Math.max(0.45, z * 0.98));
  }

  private paintFocus() {
    const f = this.app.ed.focus;
    this.el.classList.toggle("focus-panel", f === "panel" || f === "mix");
    this.el.classList.toggle("focus-roll", f === "roll");
    if (f !== "roll") this.nav.paint(); else this.nav.clearPaint();
    this.roll.invalidate();
  }

  /** Redraw the roll (another player's cursor moved). */
  poke() { this.roll.invalidate(); }

  frame() {
    this.roll.frame();
    if (this.couch && this.app.ed.focus === "mix") {
      const raw = this.app.engine.meter(this.app.ed.trackId);
      this.peak = Math.max(raw, this.peak * 0.92);
      const db = this.peak > 0 ? 20 * Math.log10(this.peak) : -60;
      (this.meter.firstElementChild as HTMLElement).style.height = `${100 - Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
    }
  }

  enter() { this.fitCursor(); }

  paramChanged(trackId: number, id: string) {
    if (trackId !== this.app.ed.trackId) return;
    this.mixWrap.querySelector<HTMLElement & { redraw?: () => void }>(`[data-param="${id}"]`)?.redraw?.();
    const el = this.panelWrap.querySelector<HTMLElement & { redraw?: () => void }>(`[data-param="${id}"]`);
    el?.redraw?.();
    // Drum sound names and chord labels live outside the knob.
    if (/^p\dsmp$|^chord$|^spread$/.test(id)) this.render();
    if (id === "pos" || id === "table") this.panelWrap.querySelector<HTMLElement & { redraw?: () => void }>(".wt-view")?.redraw?.();
  }

  // ------------------------------------------------------------ navigation

  private switchTrack(d: number) {
    if (this.couch) return; // a couch player keeps their own instrument
    const app = this.app, ts = app.song.tracks;
    const i = ts.findIndex((t) => t.id === app.ed.trackId);
    const n = ts[(i + d + ts.length) % ts.length];
    if (!n) return;
    app.ed.trackId = n.id;
    app.ed.sel.clear();
    this.fitCursor();
    app.refresh();
  }

  private switchScene(d: number) {
    if (this.couch) return; // the conductor picks the scene for everyone
    const app = this.app, ss = app.song.scenes;
    const i = ss.findIndex((s) => s.id === app.ed.sceneId);
    const n = ss[(i + d + ss.length) % ss.length];
    app.ed.sceneId = n.id;
    app.ed.sel.clear();
    if (app.engine.playing && app.songMode === "scene") app.engine.queue({ kind: "scene", sceneId: n.id });
    this.fitCursor();
    app.refresh();
  }

  /** Keep the cursor inside the clip and on a sensible row after switching. */
  fitCursor() {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track) return;
    const ticks = (this.clip?.bars ?? 1) * TICKS_PER_BAR;
    if (ed.tick >= ticks) ed.tick = 0;
    // Each track remembers its own cursor row and keyboard octave.
    if (this.lastTrack !== undefined && this.lastTrack !== track.id) this.rows.set(this.lastTrack, { pitch: ed.pitch, octave: ed.octave });
    if (this.lastTrack !== track.id) {
      const saved = this.rows.get(track.id);
      if (saved) { ed.pitch = saved.pitch; ed.octave = saved.octave; }
      else if (isDrumKind(track.kind)) ed.pitch = DRUM_BASE_NOTE;
      else { const bass = INSTRUMENTS[track.kind].group === "bass"; ed.pitch = (bass ? 36 : 60) + app.song.key; ed.octave = bass ? 2 : 4; }
      ed.topPitch = ed.pitch + 8;
      this.lastTrack = track.id;
    }
    if (isDrumKind(track.kind)) ed.pitch = Math.max(DRUM_BASE_NOTE, Math.min(DRUM_BASE_NOTE + drumCount(track.kind) - 1, ed.pitch));
    this.roll.scrollToCursor();
  }

  private lastTrack: number | undefined;
  private rows = new Map<number, { pitch: number; octave: number }>();

  private snapCursor() {
    const g = this.app.grid();
    this.app.ed.tick = Math.floor(this.app.ed.tick / g) * g;
    this.roll.invalidate();
  }

  private setGrid(g: number) { this.app.ed.grid = g; this.snapCursor(); this.render(); }

  private setBars(bars: number) {
    const app = this.app, track = app.track();
    if (!track) return;
    bars = Math.max(1, Math.min(MAX_BARS, bars));
    app.edit("Clip length", () => setClipBars(ensureClip(app.song, track, app.ed.sceneId), bars));
    this.fitCursor();
  }

  private duplicate() {
    const app = this.app, track = app.track();
    if (!track) return;
    const clip = ensureClip(app.song, track, app.ed.sceneId);
    if (clip.bars * 2 > MAX_BARS) { app.overlays.toast(`Clips are ${MAX_BARS} bars max`); return; }
    app.edit("Duplicate clip", () => duplicateClip(app.song, clip));
  }

  private toggleStep() {
    const ed = this.app.ed;
    ed.stepInput = !ed.stepInput;
    ed.stepTick = ed.tick;
    this.app.overlays.toast(ed.stepInput ? "Step input on: play notes while stopped" : "Step input off", 1400);
    this.render();
  }

  toggleFold() {
    const app = this.app;
    app.settings.fold = !app.settings.fold;
    app.saveSettings();
    if (app.settings.fold) app.ed.pitch = snapToScale(app.ed.pitch, app.song.key, app.song.scale);
    this.roll.scrollToCursor();
    this.render();
  }

  /** Pick which automation lane to show (or hide it). Lanes that have points come first. */
  lanePicker() {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track) return;
    const clip = this.clip;
    const has = (k: string) => !!clip?.auto?.[k]?.length;
    const show = (k: string | null) => { ed.autoKey = k; if (k) ed.velView = false; this.render(); };
    const item = (k: string, label?: string) => ({ label: label ?? paramInfo(track, k)?.label ?? k, checked: ed.autoKey === k, hint: has(k) ? "●" : "", run: () => show(k) });
    const def = INSTRUMENTS[track.kind];
    const lanes = Object.keys(clip?.auto ?? {}).filter(has);
    const fx = track.fx.flatMap((f, i) => f.type === "off" ? [] : [item(`fx${i}:a`, `FX${i + 1} ${fxDef(f.type).name}: ${fxDef(f.type).a}`), item(`fx${i}:b`, `FX${i + 1} ${fxDef(f.type).name}: ${fxDef(f.type).b}`)]);
    app.overlays.menu("Automation lane", () => [
      ...(ed.autoKey ? [{ label: "Hide lane", run: () => show(null) }] : []),
      ...lanes.map((k) => item(k)),
      item("mix:vol", "Volume (fades)"), item("mix:pan", "Pan"), item("mix:send", "Reverb send"),
      ...fx,
      ...def.macros.map((k) => item(k)),
      { label: "All sound settings", sub: () => def.params.filter((p) => !p.options).map((p) => item(p.id)) },
      ...(ed.autoKey && has(ed.autoKey) ? [{ label: "Clear this lane", run: () => app.edit("Clear lane", () => { delete clip!.auto![ed.autoKey!]; }) }] : []),
    ]);
  }

  /** "⚠ 3 out of key": notes off the song's scale in this clip. Click: snap them, or select them. */
  private outKeyButton(): HTMLElement | null {
    const app = this.app, track = app.track(), clip = this.clip;
    if (!track || isDrumKind(track.kind)) return null;
    const off = outOfKeyNotes(clip, app.song.key, app.song.scale);
    if (!off.length) return null;
    const n = off.length;
    return h("button", { class: "tb-btn outkey-btn", title: `${n} note${n > 1 ? "s" : ""} outside ${NOTE_NAMES[app.song.key]} ${scaleById(app.song.scale).name}`, onclick: (e: Event) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const sel = [...app.ed.sel].filter((id) => off.some((x) => x.id === id));
      app.overlays.menu(`${n} note${n > 1 ? "s" : ""} out of key`, () => [
        { label: `Snap to scale (${n} note${n > 1 ? "s" : ""})`, hint: "nearest in-key row", run: () => app.edit("Snap to scale", () => snapClipToScale(clip!, app.song.key, app.song.scale)) },
        ...(sel.length && sel.length < n ? [{ label: `Snap the selected ones (${sel.length})`, run: () => app.edit("Snap to scale", () => snapClipToScale(clip!, app.song.key, app.song.scale, new Set(sel))) }] : []),
        { label: "Select them", run: () => { app.ed.sel = new Set(off.map((x) => x.id)); this.roll.invalidate(); this.render(); } },
      ], { x: r.left, y: r.bottom + 4 });
    } }, h("span", { class: "outkey-mark", "aria-hidden": "true" }, "⚠"), h("span", { class: "lbl-long" }, ` ${n} out of key`), h("span", { class: "lbl-short" }, ` ${n}`));
  }

  // ------------------------------------------------------------ note length

  /** The toolbar's length picker: what new notes get on this track (B / N, LT + LB / RB on a pad). */
  private lengthButton(): HTMLElement {
    const app = this.app, track = app.track();
    const own = track?.noteLen !== undefined;
    return h("button", { class: "tb-btn len-btn" + (own ? " own" : ""), "data-coach": "length", title: "Length of new notes (B / N). A drag still sets it by hand", onclick: (e: Event) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      app.overlays.menu("New note length", () => this.lengthItems(), { x: r.left, y: r.bottom + 4 });
    } }, h("span", { class: "len-note", "aria-hidden": "true" }, "♪"), ` ${lengthLabel(app.noteLength(track))} ▾`);
  }

  private lengthItems(): MenuItem[] {
    const app = this.app, track = app.track(), cur = app.noteLength(track);
    const parts = splitLength(cur) ?? { base: cur, mod: "" as LengthMod };
    const set = (ticks: number | undefined) => { app.setNoteLength(ticks, track); this.render(); };
    return [
      ...NOTE_LENGTHS.map((l) => ({ label: l.label, checked: track?.noteLen !== undefined && parts.base === l.ticks, keepOpen: true, run: () => set(makeLength(l.ticks, parts.mod)) })),
      { label: "Dotted (x1.5)", checked: parts.mod === "dot", keepOpen: true, run: () => set(makeLength(parts.base, parts.mod === "dot" ? "" : "dot")) },
      { label: "Triplet (x2/3)", checked: parts.mod === "tri", keepOpen: true, run: () => set(makeLength(parts.base, parts.mod === "tri" ? "" : "tri")) },
      { label: "Same as the grid", checked: track?.noteLen === undefined, keepOpen: true, run: () => set(undefined) },
      { label: `Set the selected notes to ${lengthLabel(cur)}`, disabled: !this.roll.selectedNotes().length, run: () => this.noteOp("setLen"), hint: "Ctrl+K" },
    ];
  }

  /** Right-click on a note: what to do with it (or with the selection, when it's part of one). */
  private noteMenu(n: Note, tick: number, at: { x: number; y: number }) {
    const app = this.app, ed = app.ed, clip = this.clip;
    if (!clip || app.locked) return;
    const group = ed.sel.has(n.id) ? this.roll.selectedNotes() : [n];
    const many = group.length > 1, what = many ? `${group.length} notes` : "Note";
    const inside = tick > n.start && tick < n.start + n.len;
    app.overlays.menu(many ? `${group.length} selected notes` : `Note ${noteName(n.pitch)}`, () => [
      { label: "Split here", disabled: !inside, hint: inside ? "at the grid line you clicked" : "click inside the note", run: () => app.edit("Split note", () => splitNote(app.song, clip, n, tick)) },
      { label: "Length", sub: () => NOTE_LENGTHS.flatMap((l) => [l.ticks, l.ticks * 1.5]).map((t) => ({ label: lengthLabel(t), checked: group.every((x) => x.len === t), run: () => app.edit(`${what}: length`, () => setNoteLength(group, t)) })) },
      { label: "Velocity", sub: () => [127, 110, 100, 80, 60, 40].map((v) => ({ label: String(v), checked: group.every((x) => x.vel === v), run: () => app.edit(`${what}: velocity`, () => group.forEach((x) => (x.vel = v))) })) },
      { label: "Legato: to the next note", hint: "Ctrl+G", run: () => app.edit("Legato", () => legatoNotes(clip, group)) },
      { label: "Join with the notes it touches", hint: "same pitch", run: () => app.edit("Join notes", () => joinNotes(clip, clip.notes.filter((x) => x.pitch === n.pitch))) },
      { label: many ? "Delete these notes" : "Delete note", hint: "Delete", run: () => app.edit("Delete note", () => { const gone = new Set(group); clip.notes = clip.notes.filter((x) => !gone.has(x)); group.forEach((x) => ed.sel.delete(x.id)); }) },
    ], at);
  }

  /** Split (at the cursor), join, legato, set length: on the selection, or the note under the cursor. */
  noteOp(op: "split" | "join" | "legato" | "setLen") {
    const app = this.app, ed = app.ed, clip = this.clip, track = app.track();
    if (!clip || !track || app.locked) return;
    const sel = this.roll.selectedNotes(), under = noteAt(clip, ed.tick, ed.pitch);
    const targets = sel.length ? sel : under ? [under] : [];
    if (op === "split") {
      const n = under ?? sel.find((x) => ed.tick > x.start && ed.tick < x.start + x.len);
      if (!n || ed.tick <= n.start || ed.tick >= n.start + n.len) { app.overlays.toast("Put the cursor inside a note, on the grid line to split at", 1500); return; }
      app.edit("Split note", () => splitNote(app.song, clip, n, ed.tick));
      return;
    }
    if (op === "join") {
      if (sel.length < 2) { app.overlays.toast("Select the notes to join (Shift + arrows, or Shift + drag a box)", 1600); return; }
      let merged = 0;
      app.edit("Join notes", () => { merged = joinNotes(clip, sel); });
      if (!merged) app.overlays.toast("Nothing to join: same-pitch notes have to touch", 1500);
      ed.sel = new Set(clip.notes.filter((n) => ed.sel.has(n.id)).map((n) => n.id));
      return;
    }
    if (!targets.length) { app.overlays.toast("Select notes first (or put the cursor on one)", 1400); return; }
    if (op === "legato") app.edit("Legato", () => legatoNotes(clip, targets));
    else app.edit("Set length", () => setNoteLength(targets, app.noteLength(track)));
  }

  private toggleLock() {
    this.app.settings.scaleLock = !this.app.settings.scaleLock;
    this.app.saveSettings();
    this.render();
  }

  private quantize() {
    const clip = this.clip;
    if (!clip) return;
    const sel = this.roll.selectedNotes();
    const app = this.app, grid = app.grid();
    const gridName = `${grid === 48 ? "1/8" : grid === 24 ? "1/16" : grid === 32 ? "1/8 triplet" : "1/16 triplet"}`;
    const targets = sel.length ? sel : clip.notes;
    if (!targets.length) { app.overlays.toast("No notes to quantize"); return; }
    const off = targets.filter((n) => n.start % grid !== 0).length;
    if (!off) { app.overlays.toast(`Already on the ${gridName} grid${sel.length ? "" : " (all notes)"}`); return; }
    let moved = 0;
    app.edit("Quantize", () => { moved = quantizeClip(clip, targets, grid); });
    app.overlays.toast(`Quantized to ${gridName}: ${moved} note${moved === 1 ? "" : "s"} moved`);
  }

  // ------------------------------------------------------------ actions

  handle(a: Action): boolean {
    const app = this.app, ed = app.ed;
    if (a.type === "focusSwap") {
      if (this.compact) { this.setView(ed.focus === "roll" ? "panel" : ed.focus === "panel" ? "mix" : "roll"); return true; }
      if ((ed.layout ?? "split") !== "split") return true; // one half showing: nothing to swap to
      ed.focus = ed.focus === "roll" ? "panel" : "roll"; this.paintFocus(); return true;
    }
    if (a.type === "menu") { this.openMenu(); return true; }
    if (a.type === "layout") { if (!this.compact) this.setLayout(); return true; }
    if (a.type === "shortcut") return false;
    if (a.type === "noteOp") { this.noteOp(a.op); return true; } // the notes, whichever side has the focus
    if (ed.focus !== "roll") return this.handlePanel(a);
    return this.handleRoll(a);
  }

  private handlePanel(a: Action): boolean {
    const app = this.app, track = app.track();
    if (!track) return false;
    const f = this.nav.focused;
    switch (a.type) {
      case "dir":
        if (!this.nav.move(a.dir) && a.dir === "up" && !this.compact) { app.ed.focus = "roll"; this.paintFocus(); }
        if (app.learning && this.nav.focused?.dataset.param) app.noteLearnTarget(track.id, this.nav.focused.dataset.param);
        return true;
      case "knob": {
        const id = f?.dataset.param;
        if (id) app.nudgeParam(track, id, a.dx + a.dy);
        return true;
      }
      case "confirm": {
        if (!f) return true;
        if (f.dataset.note) {
          // Gamepad A on a key/pad plays it until A is released.
          this.heldKey = f;
          app.noteInput(Number(f.dataset.note), 110, true);
          f.classList.add("down");
          if (f.dataset.nav?.startsWith("pad")) { app.ed.drumPart = Number(f.dataset.nav.slice(3)); this.render(); this.nav.focusId(f.dataset.nav!); this.nav.paint(); }
        } else f.click();
        return true;
      }
      case "confirmUp":
        if (this.heldKey) { app.noteInput(Number(this.heldKey.dataset.note), 0, false); this.heldKey.classList.remove("down"); this.heldKey = null; }
        return true;
      case "back": if (this.compact) this.setView("roll"); else { app.ed.focus = "roll"; this.paintFocus(); } return true;
    }
    return false;
  }

  private handleRoll(a: Action): boolean {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track) return false;
    const grid = app.grid();
    const clip = this.clip;
    const drums = isDrumKind(track.kind);
    const ticks = (clip?.bars ?? 1) * TICKS_PER_BAR;
    const vstep = (p: number, dir: 1 | -1) =>
      drums || (!app.settings.scaleLock && !app.settings.fold) ? this.roll.clampPitch(p + dir) : this.roll.clampPitch(stepInScale(p, dir, app.song.key, app.song.scale));

    switch (a.type) {
      case "dir": {
        const dir = a.dir;
        // Moving a grabbed selection (A held on a selected note).
        if (ed.grabbing && clip) {
          const sel = clip.notes.filter((n) => ed.sel.has(n.id));
          for (const n of sel) {
            if (dir === "left") n.start = Math.max(0, n.start - grid);
            if (dir === "right") n.start = Math.min(ticks - grid, n.start + grid);
            if (dir === "up") n.pitch = vstep(n.pitch, 1);
            if (dir === "down") n.pitch = vstep(n.pitch, -1);
          }
          if (dir === "left") ed.tick = Math.max(0, ed.tick - grid);
          if (dir === "right") ed.tick = Math.min(ticks - grid, ed.tick + grid);
          if (dir === "up" || dir === "down") { ed.pitch = vstep(ed.pitch, dir === "up" ? 1 : -1); if (app.settings.notePreview && sel[0]) app.engine.preview(track.id, sel[0].pitch, sel[0].vel, 0.12); }
          app.changed(false);
          break;
        }
        // A held after placing a note: left/right set its length.
        if (ed.placing !== null && mods.confirmHeld && clip && (dir === "left" || dir === "right")) {
          const n = clip.notes.find((x) => x.id === ed.placing);
          if (n) {
            n.len = Math.max(grid, Math.min(ticks * 2, n.len + (dir === "right" ? grid : -grid)));
            app.changed(false);
          }
          break;
        }
        if (dir === "left") ed.tick = (ed.tick - grid + ticks) % ticks;
        if (dir === "right") ed.tick = (ed.tick + grid) % ticks;
        if (dir === "up") ed.pitch = vstep(ed.pitch, 1);
        if (dir === "down") ed.pitch = vstep(ed.pitch, -1);
        if (ed.stepInput) ed.stepTick = ed.tick;
        if (mods.select && ed.selAnchor) this.roll.selectRange(ed.selAnchor.tick, ed.tick + grid, ed.selAnchor.pitch, ed.pitch, false);
        this.roll.scrollToCursor();
        break;
      }
      case "selectHold":
        if (a.down) ed.selAnchor = { tick: ed.tick, pitch: ed.pitch };
        else ed.selAnchor = null;
        break;
      case "confirm": {
        if (app.locked) { app.overlays.toast("Time's up. Editing is locked."); return true; }
        const hit = clip ? noteAt(clip, ed.tick, ed.pitch) : undefined;
        if (hit && ed.sel.has(hit.id)) {
          app.history.push(app.song, "Move notes");
          ed.grabbing = true;
        } else if (hit) {
          app.edit("Delete note", () => { clip!.notes = clip!.notes.filter((n) => n !== hit); });
        } else {
          if (!drums && app.settings.scaleLock && !inScale(ed.pitch, app.song.key, app.song.scale)) {
            app.overlays.toast("Out of key (scale lock is on)", 1000);
            return true;
          }
          app.edit("Add note", () => {
            const c = ensureClip(app.song, track, ed.sceneId);
            ed.placing = addNote(app.song, c, { pitch: ed.pitch, start: ed.tick, len: app.noteLength(track), vel: 100 }).id;
          }, { render: false });
          if (app.settings.notePreview) app.engine.preview(track.id, ed.pitch);
        }
        break;
      }
      case "confirmUp":
        if (ed.grabbing && clip) clip.notes.sort((x, y) => x.start - y.start);
        if (ed.grabbing || ed.placing !== null) app.changed();
        ed.placing = null;
        ed.grabbing = false;
        break;
      case "knob": {
        if (app.locked) return true;
        if (a.dy && ed.autoKey) {
          // Right stick up/down (or - / =) draws the automation lane at the cursor.
          const key = ed.autoKey, def = paramInfo(track, key);
          if (!def) return true;
          const c = ensureClip(app.song, track, ed.sceneId);
          const lane = c.auto?.[key] ?? [];
          const cur = lane.length ? laneValue(lane, ed.tick) : toUnit(def, getParam(track, key));
          app.edit("Draw automation", () => setAutoPoint(c, key, ed.tick, cur + a.dy * (mods.fine ? 0.005 : 0.03)), { render: false, snapshot: !this.autoGesture() });
          if (!a.dx) break;
        }
        if (!clip) return true;
        const sel = this.roll.selectedNotes();
        const hit = noteAt(clip, ed.tick, ed.pitch);
        const targets = sel.length ? sel : hit ? [hit] : [];
        if (!targets.length) return true;
        app.history.push(app.song, a.dx ? "Note length" : "Velocity");
        for (const n of targets) {
          if (a.dx) n.len = Math.max(mods.fine ? 6 : grid, n.len + a.dx * (mods.fine ? 6 : grid));
          if (a.dy) n.vel = Math.max(1, Math.min(127, n.vel + a.dy * (mods.fine ? 1 : 8)));
        }
        if (a.dy && !ed.velView) app.overlays.toast(`Velocity ${targets[0].vel}`, 600);
        app.changed(false);
        break;
      }
      case "delete": {
        if (!clip) return true;
        const sel = this.roll.selectedNotes();
        const hit = noteAt(clip, ed.tick, ed.pitch);
        const lane = ed.autoKey ? clip.auto?.[ed.autoKey] : undefined;
        if (sel.length) app.edit("Delete notes", () => { clip.notes = clip.notes.filter((n) => !ed.sel.has(n.id)); ed.sel.clear(); });
        else if (hit) app.edit("Delete note", () => { clip.notes = clip.notes.filter((n) => n !== hit); });
        else if (lane?.length) {
          // With a lane open and no note under the cursor: delete the lane point in the cursor's grid step.
          const g = app.grid();
          const i = lane.findIndex((p) => p.tick >= ed.tick && p.tick < ed.tick + g);
          if (i >= 0) app.edit("Delete point", () => lane.splice(i, 1));
          else app.overlays.toast("No automation point at the cursor", 900);
        }
        break;
      }
      case "selectAll": if (clip) { ed.sel = new Set(clip.notes.map((n) => n.id)); } break;
      case "copy": this.copy(false); break;
      case "cut": this.copy(true); break;
      case "paste": this.paste(); break;
      case "duplicate": this.duplicate(); break;
      case "back":
        if (ed.sel.size) { ed.sel.clear(); break; }
        if (!this.couch) app.show("song");
        return true;
      default: return false;
    }
    this.roll.invalidate();
    return true;
  }

  private lastAutoEdit = 0;
  /** True while consecutive automation nudges belong to one gesture (one undo step). */
  private autoGesture(): boolean {
    const now = performance.now(), cont = now - this.lastAutoEdit < 800;
    this.lastAutoEdit = now;
    return cont;
  }

  private copy(cut: boolean) {
    const app = this.app, ed = app.ed, clip = this.clip;
    const sel = this.roll.selectedNotes();
    if (!clip || !sel.length) { app.overlays.toast("Select notes first (hold Shift / RT and move)"); return; }
    const t0 = Math.min(...sel.map((n) => n.start));
    ed.clipboard = sel.map((n) => ({ pitch: n.pitch, start: n.start - t0, len: n.len, vel: n.vel }));
    if (cut) app.edit("Cut", () => { clip.notes = clip.notes.filter((n) => !ed.sel.has(n.id)); ed.sel.clear(); });
    app.overlays.toast(`${cut ? "Cut" : "Copied"} ${sel.length} note${sel.length > 1 ? "s" : ""}`, 900);
  }

  private paste() {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track || !ed.clipboard.length) { app.overlays.toast("Clipboard is empty"); return; }
    app.edit("Paste", () => {
      const clip = ensureClip(app.song, track, ed.sceneId);
      const ticks = clip.bars * TICKS_PER_BAR;
      ed.sel.clear();
      for (const n of ed.clipboard) {
        const start = ed.tick + n.start;
        if (start >= ticks) continue;
        ed.sel.add(addNote(app.song, clip, { ...n, start }).id);
      }
    });
  }

  // ------------------------------------------------------------ menu

  openMenu(at?: { x: number; y: number }) {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track) return;
    if (!at) {
      const r = this.roll.canvas.getBoundingClientRect();
      at = { x: r.left + r.width / 2 - 100, y: r.top + 40 };
    }
    const items = (): MenuItem[] => {
      const clip = this.clip;
      const sel = this.roll.selectedNotes().length;
      return [
        { label: "Quantize notes", run: () => this.quantize(), hint: "snap to the grid" },
        { label: "Split note at the cursor", run: () => this.noteOp("split"), hint: "Ctrl+E · Alt+click" },
        { label: "Join selected notes", disabled: sel < 2, run: () => this.noteOp("join"), hint: "Ctrl+J" },
        { label: "Legato: to the next note", run: () => this.noteOp("legato"), hint: "Ctrl+G" },
        { label: `Set length: ${lengthLabel(app.noteLength(track))}`, run: () => this.noteOp("setLen"), hint: "Ctrl+K" },
        { label: `New note length: ${lengthLabel(app.noteLength(track))}`, sub: () => this.lengthItems(), hint: "B / N" },
        { label: "Duplicate clip (x2)", run: () => this.duplicate(), hint: "Ctrl+D" },
        { label: "Zoom in", keepOpen: true, run: () => { this.roll.zoom(1); this.render(); }, hint: "Ctrl+wheel" },
        { label: "Zoom out", keepOpen: true, run: () => { this.roll.zoom(-1); this.render(); }, hint: this.roll.zoomLabel() },
        { label: "Hide out-of-key rows", checked: app.settings.fold, keepOpen: true, disabled: isDrumKind(track.kind), run: () => this.toggleFold() },
        { label: "Paste", disabled: !ed.clipboard.length, run: () => this.paste(), hint: "Ctrl+V" },
        { label: "Copy selection", disabled: !sel, run: () => this.copy(false), hint: "Ctrl+C" },
        { label: "Cut selection", disabled: !sel, run: () => this.copy(true), hint: "Ctrl+X" },
        { label: "Delete selection", disabled: !sel, run: () => this.handleRoll({ type: "delete" }) },
        { label: "Select all", run: () => { if (clip) ed.sel = new Set(clip.notes.map((n) => n.id)); this.roll.invalidate(); }, hint: "Ctrl+A" },
        { label: "Clip length", sub: () => Array.from({ length: MAX_BARS }, (_, i) => ({ label: `${i + 1} bar${i ? "s" : ""}`, checked: (clip?.bars ?? 1) === i + 1, run: () => this.setBars(i + 1) })) },
        { label: `Zoom: ${this.roll.zoomLabel()}`, sub: () => [0, 4, 2, 1].map((b) => ({
          label: b ? `${b} bar${b > 1 ? "s" : ""}` : "Fit the whole clip",
          checked: (ed.viewBars || 0) === b,
          run: () => { ed.viewBars = b; this.roll.scrollToTick(ed.tick); this.render(); },
        })) },
        { label: "Grid", sub: () => [
          { label: "1/8", checked: ed.grid === 48, run: () => this.setGrid(48) },
          { label: "1/16", checked: ed.grid === 24, run: () => this.setGrid(24) },
          { label: "1/32", checked: ed.grid === 12, run: () => this.setGrid(12) },
          { label: "Triplets", checked: ed.triplet, run: () => { ed.triplet = !ed.triplet; this.snapCursor(); this.render(); } },
        ] },
        { label: "Velocity view", checked: ed.velView && !ed.autoKey, keepOpen: true, run: () => { ed.velView = !(ed.velView && !ed.autoKey); ed.autoKey = null; this.render(); } },
        { label: "Automation lane…", run: () => this.lanePicker() },
        { label: "Step input", checked: ed.stepInput, keepOpen: true, run: () => this.toggleStep() },
        { label: "Scale lock", checked: app.settings.scaleLock, keepOpen: true, run: () => this.toggleLock() },
        { label: "Note preview", checked: app.settings.notePreview, keepOpen: true, run: () => { app.settings.notePreview = !app.settings.notePreview; app.saveSettings(); } },
        { label: "Count-in before recording", checked: app.settings.countIn, keepOpen: true, run: () => { app.settings.countIn = !app.settings.countIn; app.saveSettings(); } },
        { label: "Record quantize", checked: app.settings.recQuantize, keepOpen: true, run: () => { app.settings.recQuantize = !app.settings.recQuantize; app.saveSettings(); } },
        { label: "Transpose", disabled: isDrumKind(track.kind), sub: () => [12, 1, -1, -12].map((d) => ({ label: d > 0 ? `+${d}` : String(d), run: () => this.transpose(d) })) },
        { label: "Clear clip", disabled: !clip?.notes.length, run: () => app.edit("Clear clip", () => { clip!.notes = []; ed.sel.clear(); }) },
        { label: ed.autoKey ? `Clear lane: ${paramInfo(track, ed.autoKey)?.label ?? ed.autoKey}` : "Clear lane (open one first)", disabled: !ed.autoKey || !clip?.auto?.[ed.autoKey]?.length, run: () => app.edit("Clear lane", () => { delete clip!.auto![ed.autoKey!]; }) },
        { label: "Clear all automation in this clip", disabled: !Object.values(clip?.auto ?? {}).some((l) => l.length), run: () => app.edit("Clear automation", () => { clip!.auto = {}; }) },
        { label: app.learning ? "MIDI learn: finish" : "MIDI learn…", run: () => app.setLearning(!app.learning) },
        { label: "Undo", disabled: !app.history.canUndo, run: () => app.undo(), hint: app.history.undoLabel ?? "" },
        { label: "Redo", disabled: !app.history.canRedo, run: () => app.redo() },
        { label: "Undo history…", disabled: !app.history.canUndo, sub: () => app.history.labels().slice(0, 20).map((l, i) => ({ label: l, run: () => { for (let k = 0; k <= i; k++) app.undo(); } })) },
        { label: `Key: ${NOTE_NAMES[app.song.key]} ${scaleById(app.song.scale).name}`, disabled: true },
        ...(this.couch?.extraMenu() ?? []),
      ];
    };
    app.overlays.menu(`${INSTRUMENTS[track.kind].name} · clip`, items, at);
  }

  private transpose(d: number) {
    const app = this.app, clip = this.clip;
    if (!clip) return;
    const sel = this.roll.selectedNotes();
    const notes = sel.length ? sel : clip.notes;
    app.edit("Transpose", () => { for (const n of notes) n.pitch = Math.max(12, Math.min(108, n.pitch + d)); });
  }
}
