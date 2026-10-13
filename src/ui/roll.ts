// Canvas piano roll for one clip. Out-of-scale rows are hatched (or hidden
// with "fold"), an optional bottom lane shows velocity or one automation
// lane, the cursor is driven by gamepad/keyboard and the mouse edits directly.

import { DRUM_BASE_NOTE, drumCount, drumPartName, formatParam, fromUnit, isDrumKind, toUnit } from "../engine/instruments";
import { getParam, paramInfo } from "../engine/params";
import { sampleLabel } from "./samples";
import { PPQ, TICKS_PER_BAR, type Clip, type Note, type Track } from "../engine/model";
import { inScale, noteName } from "../engine/music";
import { addNote, ensureClip, laneValue, noteAt, setAutoPoint } from "../engine/songops";
import type { App } from "./app";
import { trackColor } from "./theme";

const KEYS_W = 54;
const RULER_H = 22;
const VEL_H = 72;
const AUTO_H = 120;
const ROW_H = 15;

export class PianoRoll {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hatch: CanvasPattern | null = null;
  private dragRect: { t0: number; p0: number; t1: number; p1: number } | null = null;
  private dirty = true;
  private lastPlayTick = -1;

  constructor(private app: App, private onMenu: (x: number, y: number) => void) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "roll-canvas";
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // Pointer shape tells you what a drag will do: resize at a note's end, move on its body.
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.buttons) return;
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const { h } = this.size();
      let cursor = "crosshair";
      if (x < KEYS_W || y < RULER_H) cursor = "default";
      else if (y > h - this.bottomH()) cursor = this.app.ed.autoKey ? "crosshair" : "ns-resize";
      else {
        const clip = this.clip;
        const hit = clip ? noteAt(clip, this.tickAt(x), this.pitchAt(y)) : undefined;
        if (hit) cursor = this.nearEnd(hit, x) ? "ew-resize" : "grab";
      }
      this.canvas.style.cursor = cursor;
    });
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.isDrums()) return;
      const rows = this.allRows();
      const i = Math.max(0, Math.min(rows.length - this.visibleRows(), this.topIdx() + Math.sign(e.deltaY) * 2));
      this.app.ed.topPitch = rows[i];
      this.invalidate();
    }, { passive: false });
    new ResizeObserver(() => this.invalidate()).observe(this.canvas);
  }

  invalidate() { this.dirty = true; }

  // ------------------------------------------------------------ geometry

  private get track(): Track | undefined { return this.app.track(); }
  private get clip(): Clip | undefined { return this.track?.clips[this.app.ed.sceneId]; }
  isDrums() { return !!this.track && isDrumKind(this.track.kind); }
  private parts() { return this.track ? drumCount(this.track.kind) : 8; }
  clipTicks() { return (this.clip?.bars ?? 1) * TICKS_PER_BAR; }

  private size() {
    const r = this.canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** Height of the bottom lane (velocity or automation), 0 when hidden. */
  bottomH() { return this.app.ed.autoKey ? AUTO_H : this.app.ed.velView ? VEL_H : 0; }

  private laneH() {
    const { h } = this.size();
    return h - RULER_H - this.bottomH();
  }

  /** True when out-of-key rows are hidden. */
  folded() { return !this.isDrums() && this.app.settings.fold; }

  /** All rows top to bottom (pitches). Folded: only in-key pitches. */
  allRows(): number[] {
    if (this.isDrums()) return Array.from({ length: this.parts() }, (_, i) => DRUM_BASE_NOTE + this.parts() - 1 - i);
    const song = this.app.song, out: number[] = [];
    for (let p = 108; p >= 12; p--) if (!this.folded() || inScale(p, song.key, song.scale)) out.push(p);
    return out;
  }

  rowH() { return this.isDrums() ? Math.max(14, Math.min(60, this.laneH() / this.parts())) : ROW_H; }
  visibleRows() { return this.isDrums() ? this.parts() : Math.max(4, Math.floor(this.laneH() / ROW_H)); }

  /** Index (in allRows) of the top visible row. */
  private topIdx(): number {
    if (this.isDrums()) return 0;
    const rows = this.allRows(), top = this.app.ed.topPitch;
    const i = rows.findIndex((p) => p <= top);
    return Math.max(0, Math.min(rows.length - this.visibleRows(), i < 0 ? 0 : i));
  }

  private rowOf(pitch: number): number { return this.allRows().indexOf(pitch); }

  /** Keep the cursor row on screen. */
  scrollToCursor() {
    if (this.isDrums()) return;
    const ed = this.app.ed, rows = this.allRows(), vis = this.visibleRows();
    const r = rows.indexOf(ed.pitch);
    if (r < 0) return;
    let top = this.topIdx();
    if (r < top + 1) top = r - 2;
    if (r > top + vis - 2) top = r - vis + 3;
    ed.topPitch = rows[Math.max(0, Math.min(rows.length - vis, top))];
  }

  private pxPerTick() { return (this.size().w - KEYS_W) / this.clipTicks(); }
  private xOf(tick: number) { return KEYS_W + tick * this.pxPerTick(); }
  private yOf(pitch: number) { return RULER_H + (this.rowOf(pitch) - this.topIdx()) * this.rowH(); }
  private tickAt(x: number) { return (x - KEYS_W) / this.pxPerTick(); }
  private pitchAt(y: number) {
    const rows = this.allRows();
    return rows[Math.max(0, Math.min(rows.length - 1, this.topIdx() + Math.floor((y - RULER_H) / this.rowH())))];
  }

  // ------------------------------------------------------------ drawing

  frame() {
    const pos = this.app.engine.position();
    const playTick = pos && pos.sceneId === this.app.ed.sceneId ? pos.tick % this.clipTicks() : -1;
    if (playTick !== this.lastPlayTick) { this.lastPlayTick = playTick; this.dirty = true; }
    if (this.dirty) this.draw(playTick);
  }

  private draw(playTick: number) {
    this.dirty = false;
    const { w, h } = this.size();
    if (w < 10 || h < 10) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.hatch = null;
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.canvas);
    const col = (v: string) => css.getPropertyValue(v).trim();
    const app = this.app, ed = app.ed, song = app.song, track = this.track;
    if (!track) return;
    const drums = this.isDrums();
    const rowH = this.rowH(), allRows = this.allRows(), top = this.topIdx();
    const rows = Math.min(this.visibleRows(), allRows.length - top);
    const laneBottom = RULER_H + rows * rowH;
    const color = trackColor(track);
    if (!this.hatch) this.hatch = this.makeHatch(col("--roll-hatch"));

    g.fillStyle = col("--roll-bg");
    g.fillRect(0, 0, w, h);

    // rows
    for (let r = 0; r < rows; r++) {
      const pitch = allRows[top + r];
      const y = RULER_H + r * rowH;
      const black = [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);
      g.fillStyle = drums ? (r % 2 ? col("--roll-row2") : col("--roll-row")) : black ? col("--roll-row2") : col("--roll-row");
      g.fillRect(KEYS_W, y, w - KEYS_W, rowH);
      if (!drums && !inScale(pitch, song.key, song.scale)) {
        g.fillStyle = this.hatch!;
        g.fillRect(KEYS_W, y, w - KEYS_W, rowH);
      }
      if (!drums && (((pitch - song.key) % 12) + 12) % 12 === 0) {
        g.fillStyle = col("--roll-root");
        g.fillRect(KEYS_W, y, w - KEYS_W, rowH);
      }
      // key column
      g.fillStyle = drums ? col("--roll-keys") : black ? col("--roll-key-black") : col("--roll-key-white");
      g.fillRect(0, y, KEYS_W - 2, rowH - 1);
      g.fillStyle = drums || black ? col("--ink") : col("--roll-key-ink");
      g.font = `${Math.min(12, rowH - 3)}px system-ui`;
      g.textBaseline = "middle";
      if (drums) {
        const part = pitch - DRUM_BASE_NOTE;
        g.fillText(track.kind === "sampler" ? sampleLabel(track.samples?.[part], track.sampleNames, part) : drumPartName(track.params, part, track.kind), 6, y + rowH / 2 - (rowH > 26 ? 6 : 0));
        if (rowH > 26) { g.fillStyle = col("--dim"); g.font = "10px system-ui"; g.fillText(`pad ${part + 1}`, 6, y + rowH / 2 + 8); }
      } else if ((((pitch % 12) + 12) % 12) === 0 || rowH >= 15) {
        g.fillText(noteName(pitch), 6, y + rowH / 2);
      }
    }

    // grid
    const grid = app.grid(), ct = this.clipTicks();
    for (let t = 0; t <= ct; t += grid) {
      const x = Math.round(this.xOf(t)) + 0.5;
      g.strokeStyle = t % TICKS_PER_BAR === 0 ? col("--roll-bar") : t % PPQ === 0 ? col("--roll-beat") : col("--roll-grid");
      g.lineWidth = t % TICKS_PER_BAR === 0 ? 1.5 : 1;
      g.beginPath(); g.moveTo(x, RULER_H); g.lineTo(x, laneBottom); g.stroke();
    }
    // ruler
    g.fillStyle = col("--panel");
    g.fillRect(0, 0, w, RULER_H);
    g.fillStyle = col("--dim");
    g.font = "11px system-ui";
    for (let b = 0; b < ct / TICKS_PER_BAR; b++) g.fillText(String(b + 1), this.xOf(b * TICKS_PER_BAR) + 4, RULER_H / 2);
    g.fillText(ed.velView ? "vel" : "", 6, RULER_H / 2);

    // step-input position
    if (ed.stepInput && !app.engine.playing) {
      g.fillStyle = col("--ok");
      g.globalAlpha = 0.25;
      g.fillRect(this.xOf(ed.stepTick), RULER_H, Math.max(2, grid * this.pxPerTick()), laneBottom - RULER_H);
      g.globalAlpha = 1;
    }

    // notes
    const clip = this.clip;
    if (clip) {
      for (const n of clip.notes) {
        const r = this.rowOf(n.pitch) - top;
        if (r < 0 || r >= rows) continue; // off screen, or hidden by fold
        const x = this.xOf(n.start), y = this.yOf(n.pitch);
        const nw = Math.max(3, n.len * this.pxPerTick() - 1);
        const sounding = playTick >= n.start && playTick < n.start + n.len;
        g.globalAlpha = sounding ? 1 : 0.45 + 0.55 * (n.vel / 127);
        g.fillStyle = color;
        if (sounding) { g.shadowColor = color; g.shadowBlur = 10; }
        roundRect(g, x + 1, y + 1, nw - 1, rowH - 2, 3);
        g.fill();
        g.shadowBlur = 0;
        if (sounding) { g.globalAlpha = 0.35; g.fillStyle = "#fff"; roundRect(g, x + 1, y + 1, nw - 1, Math.max(2, (rowH - 2) * 0.35), 3); g.fill(); }
        g.globalAlpha = 1;
        if (ed.sel.has(n.id)) { g.strokeStyle = "#fff"; g.lineWidth = 2; roundRect(g, x + 1, y + 1, nw - 1, rowH - 2, 3); g.stroke(); }
        // the part that hangs past the clip end (it wraps when looping)
        if (n.start + n.len > ct) { g.fillStyle = color; g.globalAlpha = 0.25; g.fillRect(KEYS_W, y + 2, (n.start + n.len - ct) * this.pxPerTick(), rowH - 4); g.globalAlpha = 1; }
      }
    }

    // range selection rectangle
    const sr = this.dragRect ?? (ed.selAnchor && app.ed.focus === "roll" ? { t0: ed.selAnchor.tick, p0: ed.selAnchor.pitch, t1: ed.tick + grid, p1: ed.pitch } : null);
    if (sr) {
      const x0 = this.xOf(Math.min(sr.t0, sr.t1)), x1 = this.xOf(Math.max(sr.t0, sr.t1));
      const y0 = this.yOf(Math.max(sr.p0, sr.p1)), y1 = this.yOf(Math.min(sr.p0, sr.p1)) + rowH;
      g.fillStyle = col("--sel-fill");
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = col("--accent");
      g.setLineDash([4, 3]);
      g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      g.setLineDash([]);
    }

    // cursor
    const cr = this.rowOf(ed.pitch) - top;
    if (cr >= 0 && cr < rows) {
      const under = clip ? noteAt(clip, ed.tick, ed.pitch) : undefined;
      const cx = this.xOf(under && ed.placing === under.id ? under.start : ed.tick);
      const cw = (under && ed.placing === under.id ? under.len : grid) * this.pxPerTick();
      g.strokeStyle = ed.focus === "roll" ? col("--accent") : col("--dim");
      g.lineWidth = ed.focus === "roll" ? 2.5 : 1;
      g.strokeRect(cx + 1, this.yOf(ed.pitch) + 1, Math.max(4, cw - 2), rowH - 2);
    }

    // playhead
    if (playTick >= 0) {
      const x = Math.round(this.xOf(playTick)) + 0.5;
      g.strokeStyle = app.recording ? col("--rec") : col("--ink");
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, laneBottom); g.stroke();
    }

    if (ed.autoKey) this.drawAuto(g, col, w, h, color);

    // velocity lane
    if (ed.velView && !ed.autoKey) {
      const y0 = h - VEL_H;
      g.fillStyle = col("--panel");
      g.fillRect(0, y0, w, VEL_H);
      g.fillStyle = col("--dim");
      g.font = "11px system-ui";
      g.fillText("Velocity", 6, y0 + 12);
      if (clip) for (const n of clip.notes) {
        const x = this.xOf(n.start);
        const bh = (VEL_H - 10) * (n.vel / 127);
        g.fillStyle = ed.sel.has(n.id) || (n.pitch === ed.pitch && n.start <= ed.tick && ed.tick < n.start + n.len) ? "#fff" : color;
        g.fillRect(x + 1, h - 4 - bh, 4, bh);
        g.fillRect(x - 1, h - 4 - bh, 8, 2);
      }
    }
  }

  private drawAuto(g: CanvasRenderingContext2D, col: (v: string) => string, w: number, h: number, color: string) {
    const app = this.app, ed = app.ed, track = this.track!, key = ed.autoKey!;
    const def = paramInfo(track, key);
    const y0 = h - AUTO_H, top = y0 + 18, bot = h - 6;
    const yOfV = (v: number) => bot - v * (bot - top);
    g.fillStyle = col("--panel");
    g.fillRect(0, y0, w, AUTO_H);
    // bar lines
    for (let t = 0; t <= this.clipTicks(); t += PPQ) {
      g.strokeStyle = t % TICKS_PER_BAR === 0 ? col("--roll-bar") : col("--roll-grid");
      const x = Math.round(this.xOf(t)) + 0.5;
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
    }
    const lane = this.clip?.auto?.[key] ?? [];
    const curV = lane.length ? laneValue(lane, ed.tick) : def ? toUnit(def, getParam(track, key)) : 0;
    g.fillStyle = col("--dim");
    g.font = "11px system-ui";
    g.fillText(`${def?.label ?? key}${def ? "  " + formatParam(def, fromUnit(def, curV)) : ""}`, 6, y0 + 11);
    if (!lane.length) {
      g.strokeStyle = col("--dim");
      g.setLineDash([4, 4]);
      const y = yOfV(curV);
      g.beginPath(); g.moveTo(KEYS_W, y); g.lineTo(w, y); g.stroke();
      g.setLineDash([]);
      g.fillText("draw here, or turn the knob while recording", KEYS_W + 8, y - 6);
    } else {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = KEYS_W; x <= w; x += 2) {
        const y = yOfV(laneValue(lane, this.tickAt(x)));
        if (x === KEYS_W) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = color;
      for (const p of lane) { g.beginPath(); g.arc(this.xOf(p.tick), yOfV(p.v), 3.5, 0, Math.PI * 2); g.fill(); }
    }
    // cursor column
    g.strokeStyle = ed.focus === "roll" ? col("--accent") : col("--dim");
    g.strokeRect(this.xOf(ed.tick) + 0.5, top, Math.max(3, app.grid() * this.pxPerTick()), bot - top);
  }

  private makeHatch(color: string): CanvasPattern | null {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const g = c.getContext("2d")!;
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 8); g.lineTo(8, 0);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(6, 10); g.lineTo(10, 6);
    g.stroke();
    return this.ctx.createPattern(c, "repeat");
  }

  // ------------------------------------------------------------ mouse

  private pointerDown(e: PointerEvent) {
    const app = this.app, ed = app.ed;
    const track = this.track;
    if (!track) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    ed.focus = "roll";
    if (x < KEYS_W || y < RULER_H) {
      // Key column: audition the row.
      if (x < KEYS_W && y >= RULER_H) app.engine.preview(track.id, this.pitchAt(y));
      return;
    }
    const { h } = this.size();
    if (ed.autoKey && y > h - AUTO_H) { this.autoDrag(e, x, y); return; }
    if (ed.velView && !ed.autoKey && y > h - VEL_H) { this.velDrag(e, x); return; }
    const grid = app.grid();
    const rawTick = Math.max(0, Math.min(this.clipTicks() - 1, this.tickAt(x)));
    let pitch = this.pitchAt(y);
    if (this.isDrums()) pitch = Math.max(DRUM_BASE_NOTE, Math.min(DRUM_BASE_NOTE + this.parts() - 1, pitch));
    const clip = this.clip;
    const hit = clip ? noteAt(clip, rawTick, pitch) : undefined;
    ed.tick = Math.floor(rawTick / grid) * grid;
    ed.pitch = pitch;

    if (e.button === 2) {
      if (hit) app.edit("Delete note", () => { clip!.notes = clip!.notes.filter((n) => n !== hit); ed.sel.delete(hit.id); });
      else this.onMenu(e.clientX, e.clientY);
      return;
    }
    if (app.locked) { app.overlays.toast("Time's up. Editing is locked."); return; }
    this.canvas.setPointerCapture(e.pointerId);

    if (e.shiftKey && !hit) {
      // Rubber-band selection.
      this.dragRect = { t0: rawTick, p0: pitch, t1: rawTick, p1: pitch };
      this.track$(e, (tx, py) => { this.dragRect!.t1 = tx; this.dragRect!.p1 = py; this.invalidate(); }, () => {
        const d = this.dragRect!;
        this.dragRect = null;
        this.selectRange(d.t0, d.t1, d.p0, d.p1, false);
      });
      return;
    }
    if (e.shiftKey && hit) {
      if (ed.sel.has(hit.id)) ed.sel.delete(hit.id); else ed.sel.add(hit.id);
      this.invalidate();
      return;
    }

    if (hit) {
      const nearEnd = this.nearEnd(hit, x);
      app.history.push(app.song, nearEnd ? "Resize note" : "Move note");
      const group = ed.sel.has(hit.id) ? clip!.notes.filter((n) => ed.sel.has(n.id)) : [hit];
      const orig = group.map((n) => ({ n, start: n.start, pitch: n.pitch, len: n.len }));
      let moved = false;
      this.track$(e, (tx, py) => {
        if (nearEnd) {
          const end = Math.max(hit.start + grid / 4, Math.round(tx / grid) * grid);
          hit.len = Math.max(grid / 4, end - hit.start);
          moved = true;
        } else {
          const dt = Math.round((tx - rawTick) / grid) * grid;
          const dp = this.isDrums() ? py - pitch : py - pitch;
          if (dt || dp) moved = true;
          for (const o of orig) {
            o.n.start = Math.max(0, Math.min(this.clipTicks() - grid / 4, o.start + dt));
            const np = this.clampPitch(o.pitch + dp);
            if (np !== o.n.pitch && app.settings.notePreview && o.n === hit) app.engine.preview(track.id, np, hit.vel, 0.12);
            o.n.pitch = np;
          }
        }
        app.changed(false);
        this.invalidate();
      }, () => {
        if (!moved) {
          // A click without dragging deletes the note (touch-style editing).
          clip!.notes = clip!.notes.filter((n) => n !== hit);
          ed.sel.delete(hit.id);
        } else clip!.notes.sort((a, b) => a.start - b.start);
        app.changed();
      });
      return;
    }

    // Empty spot: add a note, drag to set its length.
    if (!this.isDrums() && app.settings.scaleLock && !inScale(pitch, app.song.key, app.song.scale)) {
      app.overlays.toast("Scale lock: that row is out of key (toggle lock in the menu)", 1200);
      return;
    }
    app.history.push(app.song, "Add note");
    const c = ensureClip(app.song, track, ed.sceneId);
    const note = addNote(app.song, c, { pitch, start: ed.tick, len: grid, vel: 100 });
    ed.sel.clear();
    if (app.settings.notePreview) app.engine.preview(track.id, pitch);
    app.changed(false);
    this.track$(e, (tx) => {
      note.len = Math.max(grid, Math.ceil((tx - note.start) / grid) * grid);
      app.changed(false);
      this.invalidate();
    }, () => app.changed());
  }

  private velDrag(e: PointerEvent, x: number) {
    const clip = this.clip;
    if (!clip || this.app.locked) return;
    const app = this.app;
    const tick = this.tickAt(x);
    const cand = clip.notes.filter((n) => Math.abs(this.xOf(n.start) - x) < 8 || (tick >= n.start && tick < n.start + n.len));
    if (!cand.length) return;
    const targets = cand.some((n) => app.ed.sel.has(n.id)) ? clip.notes.filter((n) => app.ed.sel.has(n.id)) : [cand[0]];
    app.history.push(app.song, "Velocity");
    this.canvas.setPointerCapture(e.pointerId);
    const set = (cy: number) => {
      const r = this.canvas.getBoundingClientRect();
      const v = Math.round(127 * (1 - (cy - r.top - (r.height - VEL_H + 6)) / (VEL_H - 10)));
      for (const n of targets) n.vel = Math.max(1, Math.min(127, v));
      app.changed(false);
      this.invalidate();
    };
    set(e.clientY);
    this.track$(e, (_t, _p, cy) => set(cy), () => app.changed());
  }

  /** Draw automation with the mouse: drag paints a point on every grid step crossed; right-click deletes a point. */
  private autoDrag(e: PointerEvent, x: number, y: number) {
    const app = this.app, track = this.track, key = app.ed.autoKey;
    if (!track || !key || app.locked) return;
    const { h } = this.size();
    const top = h - AUTO_H + 18, bot = h - 6;
    const vAt = (cy: number) => Math.max(0, Math.min(1, (bot - cy) / (bot - top)));
    const grid = app.grid();
    const clip = ensureClip(app.song, track, app.ed.sceneId);
    const ticks = this.clipTicks();
    if (e.button === 2) {
      const lane = clip.auto?.[key];
      if (!lane) return;
      const near = lane.findIndex((p) => Math.abs(this.xOf(p.tick) - x) < 9);
      if (near >= 0) app.edit("Delete point", () => lane.splice(near, 1));
      return;
    }
    app.history.push(app.song, "Draw automation");
    this.canvas.setPointerCapture(e.pointerId);
    let last = -1, lastV = 0;
    const paint = (cx: number, cy: number) => {
      const r = this.canvas.getBoundingClientRect();
      const tick = Math.max(0, Math.min(ticks - grid, Math.round(this.tickAt(cx - r.left) / grid) * grid));
      const v = vAt(cy - r.top);
      if (last >= 0 && tick !== last) {
        // Fill skipped steps so fast drags leave no gaps.
        const dir = tick > last ? grid : -grid;
        for (let t = last + dir; t !== tick; t += dir) setAutoPoint(clip, key, t, lastV + ((v - lastV) * (t - last)) / (tick - last));
      }
      setAutoPoint(clip, key, tick, v);
      last = tick; lastV = v;
      app.ed.tick = tick;
      app.changed(false);
      this.invalidate();
    };
    const r = this.canvas.getBoundingClientRect();
    paint(x + r.left, y + r.top);
    this.track$(e, (_t, _p, cy) => paint(this.lastX, cy), () => app.changed());
  }

  private lastX = 0;

  /** Pointer-drag helper: calls move(tick, pitch, clientY) until release. */
  private track$(e: PointerEvent, move: (tick: number, pitch: number, cy: number) => void, end: () => void) {
    const c = this.canvas;
    const onMove = (ev: PointerEvent) => {
      this.lastX = ev.clientX;
      const r = c.getBoundingClientRect();
      move(this.tickAt(ev.clientX - r.left), this.pitchAt(ev.clientY - r.top), ev.clientY);
    };
    const onUp = () => {
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
      end();
      this.invalidate();
    };
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    void e;
  }

  /** The right-hand grab zone of a note: up to 10 px, never more than a third of the note. */
  private nearEnd(n: Note, x: number): boolean {
    const end = this.xOf(n.start + n.len);
    const w = end - this.xOf(n.start);
    return x > end - Math.min(10, Math.max(4, w / 3));
  }

  clampPitch(p: number) {
    return this.isDrums() ? Math.max(DRUM_BASE_NOTE, Math.min(DRUM_BASE_NOTE + this.parts() - 1, p)) : Math.max(12, Math.min(108, p));
  }

  selectRange(t0: number, t1: number, p0: number, p1: number, add: boolean) {
    const ed = this.app.ed, clip = this.clip;
    if (!add) ed.sel.clear();
    if (!clip) return;
    const [ta, tb] = [Math.min(t0, t1), Math.max(t0, t1)];
    const [pa, pb] = [Math.min(p0, p1), Math.max(p0, p1)];
    for (const n of clip.notes) if (n.start + n.len > ta && n.start < tb && n.pitch >= pa && n.pitch <= pb) ed.sel.add(n.id);
    this.invalidate();
  }

  selectedNotes(): Note[] {
    const clip = this.clip;
    return clip ? clip.notes.filter((n) => this.app.ed.sel.has(n.id)) : [];
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
