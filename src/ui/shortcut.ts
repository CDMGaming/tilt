// Jump to… (hold LB / L or backtick): a mini map of tracks x scenes. Hold, move, release to jump;
// a quick tap (or the "Jump to…" button) leaves it open to click a column or a cell, or to pick
// with the arrows and Enter / A. Click outside, Esc or B cancels.
// Couch and online games: each column says whose instrument it is. Your own: go there. A free one:
// your seat moves to it. Another player's: you look at it read-only, and can ask them to swap.

import { INSTRUMENTS } from "../engine/instruments";
import type { Scene, Track } from "../engine/model";
import { ensureClip } from "../engine/songops";
import type { Action } from "./actions";
import type { App } from "./app";
import { h } from "./dom";
import { trackColor } from "./theme";
import type { Overlay } from "./overlay";
import { SEAT_COLORS, seatName, type Seat } from "./seats";

/** A press shorter than this opens Jump to… and leaves it open (no release-to-jump). */
const TAP_MS = 280;

export function openShortcut(app: App) {
  const song = app.song;
  if (!song.tracks.length || app.screenName === "dice") return;
  const c = app.couch && app.screenName === "couch" ? app.couch : null;
  const me = c && app.actor && app.actor !== c.lobby ? app.actor : null;
  if (c && !me) return;
  const curTrack = me ? app.ed.trackId : app.screenName === "edit" ? app.ed.trackId : song.tracks[app.songCur.col]?.id;
  const curScene = me ? app.ed.sceneId : app.currentSceneId();
  let col = Math.max(0, song.tracks.findIndex((t) => t.id === curTrack));
  let row = Math.max(0, song.scenes.findIndex((s) => s.id === curScene));
  // Row -1: the screens (Song / Edit / Mix): a gamepad's way between them (keys have F2-F4). Not on the couch.
  const SCREENS = [["song", "▦ Song"], ["edit", "♪ Edit"], ["mix", "⫼ Mix"]] as const;
  let scr = Math.max(0, SCREENS.findIndex(([id]) => id === app.screenName));
  const opened = performance.now();
  let moved = false;
  const box = h("div", { class: "shortcut" });
  const wrap = h("div", { class: "overlay-layer dim", onmousedown: (e: MouseEvent) => { if (e.target === wrap) app.overlays.remove(ov); } }, box);

  /** Whose a track is, from this player's point of view. */
  const whose = (t: Track): { label: string; seat: Seat | null; cls: string } => {
    if (!c || !me) return { label: "", seat: null, cls: "" };
    const o = c.ownerOf(t.id);
    if (!o) return { label: "free", seat: null, cls: " free" };
    if (o === me) return { label: "you", seat: o, cls: " mine" };
    return { label: seatName(o), seat: o, cls: " theirs" };
  };
  const what = (): string => {
    const t = song.tracks[col];
    if (!c || !me) return "";
    const w = whose(t), name = INSTRUMENTS[t.kind].name;
    if (w.cls === " mine") return `Your ${name}`;
    if (w.cls === " free") return `Free: your seat moves to ${name}`;
    return `${w.label}'s ${name}: look at it read-only (☰ menu: ask to swap)`;
  };
  const draw = () => {
    box.replaceChildren(
      h("div", { class: "menu-title" }, "Jump to…", h("span", { class: "sc-keys" }, " hold ` / LB and release, or click")),
      c ? "" : h("div", { class: "sc-screens", role: "group", "aria-label": "Screens" }, SCREENS.map(([id, label], k) => h("button", {
        class: "sc-screen" + (row === -1 && k === scr ? " cursor" : "") + (app.screenName === id ? " now" : ""), title: `${label.slice(2)} screen (F${k + 2})`,
        onclick: () => { row = -1; scr = k; jump(); },
      }, label))),
      h("div", { class: "sc-grid", style: `grid-template-columns: minmax(70px, 110px) repeat(${song.tracks.length}, minmax(56px, 90px))` },
        h("div", null),
        song.tracks.map((t, ci) => {
          const w = whose(t);
          return h("button", {
            class: "sc-head" + (ci === col ? " on" : "") + w.cls, style: `--track:${trackColor(t)}${w.seat ? `;--seat:${SEAT_COLORS[w.seat.slot]}` : ""}`,
            title: `${INSTRUMENTS[t.kind].name}${w.label ? ` (${w.label})` : ""}`, onclick: () => { col = ci; jump(); },
          }, h("span", { class: "sc-name" }, INSTRUMENTS[t.kind].name), w.label ? h("span", { class: "sc-owner" }, w.label) : "");
        }),
        song.scenes.map((s, r) => [
          h("button", { class: "sc-scene" + (r === row ? " on" : ""), title: s.name, onclick: () => { row = r; jump(); } }, `${r + 1} ${s.name}`),
          song.tracks.map((t, ci) => h("button", {
            class: "sc-cell" + (r === row && ci === col ? " cursor" : "") + (t.clips[s.id]?.notes.length ? " has" : ""),
            style: `--track:${trackColor(t)}`, "aria-label": `${INSTRUMENTS[t.kind].name}, ${s.name}`,
            onclick: () => { col = ci; row = r; jump(); },
          })),
        ]),
      ),
      h("div", { class: "note sc-what" }, what() || " "),
      h("div", { class: "note" }, "Y: loop this scene · click outside or B / Esc: cancel"),
    );
  };
  const ov: Overlay = {
    el: wrap,
    handle(a: Action) {
      if (a.type === "dir") {
        if (row === -1) {
          if (a.dir === "left") scr = Math.max(0, scr - 1);
          if (a.dir === "right") scr = Math.min(SCREENS.length - 1, scr + 1);
          if (a.dir === "down") row = 0;
          moved = true;
          draw();
          return true;
        }
        if (a.dir === "left") col = Math.max(0, col - 1);
        if (a.dir === "right") col = Math.min(song.tracks.length - 1, col + 1);
        if (a.dir === "up") row = c || row > 0 ? Math.max(0, row - 1) : -1;
        if (a.dir === "down") row = Math.min(song.scenes.length - 1, row + 1);
        moved = true;
        draw();
        return true;
      }
      if (a.type === "play") {
        const s = song.scenes[Math.max(0, row)];
        if (c) { if (c.isConductor(me)) { c.setScene(s.id); app.refresh(); } else app.overlays.toast(`Only ${c.conductor.toUpperCase()} (the conductor) changes the scene`, 1200); return true; }
        if (app.engine.playing) app.engine.queue({ kind: "scene", sceneId: s.id }); else app.engine.play({ kind: "scene", sceneId: s.id });
        app.songMode = "scene";
        app.renderHeader();
        return true;
      }
      // Released after a hold (or after moving): go. A quick tap leaves it open for clicks.
      if (a.type === "shortcut" && !a.down) { if (moved || performance.now() - opened > TAP_MS) jump(); return true; }
      if (a.type === "shortcut" && a.down) { app.overlays.remove(ov); return true; } // a second press closes it
      if (a.type === "confirm") { jump(); return true; }
      return false;
    },
  };
  const jump = () => {
    app.overlays.remove(ov);
    if (row === -1) { app.show(SCREENS[scr][0]); return; }
    const t = song.tracks[col], s = song.scenes[row];
    if (c && me) { couchJump(app, me, t, s); return; }
    if (app.screenName === "song") {
      app.songCur = { row, col };
      app.refresh();
      return;
    }
    if (!t.clips[s.id] && !app.locked) app.edit("New clip", () => ensureClip(song, t, s.id), { render: false });
    app.ed.trackId = t.id;
    app.ed.sceneId = s.id;
    app.ed.sel.clear();
    app.show("edit");
  };
  draw();
  app.overlays.push(ov);
  requestAnimationFrame(() => box.querySelector(".sc-cell.cursor")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
}

/**
 * Couch / online: jump as this seat. The scene is shared (the conductor's to change); for anyone
 * else a different scene only changes what their own quarter shows.
 */
export function couchJump(app: App, seat: Seat, t: Track, s: Scene) {
  const c = app.couch!;
  if (s.id !== c.sceneId && c.isConductor(seat)) c.setScene(s.id);
  else seat.ed.sceneId = s.id;
  const owner = c.ownerOf(t.id);
  if (owner === seat) {
    seat.viewing = null;
    seat.ed.trackId = t.id;
  } else if (!owner) {
    if (c.online && !c.online.isHost) {
      c.online.requestSeatMove(t.id);
      app.overlays.toast(`Moving to ${INSTRUMENTS[t.kind].name}…`, 1200);
    } else {
      c.moveSeat(seat, t.id);
      c.online?.sendRoster();
      app.overlays.toast(`${seatName(seat)} now plays ${INSTRUMENTS[t.kind].name}`, 1400);
    }
  } else {
    seat.viewing = t.id;
    seat.ed.trackId = t.id;
    seat.ed.sel = new Set();
    app.overlays.toast(`${seatName(owner)}'s instrument: read-only`, 1400);
  }
  // A clip to look at or work in (only on your own track: ownership refuses the rest).
  if (!t.clips[s.id] && c.ownerOf(t.id) === seat && !app.locked) app.edit("New clip", () => ensureClip(app.song, t, s.id), { render: false });
  app.refresh();
}

/** Back to your own instrument after looking at someone else's. */
export function backToMine(app: App, seat: Seat) {
  seat.viewing = null;
  seat.ed.trackId = seat.trackId;
  seat.ed.sel = new Set();
  app.refresh();
}

/** Ask the player whose instrument you're looking at to trade. They answer on their own controller. */
export function askSwap(app: App, seat: Seat) {
  const c = app.couch!;
  const other = seat.viewing != null ? c.ownerOf(seat.viewing) : undefined;
  if (!other || other === seat) return;
  if (c.online) {
    c.online.send({ t: "swap-ask", by: seat.id, asked: other.id }); // not from / to: the relay uses those for connection ids
    app.overlays.toast(`Asked ${seatName(other)} to swap…`, 1500);
    return;
  }
  app.overlays.toast(`Asked ${seatName(other)} to swap…`, 1500);
  swapPrompt(app, seat, other, (yes) => {
    if (yes) { c.swap(seat, other); app.overlays.toast(`${seatName(seat)} and ${seatName(other)} swapped instruments`, 1600); app.refresh(); }
    else app.as(seat, () => app.overlays.toast(`${seatName(other)} would rather keep theirs`, 1500));
  });
}

/** The question, in the asked player's quarter (driven by their controller). */
export function swapPrompt(app: App, from: Seat, to: Seat, answer: (yes: boolean) => void) {
  const c = app.couch!;
  const mine = app.song.tracks.find((t) => t.id === to.trackId), theirs = app.song.tracks.find((t) => t.id === from.trackId);
  if (!mine || !theirs) return;
  app.as(to, () => app.overlays.dialog("Swap instruments?", (close) => h("div", { class: "form" },
    h("p", { class: "note big" }, `${seatName(from)} wants to swap: you'd get their ${INSTRUMENTS[theirs.kind].name}, they'd get your ${INSTRUMENTS[mine.kind].name}.`),
    h("button", { class: "row-btn primary", "data-nav": "yes", onclick: () => { close(); answer(true); } }, "Swap"),
    h("button", { class: "row-btn", "data-nav": "no", onclick: () => { close(); answer(false); } }, "Keep mine"),
    c.online ? null : h("p", { class: "note" }, "Your clips stay with the instrument: you carry on with theirs."))));
}
