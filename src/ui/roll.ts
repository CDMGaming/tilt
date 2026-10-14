// Canvas piano roll for one clip. In-key rows are light and full height; out-of-key
// rows are darker, hatched and shorter (the scale reads like a ladder), or hidden
// with "fold"; root rows carry the track colour. An optional bottom lane shows
// velocity or one automation lane, the cursor is driven by gamepad/keyboard and
// the mouse edits directly.

import { isPhone } from "./phone";
import { DRUM_BASE_NOTE, drumCount, drumPartName, formatParam, fromUnit, isDrumKind, toUnit } from "../engine/instruments";
import { getParam, paramInfo } from "../engine/params";
import { sampleLabel } from "./samples";
import { PPQ, TICKS_PER_BAR, type Clip, type Note, type Track } from "../engine/model";
import { inScale, noteName, scaleDegree } from "../engine/music";
import { addNote, ensureClip, laneValue, noteAt, setAutoPoint } from "../engine/songops";
import type { App } from "./app";
import { trackColor } from "./theme";

const KEYS_W = 54;
const RULER_H = 22;
const VEL_H = 72;
const AUTO_H = 120;
const ROW_H = 15;
/** Note rows: a fingertip needs more height than a mouse pointer. */
const rowPx = () => (isPhone() ? 24 : ROW_H);
/** Out-of-key rows are this much of an in-key row's height. */
const OUT_ROW = 0.6;

export class PianoRoll {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hatch: CanvasPattern | null = null;
  private stripes: CanvasPattern | null = null;
  private dragRect: { t0: number; p0: number; t1: number; p1: number } | null = null;
  private dirty = true;
  private lastPlayTick = -1;

  constructor(private app: App, private onMenu: (x: number, y: number) => void) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "roll-canvas";
    this.ctx = this.canvas.getContext("2d")!;
    // Touch first: two fingers scroll and pinch-zoom, one finger edits as a mouse does.
    for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) {
      this.canvas.addEventListener(t, (e) => this.touchLayer(e), { capture: true });
    }
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
      if (e.ctrlKey) {
        const r = this.canvas.getBoundingClientRect();
        this.zoom(e.deltaY < 0 ? 1 : -1, this.tickAt(e.clientX - r.left));
        return;
      }
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const d = Math.sign(e.shiftKey ? e.deltaY : e.deltaX);
        this.app.ed.scrollTick = this.clampScroll(this.scroll() + d * PPQ);
        this.invalidate();
        return;
      }
      if (this.isDrums()) return;
      const rows = this.allRows();
      const i = Math.max(0, Math.min(this.maxTop(), this.topIdx() + Math.sign(e.deltaY) * 2));
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

  private rowsMemo = { key: "", rows: [] as number[] };
  /** All rows top to bottom (pitches). Folded: only in-key pitches. */
  allRows(): number[] {
    const song = this.app.song, drums = this.isDrums();
    const memo = `${drums ? `d${this.parts()}` : "n"}|${song.key}|${song.scale}|${this.folded()}`;
    if (memo === this.rowsMemo.key) return this.rowsMemo.rows;
    let out: number[];
    if (drums) out = Array.from({ length: this.parts() }, (_, i) => DRUM_BASE_NOTE + this.parts() - 1 - i);
    else { out = []; for (let p = 108; p >= 12; p--) if (!this.folded() || inScale(p, song.key, song.scale)) out.push(p); }
    this.rowsMemo = { key: memo, rows: out };
    return out;
  }

  private inKey(pitch: number) { return inScale(pitch, this.app.song.key, this.app.song.scale); }

  /** An in-key row's height (drums: one pad's row). */
  rowH() { return this.isDrums() ? Math.max(14, Math.min(60, this.laneH() / this.parts())) : rowPx(); }
  /** This pitch's row height: out-of-key rows are shorter unless they're folded away. */
  private hOf(pitch: number) { return this.isDrums() || this.inKey(pitch) ? this.rowH() : Math.round(rowPx() * OUT_ROW); }

  /** How many rows fit in the lane starting at row `top`. */
  private fitFrom(top: number): number {
    const rows = this.allRows(), lane = this.laneH();
    let y = 0, n = 0;
    for (let i = top; i < rows.length; i++) { const hh = this.hOf(rows[i]); if (y + hh > lane + 0.5) break; y += hh; n++; }
    return Math.max(1, n);
  }
  /** The lowest top row that still fills the lane down to the last row. */
  private maxTop(): number {
    if (this.isDrums()) return 0;
    const rows = this.allRows(), lane = this.laneH();
    let y = 0;
    for (let i = rows.length - 1; i >= 0; i--) { y += this.hOf(rows[i]); if (y > lane) return Math.min(rows.length - 1, i + 1); }
    return 0;
  }
  visibleRows() { return this.isDrums() ? this.parts() : this.fitFrom(this.topIdx()); }

  /** Index (in allRows) of the top visible row. */
  private topIdx(): number {
    if (this.isDrums()) return 0;
    const rows = this.allRows(), top = this.app.ed.topPitch;
    const i = rows.findIndex((p) => p <= top);
    return Math.max(0, Math.min(this.maxTop(), i < 0 ? 0 : i));
  }

  private rowOf(pitch: number): number { return this.allRows().indexOf(pitch); }

  /** Keep the cursor row on screen. */
  scrollToCursor() {
    this.scrollToTick(this.app.ed.tick);
    this.lastNav = performance.now();
    if (this.isDrums()) return;
    const ed = this.app.ed, rows = this.allRows(), max = this.maxTop();
    const r = rows.indexOf(ed.pitch);
    if (r < 0) return;
    let top = this.topIdx();
    if (r < top + 1) top = r - 2;
    while (top < max && r > top + this.fitFrom(top) - 3) top++;
    ed.topPitch = rows[Math.max(0, Math.min(max, top))];
  }

  // ---- horizontal zoom: a window of `viewTicks` starting at `scroll`
  static readonly ZOOMS = [0, 4, 2, 1]; // bars visible; 0 = the whole clip
  viewTicks() { const ct = this.clipTicks(), vb = this.app.ed.viewBars; return vb ? Math.min(ct, vb * TICKS_PER_BAR) : ct; }
  private clampScroll(t: number) { return Math.max(0, Math.min(this.clipTicks() - this.viewTicks(), t)); }
  scroll() { return this.clampScroll(this.app.ed.scrollTick); }
  zoomed() { return this.viewTicks() < this.clipTicks(); }

  /** Zoom in (+1) or out (-1), keeping `anchor` (a tick) where it is on screen. */
  zoom(dir: 1 | -1, anchor = this.app.ed.tick) {
    const ed = this.app.ed, levels = PianoRoll.ZOOMS;
    const bars = this.viewTicks() / TICKS_PER_BAR;
    const next = dir > 0 ? levels.find((z) => z > 0 && z < bars) : [...levels].reverse().find((z) => z === 0 || z > bars) ?? 0;
    if (next === undefined) return;
    const before = (anchor - this.scroll()) / this.viewTicks();
    ed.viewBars = next;
    ed.scrollTick = this.clampScroll(Math.round((anchor - before * this.viewTicks()) / PPQ) * PPQ);
    this.invalidate();
    const label = (this.canvas.closest(".editor") ?? document).querySelector(".zoom-value");
    if (label) label.textContent = this.zoomLabel();
  }

  zoomLabel() { return this.zoomed() ? `${this.viewTicks() / TICKS_PER_BAR} bar${this.viewTicks() > TICKS_PER_BAR ? "s" : ""}` : "Fit"; }

  /** Scroll so `tick` (and one grid step after it) is visible, moving a bar at a time. */
  scrollToTick(tick: number) {
    if (!this.zoomed()) return;
    const ed = this.app.ed, vt = this.viewTicks(), s = this.scroll(), g = this.app.grid();
    if (tick < s) ed.scrollTick = Math.floor(tick / TICKS_PER_BAR) * TICKS_PER_BAR;
    else if (tick + g > s + vt) ed.scrollTick = Math.ceil((tick + g - vt) / TICKS_PER_BAR) * TICKS_PER_BAR;
    ed.scrollTick = this.clampScroll(ed.scrollTick);
  }

  private lastNav = 0;
  private pxPerTick() { return (this.size().w - KEYS_W) / this.viewTicks(); }
  private xOf(tick: number) { return KEYS_W + (tick - this.scroll()) * this.pxPerTick(); }
  private yOf(pitch: number) {
    const rows = this.allRows(), top = this.topIdx(), i = rows.indexOf(pitch);
    let y = RULER_H;
    if (i >= top) for (let k = top; k < i; k++) y += this.hOf(rows[k]);
    else for (let k = i; k < top; k++) y -= this.hOf(rows[k]);
    return y;
  }
  private tickAt(x: number) { return (x - KEYS_W) / this.pxPerTick() + this.scroll(); }

  /** Clip drawing to the note area (right of the key column), between y0 and y1. */
  private clipTo(g: CanvasRenderingContext2D, y0: number, y1: number) {
    g.save();
    g.beginPath();
    g.rect(KEYS_W, y0, this.size().w - KEYS_W, y1 - y0);
    g.clip();
  }
  private pitchAt(y: number) {
    const rows = this.allRows(), top = this.topIdx();
    let yy = RULER_H;
    if (y < yy) return rows[top];
    for (let i = top; i < rows.length; i++) { const hh = this.hOf(rows[i]); if (y < yy + hh) return rows[i]; yy += hh; }
    return rows[rows.length - 1];
  }

  // ------------------------------------------------------------ drawing

  frame() {
    const pos = this.app.engine.position();
    const playTick = pos && pos.sceneId === this.app.ed.sceneId ? pos.tick % this.clipTicks() : -1;
    if (playTick !== this.lastPlayTick) { this.lastPlayTick = playTick; this.dirty = true; }
    if (this.app.rollGhosts) this.dirty = true; // the outlines pulse
    if (playTick >= 0 && this.zoomed() && (this.app.recording || performance.now() - this.lastNav > 3000)) {
      const vt = this.viewTicks(), s = this.scroll();
      if (playTick < s || playTick >= s + vt) { this.app.ed.scrollTick = this.clampScroll(Math.floor(playTick / vt) * vt); this.dirty = true; }
    }
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
      this.stripes = null;
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
    let laneBottom = RULER_H;
    for (let r = 0; r < rows; r++) laneBottom += this.hOf(allRows[top + r]);
    const color = trackColor(track);
    if (!this.hatch) this.hatch = this.makeHatch(col("--roll-hatch"), 6, 1.5);
    if (!this.stripes) this.stripes = this.makeHatch("#00000066", 5, 2);

    g.fillStyle = col("--roll-bg");
    g.fillRect(0, 0, w, h);

    // rows: in-key light and full height, out-of-key dark, hatched and short, the root tinted
    g.textBaseline = "middle";
    for (let r = 0, y = RULER_H; r < rows; r++) {
      const pitch = allRows[top + r], hh = this.hOf(pitch);
      if (drums) {
        g.fillStyle = r % 2 ? col("--roll-row2") : col("--roll-row");
        g.fillRect(KEYS_W, y, w - KEYS_W, hh);
        g.fillStyle = col("--roll-keys");
        g.fillRect(0, y, KEYS_W - 2, hh - 1);
        g.fillStyle = col("--ink");
        g.font = `${Math.min(12, hh - 3)}px system-ui`;
        const part = pitch - DRUM_BASE_NOTE;
        g.fillText(track.kind === "sampler" ? sampleLabel(track.samples?.[part], track.sampleNames, part) : drumPartName(track.params, part, track.kind), 6, y + hh / 2 - (hh > 26 ? 6 : 0));
        if (hh > 26) { g.fillStyle = col("--dim"); g.font = "10px system-ui"; g.fillText(`pad ${part + 1}`, 6, y + hh / 2 + 8); }
        y += hh;
        continue;
      }
      const deg = scaleDegree(pitch, song.key, song.scale), root = deg === 1;
      // A 1 px gap of background between rows makes the ladder.
      g.fillStyle = deg ? col("--roll-inkey") : col("--roll-outkey");
      g.fillRect(KEYS_W, y, w - KEYS_W, hh - 1);
      if (!deg) { g.fillStyle = this.hatch!; g.fillRect(KEYS_W, y, w - KEYS_W, hh - 1); }
      if (root) {
        g.globalAlpha = 0.16; g.fillStyle = color; g.fillRect(KEYS_W, y, w - KEYS_W, hh - 1);
        g.globalAlpha = 0.85; g.fillRect(0, y, w, 1); g.globalAlpha = 1; // the thin line above the root
      }
      // key column: in-key names bright (the root bold, with its degree), out-of-key dim
      g.fillStyle = deg ? col("--roll-key-in") : col("--roll-key-out");
      g.fillRect(0, y + (root ? 1 : 0), KEYS_W - 2, hh - 1 - (root ? 1 : 0));
      if (root) { g.fillStyle = color; g.fillRect(0, y + 1, 3, hh - 2); }
      const fs = Math.min(12, hh - 2);
      if (fs >= 7) {
        g.font = `${root ? "700 " : ""}${fs}px system-ui`;
        g.fillStyle = root ? col("--roll-key-root-ink") : deg ? col("--roll-key-in-ink") : col("--roll-key-out-ink");
        g.fillText(noteName(pitch), 6, y + hh / 2);
        if (deg && hh >= 12) {
          g.font = `${root ? "700 " : ""}${Math.min(10, fs - 1)}px system-ui`;
          g.textAlign = "right";
          g.fillStyle = root ? color : col("--roll-key-deg");
          g.fillText(String(deg), KEYS_W - 6, y + hh / 2);
          g.textAlign = "left";
        }
      }
      y += hh;
    }

    // grid
    const grid = app.grid(), ct = this.clipTicks();
    this.clipTo(g, 0, laneBottom);
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
    if (this.zoomed()) {
      // Overview: where the visible window sits in the whole clip (click the ruler to jump).
      const ow = w - KEYS_W, s = this.scroll();
      g.fillStyle = col("--well");
      g.fillRect(KEYS_W, RULER_H - 4, ow, 3);
      g.fillStyle = col("--accent");
      g.fillRect(KEYS_W + (s / ct) * ow, RULER_H - 4, (this.viewTicks() / ct) * ow, 3);
    }

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
        const x = this.xOf(n.start), y = this.yOf(n.pitch), nh = this.hOf(n.pitch);
        const nw = Math.max(3, n.len * this.pxPerTick() - 1);
        const sounding = playTick >= n.start && playTick < n.start + n.len;
        const off = !drums && !this.inKey(n.pitch); // out of key: stripes and a dashed warning outline
        g.globalAlpha = sounding ? 1 : 0.45 + 0.55 * (n.vel / 127);
        g.fillStyle = color;
        if (sounding) { g.shadowColor = color; g.shadowBlur = 10; }
        roundRect(g, x + 1, y + 1, nw - 1, nh - 2, 3);
        g.fill();
        g.shadowBlur = 0;
        if (off) { g.globalAlpha = 1; g.fillStyle = this.stripes!; roundRect(g, x + 1, y + 1, nw - 1, nh - 2, 3); g.fill(); }
        if (sounding) { g.globalAlpha = 0.35; g.fillStyle = "#fff"; roundRect(g, x + 1, y + 1, nw - 1, Math.max(2, (nh - 2) * 0.35), 3); g.fill(); }
        g.globalAlpha = 1;
        if (off) { g.strokeStyle = col("--roll-warn"); g.lineWidth = 1.5; g.setLineDash([3, 2]); roundRect(g, x + 0.5, y + 0.5, nw, nh - 1, 3); g.stroke(); g.setLineDash([]); }
        if (ed.sel.has(n.id)) { g.strokeStyle = "#fff"; g.lineWidth = 2; roundRect(g, x + 1, y + 1, nw - 1, nh - 2, 3); g.stroke(); }
        // the part that hangs past the clip end (it wraps when looping)
        if (n.start + n.len > ct) { g.fillStyle = color; g.globalAlpha = 0.25; g.fillRect(this.xOf(0), y + 2, (n.start + n.len - ct) * this.pxPerTick(), nh - 4); g.globalAlpha = 1; }
      }
    }

    // Outlines where notes should go (the tutorial), pulsing until a note fills them.
    const gh = app.rollGhosts;
    if (gh && gh.trackId === track.id && gh.sceneId === ed.sceneId) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
      g.save();
      g.setLineDash([4, 3]);
      g.lineWidth = 2;
      g.strokeStyle = color;
      for (const n of gh.notes) {
        if (clip?.notes.some((x) => x.pitch === n.pitch && x.start === n.start)) continue;
        const r = this.rowOf(n.pitch) - top;
        if (r < 0 || r >= rows) continue;
        const x = this.xOf(n.start), y = this.yOf(n.pitch), nw = Math.max(8, n.len * this.pxPerTick() - 1);
        g.globalAlpha = pulse;
        roundRect(g, x + 2, y + 2, nw - 3, this.hOf(n.pitch) - 4, 3);
        g.stroke();
      }
      g.restore();
    }

    // range selection rectangle
    const sr = this.dragRect ?? (ed.selAnchor && app.ed.focus === "roll" ? { t0: ed.selAnchor.tick, p0: ed.selAnchor.pitch, t1: ed.tick + grid, p1: ed.pitch } : null);
    if (sr) {
      const x0 = this.xOf(Math.min(sr.t0, sr.t1)), x1 = this.xOf(Math.max(sr.t0, sr.t1));
      const y0 = this.yOf(Math.max(sr.p0, sr.p1)), y1 = this.yOf(Math.min(sr.p0, sr.p1)) + this.hOf(Math.min(sr.p0, sr.p1));
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
      g.strokeRect(cx + 1, this.yOf(ed.pitch) + 1, Math.max(4, cw - 2), this.hOf(ed.pitch) - 2);
    }

    // playhead
    if (playTick >= 0) {
      const x = Math.round(this.xOf(playTick)) + 0.5;
      g.strokeStyle = app.recording ? col("--rec") : col("--ink");
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, laneBottom); g.stroke();
    }
    g.restore();
    g.fillStyle = col("--dim");
    g.font = "11px system-ui";
    g.fillText(ed.velView ? "vel" : this.zoomed() ? this.zoomLabel() : "", 6, RULER_H / 2);

    if (ed.autoKey) this.drawAuto(g, col, w, h, color);

    // velocity lane
    if (ed.velView && !ed.autoKey) {
      const y0 = h - VEL_H;
      g.fillStyle = col("--panel");
      g.fillRect(0, y0, w, VEL_H);
      g.fillStyle = col("--dim");
      g.font = "11px system-ui";
      g.fillText("Velocity", 6, y0 + 12);
      this.clipTo(g, y0, h);
      if (clip) for (const n of clip.notes) {
        const x = this.xOf(n.start);
        const bh = (VEL_H - 10) * (n.vel / 127);
        g.fillStyle = ed.sel.has(n.id) || (n.pitch === ed.pitch && n.start <= ed.tick && ed.tick < n.start + n.len) ? "#fff" : color;
        g.fillRect(x + 1, h - 4 - bh, 4, bh);
        g.fillRect(x - 1, h - 4 - bh, 8, 2);
      }
      g.restore();
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
    this.clipTo(g, top - 6, h);
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
    g.restore();
  }

  /** Diagonal lines every `step` px (a tile the pattern repeats). */
  private makeHatch(color: string, step = 8, width = 1.5): CanvasPattern | null {
    const c = document.createElement("canvas");
    c.width = c.height = step;
    const g = c.getContext("2d")!;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(0, step); g.lineTo(step, 0);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(step - 2, step + 2); g.lineTo(step + 2, step - 2);
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
    if (y < RULER_H && x >= KEYS_W && this.zoomed()) {
      const t = ((x - KEYS_W) / (this.size().w - KEYS_W)) * this.clipTicks();
      ed.scrollTick = this.clampScroll(Math.floor((t - this.viewTicks() / 2) / PPQ) * PPQ);
      this.lastNav = performance.now();
      this.invalidate();
      return;
    }
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
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a quick tap: the finger has already lifted */ }

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

  // ------------------------------------------------------------ touch gestures

  private touches = new Map<number, { x: number; y: number }>();
  /** A first finger waits a moment: if a second one lands, it was a gesture, not an edit. */
  private pendingTouch: { e: PointerEvent; timer: number; x: number; y: number } | null = null;
  private gesture: { cx: number; cy: number; d: number; scroll: number; top: number } | null = null;
  private replays = new WeakSet<Event>();
  /** A finger left over from a gesture: ignored until it lifts. */
  private spent = new Set<number>();

  private touchLayer(e: PointerEvent) {
    if (e.pointerType !== "touch" || this.replays.has(e)) return; // mouse, pen and our own replays go straight through
    const id = e.pointerId, block = () => { e.stopImmediatePropagation(); e.preventDefault(); };
    switch (e.type) {
      case "pointerdown": {
        block();
        try { this.canvas.setPointerCapture(id); } catch { /* gone already */ }
        this.touches.set(id, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 1) {
          const timer = setTimeout(() => this.releasePending(), 90) as unknown as number;
          this.pendingTouch = { e, timer, x: e.clientX, y: e.clientY };
        } else if (this.touches.size === 2) {
          if (this.pendingTouch) { clearTimeout(this.pendingTouch.timer); this.pendingTouch = null; }
          this.startGesture();
        }
        return;
      }
      case "pointermove": {
        const t = this.touches.get(id);
        if (!t) return;
        t.x = e.clientX; t.y = e.clientY;
        if (this.spent.has(id)) { block(); return; }
        if (this.gesture) { block(); this.moveGesture(); return; }
        // One finger moving: it's an edit (a drag) after all; start it now.
        const p = this.pendingTouch;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) this.releasePending();
        return;
      }
      default: { // up / cancel
        this.touches.delete(id);
        if (this.spent.delete(id)) { block(); return; }
        if (this.gesture) {
          block();
          if (this.touches.size < 2) { this.gesture = null; for (const k of this.touches.keys()) this.spent.add(k); }
          return;
        }
        if (this.pendingTouch?.e.pointerId === id) {
          // A quick tap: run it as a press, then replay this release so the edit completes.
          block();
          this.releasePending();
          const replay = new PointerEvent(e.type, { pointerId: id, pointerType: "touch", clientX: e.clientX, clientY: e.clientY, bubbles: true });
          this.replays.add(replay);
          this.canvas.dispatchEvent(replay);
        }
      }
    }
  }

  private releasePending() {
    const p = this.pendingTouch;
    if (!p) return;
    clearTimeout(p.timer);
    this.pendingTouch = null;
    this.pointerDown(p.e);
  }

  private startGesture() {
    const [a, b] = [...this.touches.values()];
    this.gesture = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), scroll: this.scroll(), top: this.topIdx() };
  }

  /** Two fingers: drag to scroll (time and pitch), spread / pinch to zoom in / out a step. */
  private moveGesture() {
    const g = this.gesture!, [a, b] = [...this.touches.values()];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
    const ed = this.app.ed;
    if (d > g.d * 1.35 || d < g.d / 1.35) {
      const r = this.canvas.getBoundingClientRect();
      this.zoom(d > g.d ? 1 : -1, this.tickAt(cx - r.left));
      this.startGesture();
      return;
    }
    const pxPerTick = (this.size().w - KEYS_W) / this.viewTicks();
    if (this.zoomed()) ed.scrollTick = this.clampScroll(Math.round((g.scroll - (cx - g.cx) / pxPerTick) / PPQ) * PPQ);
    if (!this.isDrums()) {
      const rows = this.allRows();
      const i = Math.max(0, Math.min(this.maxTop(), g.top + Math.round((cy - g.cy) / rowPx())));
      ed.topPitch = rows[i];
    }
    this.lastNav = performance.now();
    this.invalidate();
  }

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
