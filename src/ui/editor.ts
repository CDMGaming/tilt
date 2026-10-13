// Edit screen: piano roll on top, the track's instrument panel below.

import { DRUM_BASE_NOTE, INSTRUMENTS } from "../engine/instruments";
import { MAX_BARS, TICKS_PER_BAR, type Clip } from "../engine/model";
import { inScale, NOTE_NAMES, scaleById, snapToScale, stepInScale } from "../engine/music";
import { getParam, paramInfo } from "../engine/params";
import { fxDef } from "../engine/params";
import { drumCount, isDrumKind, toUnit } from "../engine/instruments";
import { addNote, duplicateClip, ensureClip, laneValue, noteAt, quantizeClip, setAutoPoint, setClipBars } from "../engine/songops";
import { mods, type Action } from "./actions";
import type { App, Screen } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
import type { MenuItem } from "./overlay";
import { SpatialNav } from "./nav";
import { buildPanel } from "./panels";
import { PianoRoll } from "./roll";

export class EditorScreen implements Screen {
  el = h("div", { class: "editor" });
  private roll: PianoRoll;
  private toolbar = h("div", { class: "ed-toolbar" });
  private rollWrap = h("div", { class: "roll-wrap" });
  private panelWrap = h("div", { class: "panel-wrap" });
  private nav = new SpatialNav(() => this.panelWrap);
  private heldKey: HTMLElement | null = null;

  constructor(private app: App) {
    this.roll = new PianoRoll(app, (x, y) => this.openMenu({ x, y }));
    this.rollWrap.appendChild(this.roll.canvas);
    this.el.append(this.toolbar, this.rollWrap, this.panelWrap);
    this.panelWrap.addEventListener("pointerdown", () => { if (app.ed.focus !== "panel") { app.ed.focus = "panel"; this.paintFocus(); } });
  }

  private get clip(): Clip | undefined { return this.app.track()?.clips[this.app.ed.sceneId]; }

  render() {
    const app = this.app, ed = app.ed, track = app.track();
    if (!track) return;
    const scene = app.song.scenes.find((s) => s.id === ed.sceneId);
    const clip = this.clip;
    const ti = app.song.tracks.indexOf(track);
    const si = app.song.scenes.indexOf(scene!);
    const btn = (label: string, on: boolean | null, onclick: () => void, title?: string) =>
      h("button", { class: "tb-btn" + (on ? " on" : ""), onclick, title }, label);
    this.toolbar.replaceChildren(
      h("button", { class: "tb-btn", onclick: () => app.show("song"), title: "Back to the song (B / Esc)" }, "◀ Song"),
      h("div", { class: "tb-track", style: `--track:${trackColor(track)}` },
        h("button", { class: "tb-arrow", onclick: () => this.switchTrack(-1) }, "‹"),
        h("span", { class: "tb-trackname" }, `${ti + 1} · ${INSTRUMENTS[track.kind].name}`),
        h("button", { class: "tb-arrow", onclick: () => this.switchTrack(1) }, "›")),
      h("div", { class: "tb-scene" },
        h("button", { class: "tb-arrow", onclick: () => this.switchScene(-1) }, "‹"),
        h("span", null, `${si + 1} · ${scene?.name ?? ""}`),
        h("button", { class: "tb-arrow", onclick: () => this.switchScene(1) }, "›")),
      h("div", { class: "tb-group" },
        h("span", { class: "tb-label" }, "Bars"),
        btn("−", null, () => this.setBars((clip?.bars ?? 1) - 1)),
        h("span", { class: "tb-value" }, String(clip?.bars ?? "—")),
        btn("+", null, () => this.setBars((clip?.bars ?? 1) + 1)),
        btn("Duplicate", null, () => this.duplicate(), "Double the clip, notes included (Ctrl+D)")),
      h("div", { class: "tb-group" },
        btn("1/8", ed.grid === 48, () => this.setGrid(48)),
        btn("1/16", ed.grid === 24, () => this.setGrid(24)),
        btn("3", ed.triplet, () => { ed.triplet = !ed.triplet; this.snapCursor(); this.render(); }, "Triplets")),
      h("div", { class: "tb-group" },
        btn("Velocity", ed.velView && !ed.autoKey, () => { ed.velView = !(ed.velView && !ed.autoKey); ed.autoKey = null; this.render(); }),
        btn(ed.autoKey ? `Auto: ${paramInfo(track, ed.autoKey)?.label ?? ed.autoKey} ▾` : "Automation ▾", !!ed.autoKey, () => this.lanePicker(), "Show an automation lane: draw volume, filter, FX... across the clip"),
        btn("Step", ed.stepInput, () => this.toggleStep(), "Step input: play notes while stopped, the cursor advances"),
        !isDrumKind(track.kind) ? btn(app.settings.scaleLock ? "Scale lock ●" : "Scale lock ○", app.settings.scaleLock, () => this.toggleLock()) : null,
        !isDrumKind(track.kind) ? btn("Hide out-of-key", app.settings.fold, () => this.toggleFold(), "Show only the notes of the song's scale") : null,
        btn("Quantize", null, () => this.quantize(), "Snap this clip's notes to the grid")),
      h("button", { class: "tb-btn menu-btn", onclick: () => this.openMenu() }, "☰ Menu"),
    );
    this.panelWrap.replaceChildren(buildPanel(app, track));
    app.markLearned(this.panelWrap, track.id);
    this.roll.invalidate();
    this.paintFocus();
  }

  private paintFocus() {
    const f = this.app.ed.focus;
    this.el.classList.toggle("focus-panel", f === "panel");
    this.el.classList.toggle("focus-roll", f === "roll");
    if (f === "panel") this.nav.paint(); else this.nav.clearPaint();
    this.roll.invalidate();
  }

  frame() { this.roll.frame(); }

  enter() { this.fitCursor(); }

  paramChanged(trackId: number, id: string) {
    if (trackId !== this.app.ed.trackId) return;
    const el = this.panelWrap.querySelector<HTMLElement & { redraw?: () => void }>(`[data-param="${id}"]`);
    el?.redraw?.();
    // Drum sound names and chord labels live outside the knob.
    if (/^p\dsmp$|^chord$|^spread$/.test(id)) this.render();
    if (id === "pos" || id === "table") this.panelWrap.querySelector<HTMLElement & { redraw?: () => void }>(".wt-view")?.redraw?.();
  }

  // ------------------------------------------------------------ navigation

  private switchTrack(d: number) {
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
    if (a.type === "focusSwap") { ed.focus = ed.focus === "roll" ? "panel" : "roll"; this.paintFocus(); return true; }
    if (a.type === "menu") { this.openMenu(); return true; }
    if (a.type === "shortcut") return false;
    if (ed.focus === "panel") return this.handlePanel(a);
    return this.handleRoll(a);
  }

  private handlePanel(a: Action): boolean {
    const app = this.app, track = app.track();
    if (!track) return false;
    const f = this.nav.focused;
    switch (a.type) {
      case "dir":
        if (!this.nav.move(a.dir) && a.dir === "up") { app.ed.focus = "roll"; this.paintFocus(); }
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
      case "back": app.ed.focus = "roll"; this.paintFocus(); return true;
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
            ed.placing = addNote(app.song, c, { pitch: ed.pitch, start: ed.tick, len: grid, vel: 100 }).id;
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
        app.show("song");
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
        { label: "Paste", disabled: !ed.clipboard.length, run: () => this.paste(), hint: "Ctrl+V" },
        { label: "Copy selection", disabled: !sel, run: () => this.copy(false), hint: "Ctrl+C" },
        { label: "Cut selection", disabled: !sel, run: () => this.copy(true), hint: "Ctrl+X" },
        { label: "Delete selection", disabled: !sel, run: () => this.handleRoll({ type: "delete" }) },
        { label: "Select all", run: () => { if (clip) ed.sel = new Set(clip.notes.map((n) => n.id)); this.roll.invalidate(); }, hint: "Ctrl+A" },
        { label: "Clip length", sub: () => Array.from({ length: MAX_BARS }, (_, i) => ({ label: `${i + 1} bar${i ? "s" : ""}`, checked: (clip?.bars ?? 1) === i + 1, run: () => this.setBars(i + 1) })) },
        { label: "Duplicate clip (x2)", run: () => this.duplicate(), hint: "Ctrl+D" },
        { label: "Grid", sub: () => [
          { label: "1/8", checked: ed.grid === 48, run: () => this.setGrid(48) },
          { label: "1/16", checked: ed.grid === 24, run: () => this.setGrid(24) },
          { label: "Triplets", checked: ed.triplet, run: () => { ed.triplet = !ed.triplet; this.snapCursor(); this.render(); } },
        ] },
        { label: "Velocity view", checked: ed.velView && !ed.autoKey, keepOpen: true, run: () => { ed.velView = !(ed.velView && !ed.autoKey); ed.autoKey = null; this.render(); } },
        { label: "Automation lane…", run: () => this.lanePicker() },
        { label: "Hide out-of-key rows", checked: app.settings.fold, keepOpen: true, disabled: isDrumKind(track.kind), run: () => this.toggleFold() },
        { label: "Step input", checked: ed.stepInput, keepOpen: true, run: () => this.toggleStep() },
        { label: "Scale lock", checked: app.settings.scaleLock, keepOpen: true, run: () => this.toggleLock() },
        { label: "Note preview", checked: app.settings.notePreview, keepOpen: true, run: () => { app.settings.notePreview = !app.settings.notePreview; app.saveSettings(); } },
        { label: "Count-in before recording", checked: app.settings.countIn, keepOpen: true, run: () => { app.settings.countIn = !app.settings.countIn; app.saveSettings(); } },
        { label: "Record quantize", checked: app.settings.recQuantize, keepOpen: true, run: () => { app.settings.recQuantize = !app.settings.recQuantize; app.saveSettings(); } },
        { label: "Quantize notes", run: () => this.quantize() },
        { label: "Transpose", disabled: isDrumKind(track.kind), sub: () => [12, 1, -1, -12].map((d) => ({ label: d > 0 ? `+${d}` : String(d), run: () => this.transpose(d) })) },
        { label: "Clear clip", disabled: !clip?.notes.length, run: () => app.edit("Clear clip", () => { clip!.notes = []; ed.sel.clear(); }) },
        { label: ed.autoKey ? `Clear lane: ${paramInfo(track, ed.autoKey)?.label ?? ed.autoKey}` : "Clear lane (open one first)", disabled: !ed.autoKey || !clip?.auto?.[ed.autoKey]?.length, run: () => app.edit("Clear lane", () => { delete clip!.auto![ed.autoKey!]; }) },
        { label: "Clear all automation in this clip", disabled: !Object.values(clip?.auto ?? {}).some((l) => l.length), run: () => app.edit("Clear automation", () => { clip!.auto = {}; }) },
        { label: app.learning ? "MIDI learn: finish" : "MIDI learn…", run: () => app.setLearning(!app.learning) },
        { label: "Undo", disabled: !app.history.canUndo, run: () => app.undo(), hint: app.history.undoLabel ?? "" },
        { label: "Redo", disabled: !app.history.canRedo, run: () => app.redo() },
        { label: "Undo history…", disabled: !app.history.canUndo, sub: () => app.history.labels().slice(0, 20).map((l, i) => ({ label: l, run: () => { for (let k = 0; k <= i; k++) app.undo(); } })) },
        { label: `Key: ${NOTE_NAMES[app.song.key]} ${scaleById(app.song.scale).name}`, disabled: true },
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
