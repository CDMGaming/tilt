// Song screen: tracks (columns) x scenes (rows); each cell is a clip.

import { canArrange, autoArrange } from "../engine/arranger";
import { encodeSetup, pickPreset, setupFromSong, usedPresets } from "../engine/dice";
import { ALL_KINDS, INSTRUMENTS, isDrumKind } from "../engine/instruments";
import { MAX_BARS, MAX_SCENES, TICKS_PER_BAR, newId, type Clip, type Scene, type Track } from "../engine/model";
import {
  QUICK_SCENES, SCENE_NAMES, addScene, changeInstrument, deleteScene, deleteTrack, duplicateClip, duplicateScene,
  duplicateTrack, ensureClip, insertBlankScene, loadPreset, moveScene, presetIndex, sceneColor, setClipBars,
} from "../engine/songops";
import { mods, type Action } from "./actions";
import type { App, Screen } from "./app";
import { instrumentPicker } from "./dialogs";
import { h } from "./dom";
import { trackColor } from "./theme";
import type { MenuItem } from "./overlay";
import { shareCodeDialog } from "./share";
import { isPhone } from "./phone";

const HOLD_MS = 450;

export class SongScreen implements Screen {
  el = h("div", { class: "song-screen" });
  private grid = h("div", { class: "song-grid" });
  private clipboard: Clip | null = null;
  /** A clip picked up with "Move / copy to…" (controller-friendly drag and drop). */
  private carry: { trackId: number; sceneId: number } | null = null;

  /** Touch: a long-press armed a gesture (menu, or a scene drag): the page mustn't scroll under it. */
  private holding = false;

  constructor(private app: App) {
    this.el.appendChild(this.grid);
    this.el.addEventListener("touchmove", (e) => { if (this.holding) e.preventDefault(); }, { passive: false });
  }

  render() {
    const app = this.app, song = app.song, cur = app.songCur;
    const cols = song.tracks.length;
    // Phones: a narrow scene column that stays put while the clips scroll sideways.
    this.grid.style.gridTemplateColumns = isPhone() ? `88px repeat(${cols}, 112px) 64px` : `170px repeat(${cols}, minmax(120px, 1fr)) 96px`;
    const cells: HTMLElement[] = [];
    const isCur = (r: number, c: number) => cur.row === r && cur.col === c;
    const at = (r: number, c: number, el: HTMLElement) => {
      el.classList.toggle("cursor", isCur(r, c));
      el.addEventListener("pointerdown", (e) => {
        if (cur.row !== r || cur.col !== c) { cur.row = r; cur.col = c; this.render(); }
        if (e.button === 2) { e.preventDefault(); this.openMenu({ x: e.clientX, y: e.clientY }); }
      });
      // Touch: long-press opens the same menu as a right-click (a scene header can also be dragged).
      if (r >= 0 && r < song.scenes.length && c === -1) this.holdGesture(el, () => this.openMenu(), r);
      else if ((r === -1 && c >= 0 && c < cols) || (r >= 0 && r < song.scenes.length && c >= 0 && c < cols)) this.holdGesture(el, () => this.openMenu());
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      el.addEventListener("dblclick", () => this.activate());
      cells.push(el);
    };

    // header row
    at(-1, -1, h("div", { class: "corner" },
      h("div", { class: "song-title" }, song.title),
      (() => {
        // The song's setup code as it is now: click to copy, link or share it.
        const now = setupFromSong(song);
        return now ? h("button", { class: "corner-sub code-btn", "data-nav": "share-code", title: "Share this song's setup code", onclick: (e: Event) => { e.stopPropagation(); shareCodeDialog(app); } }, `🎲 ${encodeSetup(now)}`) : "";
      })()));
    song.tracks.forEach((t, c) => at(-1, c, this.trackHeader(t, c)));
    at(-1, cols, h("div", { class: "add-track", title: "Add an instrument", onclick: () => this.addTrack() }, h("span", { class: "add-plus" }, "+"), h("span", { class: "add-label" }, "Track")));

    // scene rows
    song.scenes.forEach((s, r) => {
      at(r, -1, this.sceneHeader(s, r));
      song.tracks.forEach((t, c) => at(r, c, this.cell(t, s)));
      at(r, cols, h("div", { class: "filler" }));
    });
    at(song.scenes.length, -1, h("div", { class: "add-scene", title: "Add a scene", onclick: () => this.addSceneAtEnd() }, h("span", { class: "add-plus" }, "+"), h("span", { class: "add-label" }, "Scene")));
    for (let c = 0; c <= cols; c++) at(song.scenes.length, c, h("div", { class: "filler" }));

    this.grid.replaceChildren(...cells);
    if (!song.tracks.length) this.grid.appendChild(h("div", { class: "empty-hint" }, "No tracks yet. Press A / Enter on + to add an instrument."));
    requestAnimationFrame(() => this.grid.querySelector(".cursor")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }

  private trackHeader(t: Track, c: number): HTMLElement {
    const def = INSTRUMENTS[t.kind];
    return h("div", { class: "track-head" + (t.mute ? " muted" : ""), style: `--track:${trackColor(t)}` },
      h("div", { class: "th-name" }, `${c + 1} ${def.name}`),
      h("div", { class: "th-preset" }, t.preset),
      h("div", { class: "th-btns" },
        h("button", { class: "mini mute" + (t.mute ? " on" : ""), onclick: (e: Event) => { e.stopPropagation(); this.app.edit("Mute", () => (t.mute = !t.mute)); } }, "M"),
        h("button", { class: "mini" + (t.solo ? " on solo" : ""), onclick: (e: Event) => { e.stopPropagation(); this.app.edit("Solo", () => (t.solo = !t.solo)); } }, "S"),
        h("div", { class: "vol-bar", title: `Volume ${Math.round(t.volume * 100)}` }, h("div", { style: `width:${t.volume * 100}%` }))));
  }

  private sceneHeader(s: Scene, r: number): HTMLElement {
    const songMode = this.app.songMode === "song", color = sceneColor(s.name);
    const grip = h("div", { class: "sh-grip", title: "Drag to move the scene (Alt+↑ / ↓)", "aria-hidden": "true" }, "⋮⋮");
    grip.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.stopPropagation(); e.preventDefault(); this.sceneDrag(r, e); } });
    return h("div", { class: "scene-head" + (color ? " tinted" : ""), "data-scene": s.id, style: color ? `--scene:${color}` : "" },
      isPhone() ? "" : grip,
      h("button", { class: "scene-play" + (songMode ? " from" : ""), onclick: (e: Event) => { e.stopPropagation(); this.playScene(r); }, title: songMode ? "Play the song from here" : "Loop this scene" }, "▶"),
      h("div", { class: "sh-text" },
        h("button", { class: "sh-name", title: "Name it: Intro, Verse, Chorus…", onclick: (e: Event) => { e.stopPropagation(); this.nameMenu(s, e.currentTarget as HTMLElement); } }, `${r + 1} ${s.name}`),
        h("div", { class: "sh-meta" },
          s.repeat > 1 ? `×${s.repeat} ` : "", s.tempo ? `${s.tempo} bpm ` : "", s.transpose ? `key ${s.transpose > 0 ? "+" : ""}${s.transpose} ` : "", s.fadeIn ? "◢ " : "", s.fadeOut ? "◣" : "")),
      h("div", { class: "sh-progress" }));
  }

  private cell(t: Track, s: Scene): HTMLElement {
    const clip = t.clips[s.id];
    const carrying = this.carry && this.carry.trackId === t.id && this.carry.sceneId === s.id;
    const el = h("div", {
      class: "cell" + (clip ? "" : " empty") + (clip?.muted ? " muted" : "") + (carrying ? " carry-src" : ""),
      style: `--track:${trackColor(t)}`, "data-scene": s.id, "data-track": t.id,
    });
    if (!clip) return el;
    el.addEventListener("pointerdown", (e) => { if (e.button === 0 && e.pointerType === "mouse") this.startDrag(e, t, s); });
    const cv = h("canvas", { class: "cell-preview" });
    // The insert lamp: lit while this clip plays, blinking while its scene waits its turn.
    el.append(cv, h("span", { class: "cell-bars" }, `${clip.bars}`), h("span", { class: "lamp", "aria-hidden": "true" }));
    requestAnimationFrame(() => drawPreview(cv, clip, t));
    return el;
  }

  // ------------------------------------------------------------ playback indicators

  private lastBeat = -1;

  frame() {
    const pos = this.app.engine.position(), mode = this.app.engine.playMode;
    // A scene queued to play next (scene loop mode): its clips blink until it starts.
    const queued = pos && mode.kind === "scene" && mode.sceneId !== pos.sceneId ? mode.sceneId : -1;
    // A beat pulse on the playing row (restarted each beat; CSS does the decay).
    const beat = pos ? Math.floor(pos.tick / 96) + pos.repeat * 1000 : -1;
    const pulse = beat !== this.lastBeat && beat >= 0;
    this.lastBeat = beat;
    for (const el of this.grid.querySelectorAll<HTMLElement>("[data-scene]")) {
      const on = !!pos && Number(el.dataset.scene) === pos.sceneId;
      el.classList.toggle("playing", on);
      el.classList.toggle("queued", Number(el.dataset.scene) === queued);
      if (on && pulse) { el.classList.remove("beat"); void el.offsetWidth; el.classList.add("beat"); }
      if (!on) el.classList.remove("beat");
      if (el.classList.contains("scene-head")) {
        const bar = el.querySelector<HTMLElement>(".sh-progress");
        if (bar) bar.style.width = on && pos ? `${((pos.repeat + pos.tick / pos.ticks) / pos.repeats) * 100}%` : "0";
      }
    }
  }

  // ------------------------------------------------------------ input

  handle(a: Action): boolean {
    const app = this.app, cur = app.songCur, song = app.song;
    switch (a.type) {
      case "dir": {
        const maxR = song.scenes.length, maxC = song.tracks.length;
        // Alt (or LT) + up / down on a scene row: move the scene.
        if (mods.fine && (a.dir === "up" || a.dir === "down") && cur.row >= 0 && cur.row < maxR) { this.nudgeScene(cur.row, a.dir === "up" ? -1 : 1); return true; }
        if (a.dir === "up") cur.row = Math.max(-1, cur.row - 1);
        if (a.dir === "down") cur.row = Math.min(maxR, cur.row + 1);
        if (a.dir === "left") cur.col = Math.max(-1, cur.col - 1);
        if (a.dir === "right") cur.col = Math.min(maxC, cur.col + 1);
        if (app.engine.playing && app.songMode === "scene" && cur.row >= 0 && cur.row < maxR && a.dir !== "left" && a.dir !== "right") {
          // Moving between scenes while looping queues the new scene.
          app.engine.queue({ kind: "scene", sceneId: song.scenes[cur.row].id });
        }
        this.render();
        return true;
      }
      case "confirm": {
        // Carrying a clip (controller move/copy): A on a cell drops it there.
        const t = this.curTrack(), s = this.curScene();
        if (this.carry && t && s) {
          const r = this.grid.querySelector(".cursor")?.getBoundingClientRect();
          this.dropMenu(this.carry, { trackId: t.id, sceneId: s.id }, r ? { x: r.left + 20, y: r.bottom - 8 } : undefined);
          return true;
        }
        this.activate();
        return true;
      }
      case "menu": this.openMenu(); return true;
      case "back":
        if (this.carry) { this.carry = null; this.render(); app.overlays.toast("Move cancelled", 800); return true; }
        return false;
      case "copy": { const c = this.curClip(); if (c) { this.clipboard = JSON.parse(JSON.stringify(c)); app.overlays.toast("Clip copied", 800); } return true; }
      case "paste": this.pasteClip(); return true;
      case "duplicate": { const c = this.curClip(); if (c) app.edit("Duplicate clip", () => duplicateClip(song, c)); return true; }
      case "delete": this.deleteAtCursor(); return true;
    }
    return false;
  }

  private curTrack(): Track | undefined { return this.app.song.tracks[this.app.songCur.col]; }
  private curScene(): Scene | undefined { return this.app.song.scenes[this.app.songCur.row]; }
  private curClip(): Clip | undefined { const t = this.curTrack(), s = this.curScene(); return t && s ? t.clips[s.id] : undefined; }

  private activate() {
    const app = this.app, { row, col } = app.songCur, song = app.song;
    const nT = song.tracks.length, nS = song.scenes.length;
    if (row === -1 && col === -1) { app.songSettings?.(); return; }
    if (row === -1 && col === nT) { this.addTrack(); return; }
    if (row === nS && col === -1) { this.addSceneAtEnd(); return; }
    if (row === -1 && col < nT) { this.openEditor(song.tracks[col], song.scenes[0], "panel"); return; }
    if (col === -1 && row < nS) { this.playScene(row); return; }
    if (row >= 0 && row < nS && col >= 0 && col < nT) this.openEditor(song.tracks[col], song.scenes[row], "roll");
  }

  openEditor(t: Track, s: Scene, focus: "roll" | "panel") {
    const app = this.app;
    if (!t.clips[s.id] && !app.locked) app.edit("New clip", () => ensureClip(app.song, t, s.id), { render: false });
    app.ed.trackId = t.id;
    app.ed.sceneId = s.id;
    app.ed.focus = focus;
    app.ed.sel.clear();
    app.show("edit");
  }

  /** A scene's ▶: SCENE mode loops it (queued if something's playing); SONG mode plays the song from it. */
  private playScene(r: number) {
    const app = this.app, s = app.song.scenes[r];
    app.songCur.row = r;
    if (app.songMode === "song") app.engine.play({ kind: "song", fromIndex: r });
    else if (app.engine.playing) app.engine.queue({ kind: "scene", sceneId: s.id });
    else app.engine.play({ kind: "scene", sceneId: s.id });
    app.refresh();
  }

  /** Quick names, each with its colour, plus the rest and a custom one. */
  private nameMenu(s: Scene, anchor: HTMLElement) {
    const app = this.app, r = anchor.getBoundingClientRect();
    const set = (n: string) => app.edit("Rename scene", () => (s.name = n));
    app.overlays.menu("Scene name", () => [
      ...QUICK_SCENES.map((q) => ({ label: q.name, color: q.color, checked: s.name === q.name, run: () => set(q.name) })),
      { label: "More names", sub: () => SCENE_NAMES.filter((n) => !QUICK_SCENES.some((q) => q.name === n)).map((n) => ({ label: n, color: sceneColor(n) ?? undefined, checked: s.name === n, run: () => set(n) })) },
      { label: "Custom…", run: () => { const n = prompt("Scene name", s.name); if (n) set(n.slice(0, 24)); } },
    ], { x: r.left, y: r.bottom + 4 });
  }

  /** Move scene `i` by `d` rows (Alt+↑ / ↓, LT + up / down, the menu). */
  private nudgeScene(i: number, d: -1 | 1) {
    const app = this.app, song = app.song, to = i + d;
    if (to < 0 || to >= song.scenes.length) return;
    app.edit("Move scene", () => moveScene(song, i, to));
    app.songCur.row = to;
    this.render();
  }

  // ------------------------------------------------------------ scene drag (grip / long-press)

  /** Drag scene `from` up or down; a line shows where it will land. */
  private sceneDrag(from: number, e: PointerEvent) {
    const app = this.app, song = app.song;
    const heads = [...this.grid.querySelectorAll<HTMLElement>(".scene-head")];
    const src = heads[from];
    if (!src) return;
    src.classList.add("dragging");
    this.holding = true;
    let to = from;
    const mark = (y: number) => {
      const k = heads.filter((el) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2 < y; }).length;
      to = k > from ? k - 1 : k;
      heads.forEach((el, i) => {
        el.classList.toggle("drop-above", i === k && k !== from && k !== from + 1);
        el.classList.toggle("drop-below", k === heads.length && i === heads.length - 1 && from !== heads.length - 1);
      });
      // Near the top / bottom edge: scroll along.
      const box = this.el.getBoundingClientRect();
      if (y < box.top + 40) this.el.scrollTop -= 12; else if (y > box.bottom - 40) this.el.scrollTop += 12;
    };
    const move = (ev: PointerEvent) => mark(ev.clientY);
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      this.holding = false;
      heads.forEach((el) => el.classList.remove("drop-above", "drop-below", "dragging"));
      if (ev.type === "pointercancel" || to === from) return;
      app.edit("Move scene", () => moveScene(song, from, to));
      app.songCur = { row: to, col: -1 };
      this.render();
      app.overlays.toast(`Scene moved to ${to + 1}`, 900);
    };
    mark(e.clientY);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  /**
   * Touch long-press: hold still ~0.45 s. Let go: `onHold` (the menu). A scene header
   * (`sceneRow`) that's then dragged moves instead.
   */
  private holdGesture(el: HTMLElement, onHold: () => void, sceneRow?: number) {
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      const x0 = e.clientX, y0 = e.clientY;
      let armed = false;
      const timer = setTimeout(() => {
        armed = true;
        this.holding = true;
        el.classList.add("held");
        navigator.vibrate?.(15);
      }, HOLD_MS);
      const quit = () => {
        clearTimeout(timer);
        this.holding = false;
        el.classList.remove("held");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", quit);
      };
      const move = (ev: PointerEvent) => {
        const far = Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8;
        if (!armed) { if (far) quit(); return; }
        if (far && sceneRow !== undefined) { quit(); this.sceneDrag(sceneRow, ev); }
      };
      const up = () => { const was = armed; quit(); if (was) onHold(); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", quit);
    });
  }

  private addSceneAtEnd() {
    const app = this.app, song = app.song;
    if (song.scenes.length >= MAX_SCENES) { app.overlays.toast("That's the most scenes a song can have"); return; }
    app.edit("Add scene", () => addScene(song));
    app.songCur = { row: song.scenes.length - 1, col: -1 };
    this.render();
  }

  private addTrack() {
    const app = this.app;
    instrumentPicker(app, "Add a track", (kind, preset) => {
      app.edit("Add track", () => {
        const t = app.addTrackOf(kind, preset);
        if (t) app.songCur.col = app.song.tracks.indexOf(t);
      });
    });
  }

  private pasteClip() {
    const t = this.curTrack(), s = this.curScene();
    if (!t || !s || !this.clipboard) return;
    const c = this.clipboard;
    this.app.edit("Paste clip", () => (t.clips[s.id] = JSON.parse(JSON.stringify(c))));
  }

  private deleteAtCursor() {
    const app = this.app, t = this.curTrack(), s = this.curScene();
    if (t && s && t.clips[s.id]) app.edit("Clear clip", () => delete t.clips[s.id]);
  }

  // ------------------------------------------------------------ drag and drop

  /** Mouse drag of a clip cell: a ghost follows the pointer; dropping on another cell asks what to do. */
  private startDrag(e: PointerEvent, t: Track, s: Scene) {
    const x0 = e.clientX, y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    const target = (ev: PointerEvent) => (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>(".cell[data-track]") ?? null;
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = h("div", { class: "drag-ghost", style: `--track:${trackColor(t)}` }, `${INSTRUMENTS[t.kind].name} · ${s.name}`);
        document.body.appendChild(ghost);
      }
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY + 12}px`;
      const tgt = target(ev);
      if (tgt !== over) { over?.classList.remove("drop-target"); over = tgt; over?.classList.add("drop-target"); }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      over?.classList.remove("drop-target");
      if (!ghost) return; // a plain click
      ghost.remove();
      const tgt = target(ev);
      if (!tgt) return;
      const dst = { trackId: Number(tgt.dataset.track), sceneId: Number(tgt.dataset.scene) };
      if (dst.trackId === t.id && dst.sceneId === s.id) return;
      this.dropMenu({ trackId: t.id, sceneId: s.id }, dst, { x: ev.clientX, y: ev.clientY });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Ask: move / copy (or replace / swap when the target already has a clip). */
  private dropMenu(src: { trackId: number; sceneId: number }, dst: { trackId: number; sceneId: number }, at?: { x: number; y: number }) {
    const app = this.app, song = app.song;
    const st = song.tracks.find((x) => x.id === src.trackId), dt = song.tracks.find((x) => x.id === dst.trackId);
    const ss = song.scenes.find((x) => x.id === src.sceneId), ds = song.scenes.find((x) => x.id === dst.sceneId);
    const done = () => { this.carry = null; this.render(); };
    if (!st || !dt || !ss || !ds || !st.clips[ss.id]) { done(); return; }
    if (st.id === dt.id && ss.id === ds.id) { done(); return; }
    const occupied = !!dt.clips[ds.id];
    const clone = () => {
      const c = JSON.parse(JSON.stringify(st.clips[ss.id])) as Clip;
      for (const n of c.notes) n.id = newId(song); // fresh note ids in the copy
      return c;
    };
    const mismatch = isDrumKind(st.kind) !== isDrumKind(dt.kind);
    const where = `${INSTRUMENTS[dt.kind].name} · ${ds.name}`;
    app.overlays.menu(`${INSTRUMENTS[st.kind].name} · ${ss.name} → ${where}${mismatch ? " (different instrument type!)" : ""}`, () => [
      { label: occupied ? "Move here (replace)" : "Move here", run: () => { app.edit("Move clip", () => { dt.clips[ds.id] = st.clips[ss.id]; delete st.clips[ss.id]; }); app.songCur = this.cellPos(dt, ds); done(); } },
      { label: occupied ? "Copy here (replace)" : "Copy here", run: () => { app.edit("Copy clip", () => { dt.clips[ds.id] = clone(); }); app.songCur = this.cellPos(dt, ds); done(); } },
      ...(occupied ? [{ label: "Swap the two clips", run: () => { app.edit("Swap clips", () => { const a = st.clips[ss.id]; st.clips[ss.id] = dt.clips[ds.id]; dt.clips[ds.id] = a; }); done(); } }] : []),
      { label: "Cancel", run: done },
    ], at);
  }

  private cellPos(t: Track, s: Scene) {
    return { row: this.app.song.scenes.indexOf(s), col: this.app.song.tracks.indexOf(t) };
  }

  // ------------------------------------------------------------ menus

  openMenu(at?: { x: number; y: number }) {
    const app = this.app, song = app.song, { row, col } = app.songCur;
    const t = song.tracks[col], s = song.scenes[row];
    if (!at) {
      const r = this.grid.querySelector(".cursor")?.getBoundingClientRect();
      at = r ? { x: r.left + 20, y: r.bottom - 10 } : undefined;
    }
    if (row === -1 && t) app.overlays.menu(`Track ${col + 1} · ${t.name}`, () => this.trackMenu(t, col), at);
    else if (col === -1 && s) app.overlays.menu(`Scene ${row + 1} · ${s.name}`, () => this.sceneMenu(s, row), at);
    else if (t && s) app.overlays.menu(`Clip · ${t.name} / ${s.name}`, () => this.clipMenu(t, s), at);
    else if (row === -1 && col === -1) app.songSettings?.();
  }

  private trackMenu(t: Track, i: number): MenuItem[] {
    const app = this.app, song = app.song;
    return [
      { label: "Edit sound", run: () => this.openEditor(t, song.scenes[Math.max(0, app.songCur.row)] ?? song.scenes[0], "panel") },
      { label: "Change instrument", sub: () => [
        ...ALL_KINDS.map((k) => ({ label: INSTRUMENTS[k].name, checked: t.kind === k, run: () => app.edit("Change instrument", () => changeInstrument(t, k)) })),
        { label: "🎲 Random", run: () => app.edit("Change instrument", () => { const k = ALL_KINDS[Math.floor(Math.random() * ALL_KINDS.length)]; changeInstrument(t, k, pickPreset(k, usedPresets(song, k, t.id))); }) },
      ] },
      { label: "🎲 Random preset", run: () => app.edit("Random preset", () => loadPreset(t, pickPreset(t.kind, [...usedPresets(song, t.kind, t.id), presetIndex(t)]))) },
      { label: "Volume", sub: () => [100, 80, 60, 40, 20].map((v) => ({ label: String(v), checked: Math.round(t.volume * 100) === v, run: () => app.edit("Volume", () => (t.volume = v / 100)) })) },
      { label: "Mute", checked: t.mute, keepOpen: true, run: () => app.edit("Mute", () => (t.mute = !t.mute)) },
      { label: "Solo", checked: t.solo, keepOpen: true, run: () => app.edit("Solo", () => (t.solo = !t.solo)) },
      { label: "Duplicate track", run: () => app.edit("Duplicate track", () => duplicateTrack(song, i)) },
      { label: "Delete track", run: () => app.edit("Delete track", () => { deleteTrack(song, i); app.fixCursors(); }) },
      { label: "Add track…", run: () => this.addTrack() },
    ];
  }

  private sceneMenu(s: Scene, i: number): MenuItem[] {
    const app = this.app, song = app.song;
    const setTempo = (v: number | null) => app.edit("Scene tempo", () => (s.tempo = v));
    const cur = s.tempo ?? song.tempo;
    return [
      app.songMode === "song" ? { label: "Play the song from here", run: () => this.playScene(i) } : { label: "Loop this scene", run: () => this.playScene(i) },
      { label: "Name", sub: () => [
        ...SCENE_NAMES.map((n) => ({ label: n, color: sceneColor(n) ?? undefined, checked: s.name === n, run: () => app.edit("Rename scene", () => (s.name = n)) })),
        { label: "Custom…", run: () => { const n = prompt("Scene name", s.name); if (n) app.edit("Rename scene", () => (s.name = n.slice(0, 24))); } },
      ] },
      { label: `Repeat ×${s.repeat}`, sub: () => [1, 2, 3, 4, 6, 8, 16].map((n) => ({ label: `×${n}`, checked: s.repeat === n, run: () => app.edit("Repeat", () => (s.repeat = n)) })) },
      { label: `Tempo: ${s.tempo ? `${s.tempo} bpm` : "song tempo"}`, sub: () => [
        { label: "Song tempo", checked: s.tempo === null, run: () => setTempo(null) },
        ...[-20, -10, -5, 5, 10, 20].map((d) => ({ label: `${d > 0 ? "+" : ""}${d} → ${cur + d}`, run: () => setTempo(Math.max(40, Math.min(250, cur + d))) })),
      ] },
      { label: `Key change: ${s.transpose ? (s.transpose > 0 ? "+" : "") + s.transpose + " st" : "none"}`, sub: () => [0, 1, 2, 3, 5, 7, -1, -2, -3, -5].map((d) => ({ label: d === 0 ? "None" : `${d > 0 ? "+" : ""}${d} semitone${Math.abs(d) > 1 ? "s" : ""}`, checked: (s.transpose ?? 0) === d, run: () => app.edit("Key change", () => (s.transpose = d || undefined)) })) },
      { label: "Fade in", checked: s.fadeIn, keepOpen: true, run: () => app.edit("Fade in", () => (s.fadeIn = !s.fadeIn)) },
      { label: "Fade out", checked: s.fadeOut, keepOpen: true, run: () => app.edit("Fade out", () => (s.fadeOut = !s.fadeOut)) },
      { label: "Move up", hint: "Alt+↑", disabled: i === 0, run: () => this.nudgeScene(i, -1) },
      { label: "Move down", hint: "Alt+↓", disabled: i >= song.scenes.length - 1, run: () => this.nudgeScene(i, 1) },
      { label: "Add scene at end", run: () => app.edit("Add scene", () => addScene(song)) },
      { label: "Insert blank after", run: () => app.edit("Insert scene", () => insertBlankScene(song, i)) },
      { label: "Duplicate scene", run: () => app.edit("Duplicate scene", () => duplicateScene(song, i)) },
      { label: "Delete scene", disabled: song.scenes.length <= 1, run: () => app.edit("Delete scene", () => { deleteScene(song, i); app.fixCursors(); }) },
      { label: "Auto-arrange song", disabled: !canArrange(song), hint: song.scenes.length > 1 ? "one-scene songs" : "", run: () => app.edit("Auto-arrange", () => autoArrange(song)) },
    ];
  }

  private clipMenu(t: Track, s: Scene): MenuItem[] {
    const app = this.app, song = app.song;
    const clip = t.clips[s.id];
    return [
      { label: "Edit clip", run: () => this.openEditor(t, s, "roll") },
      { label: "Move / copy to…", disabled: !clip, run: () => { this.carry = { trackId: t.id, sceneId: s.id }; this.render(); app.overlays.toast("Pick a cell and press A (or Enter). B cancels.", 2500); } },
      { label: "Duplicate (x2 length)", disabled: !clip || clip.bars * 2 > MAX_BARS, run: () => app.edit("Duplicate clip", () => duplicateClip(song, clip!)) },
      { label: "Clip length", sub: () => Array.from({ length: MAX_BARS }, (_, i) => ({ label: `${i + 1} bar${i ? "s" : ""}`, checked: clip?.bars === i + 1, run: () => app.edit("Clip length", () => setClipBars(ensureClip(song, t, s.id), i + 1)) })) },
      { label: "Mute clip", disabled: !clip, checked: !!clip?.muted, keepOpen: true, run: () => app.edit("Mute clip", () => (clip!.muted = !clip!.muted)) },
      { label: "Copy clip", disabled: !clip, run: () => { this.clipboard = JSON.parse(JSON.stringify(clip)); } },
      { label: "Paste clip", disabled: !this.clipboard, run: () => this.pasteClip() },
      { label: "Clear clip", disabled: !clip, run: () => this.deleteAtCursor() },
      { label: "Clear automation", disabled: !Object.values(clip?.auto ?? {}).some((l) => l.length), run: () => app.edit("Clear automation", () => { clip!.auto = {}; }) },
    ];
  }
}

/** Tiny piano-roll thumbnail inside a cell. */
function drawPreview(cv: HTMLCanvasElement, clip: Clip, t: Track) {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr;
  cv.height = r.height * dpr;
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);
  if (!clip.notes.length) return;
  const ticks = clip.bars * TICKS_PER_BAR;
  const ps = clip.notes.map((n) => n.pitch);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  const span = Math.max(8, hi - lo + 1);
  const rowH = Math.max(1.5, r.height / span);
  g.fillStyle = trackColor(t);
  for (const n of clip.notes) {
    const x = (n.start / ticks) * r.width;
    const w = Math.max(1.5, (n.len / ticks) * r.width - 1);
    const y = r.height - ((n.pitch - lo + 1) / span) * r.height + (span > hi - lo + 1 ? -(span - (hi - lo + 1)) * rowH / 2 : 0);
    g.globalAlpha = 0.5 + 0.5 * (n.vel / 127);
    g.fillRect(x, Math.max(0, y), w, Math.max(1.5, rowH - 0.5));
  }
}
