// Time's up: the moment the timer reaches zero. The song is kept as a timed take first, the bar
// that's playing finishes and fades out, the display says TIME (or flashes TILT with the buzz in
// game mode), then a card: play it back, save it as it is, an EXTRA BALL, or keep working.
// Couch and online games: everyone sees the card; only the host (couch: the conductor) chooses.

import { challengeStatus } from "../engine/challenges";
import type { App } from "./app";
import { exportDialog } from "./dialogs";
import { fmtTime, h } from "./dom";
import { libraryDialog, renameTake, saveTake, type Take } from "./library";
import { SpatialNav } from "./nav";
import type { Overlay } from "./overlay";
import { shareSongDialog } from "./sharesong";
import { tiltFlash } from "./tilt";
import { dmdText } from "./dmd";

export type TimeUpChoice = "playback" | "save" | "extra" | "keep";

/** The card while it's up (or minimised during playback). */
let card: {
  ov: Overlay | null;
  pill: HTMLElement | null;
  take: Take | null;
  /** This machine chooses (solo, couch, online host); guests only watch. */
  chooser: boolean;
  game: boolean;
} | null = null;

/** Online guests: a choice that arrived while the bar was still fading out (applied once the card is up). */
let pendingChoice: TimeUpChoice | null = null;

/** The clock ran out here (solo, couch, online host). */
export async function timeUp(app: App) {
  closeCard(app);
  const game = app.settings.gameMode;
  app.couch?.online?.send({ t: "timeup", game });
  // The take comes first: whatever happens next, the song as it was at zero is kept.
  let take: Take | null = null;
  if (app.song.tracks.length) {
    try { take = await saveTake(app.song, `Timed take, ${fmtTime(app.timer.total)}`); } catch (e) { console.warn("timed take not saved", e); }
  }
  await ending(app, game);
  card = { ov: null, pill: null, take, chooser: true, game };
  showCard(app);
}

/** Online guests: the host's clock ran out. */
export async function remoteTimeUp(app: App, game: boolean) {
  closeCard(app);
  pendingChoice = null;
  app.timer = { ...app.timer, running: false, done: true, paused: false };
  if (app.recording) { app.finishRecording(); app.recording = false; }
  if (game) app.locked = true;
  app.renderHeader();
  await ending(app, game);
  card = { ov: null, pill: null, take: null, chooser: false, game };
  showCard(app);
  if (pendingChoice) { const c = pendingChoice; pendingChoice = null; remoteChoice(app, c); }
}

/** Online guests: what the host chose. */
export function remoteChoice(app: App, choice: TimeUpChoice) {
  if (!card) { pendingChoice = choice; return; }
  if (choice === "playback") { app.playFromTopOnce = true; minimise(app, "The host is playing it back"); return; }
  closeCard(app);
  app.unlock();
}

/**
 * Online guests: the host's time's-up is over without a choice reaching us (they started a new clock,
 * left, or a new game began): the card goes and editing unlocks.
 */
export function clearRemoteTimeUp(app: App) {
  pendingChoice = null;
  closeCard(app);
  app.unlock();
}

/** The bar finishes and fades out; then TIME on the display, or the TILT flash with its buzz. */
async function ending(app: App, game: boolean) {
  app.overlays.closeAll();
  await app.engine.finishBar(1);
  app.finishRecording();
  app.recording = false;
  app.renderHeader();
  if (game) await new Promise<void>((done) => tiltFlash(app, done));
  else {
    app.overlays.toast("TIME", 1600);
    await new Promise((r) => setTimeout(r, 700));
  }
}

function closeCard(app: App) {
  if (!card) return;
  card.pill?.remove();
  const ov = card.ov;
  card = null;
  if (ov) app.overlays.remove(ov);
}

/** Who chooses in a couch game: the conductor's controller drives the card (online: this machine's player). */
function chooserSeat(app: App): string | null {
  const c = app.couch;
  if (!c) return null;
  return c.online ? c.localId : c.conductor;
}

function stats(app: App): string {
  const s = app.song;
  const notes = s.tracks.reduce((n, t) => n + Object.values(t.clips).reduce((m, c) => m + c.notes.length, 0), 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [`${fmtTime(app.timer.total)} used`, plural(s.tracks.length, "track"), plural(s.scenes.length, "scene"), plural(notes, "note")].join(" · ");
}

function showCard(app: App) {
  if (!card) return;
  const c = card;
  c.pill?.remove();
  c.pill = null;
  const box = h("div", { class: "dialog timeup-card" + (c.game ? " game" : "") });
  const wrap = h("div", { class: "overlay-layer timeup-layer" }, box);
  const nav = new SpatialNav(() => box);
  const render = () => {
    box.replaceChildren(body(app));
    requestAnimationFrame(() => nav.paint());
  };
  const ov: Overlay = {
    el: wrap,
    handle(a) {
      if (a.type === "dir") { nav.move(a.dir); return true; }
      if (a.type === "confirm") { (nav.focused as HTMLElement | null)?.click(); return true; }
      // Back: game mode waits for a choice; otherwise it's the same as Keep working.
      if (a.type === "back") { if (!c.game && c.chooser) choose(app, "keep"); return true; }
      if (a.type === "play") { if (c.chooser) choose(app, "playback"); return true; }
      return true;
    },
  };
  c.ov = ov;
  render();
  app.overlays.push(ov);
  // Couch: whoever acted last doesn't own it: the card fills the screen and the host's controller drives it.
  ov.owner = chooserSeat(app);
  Object.assign(wrap.style, { left: "", top: "", width: "", height: "", right: "", bottom: "" });
  if (!c.chooser) ov.owner = "\u0000nobody";
  ov.onClose = () => { if (card === c && c.ov === ov) c.ov = null; };
}

function body(app: App): HTMLElement {
  const c = card!, s = app.song, game = c.game, can = c.chooser;
  const btn = (nav: string, label: HTMLElement | string, onclick: () => void, cls = "", disabled = false) =>
    h("button", { class: `row-btn ${cls}`, "data-nav": nav, disabled: !can || disabled, onclick }, label);
  const extraLeft = app.extraBallLeft;
  return h("div", { class: "timeup" },
    h("div", { class: "timeup-title", role: "heading", "aria-label": game ? "Song complete" : "Time" }, dmdText(game ? "SONG COMPLETE" : "TIME", { height: game ? 26 : 40, slant: game ? 0 : 5 })),
    h("p", { class: "timeup-stats" }, stats(app)),
    c.take ? h("p", { class: "note" }, `Kept as “${c.take.name}” in this song's versions (Songs → the song → Versions).`) : null,
    game && s.challenges?.length ? h("div", { class: "timeup-cards" },
      challengeStatus(s).map((x) => h("p", { class: "note" + (x.met ? " ok" : "") }, `${x.met ? "✅" : "⬜"} ${x.text}`))) : null,
    !can ? h("p", { class: "note big" }, "Waiting for the host to choose…")
      : app.couch && !app.couch.online ? h("p", { class: "note" }, "The conductor's controller chooses.")
      : game ? h("p", { class: "note" }, "Editing is locked until you choose.") : null,
    btn("playback", "▶ Play it back", () => choose(app, "playback"), "primary"),
    btn("save", "Save as-is", () => choose(app, "save"), "", !c.take),
    btn("extra", h("span", null, "EXTRA BALL", h("span", { class: "note" }, game ? (extraLeft ? "  +5 minutes, once" : "  used") : `  +5 minutes${app.extraBalls ? ` (${app.extraBalls} used)` : ""}`)),
      () => choose(app, "extra"), "extra-ball", !extraLeft),
    btn("keep", "Keep working", () => choose(app, "keep")),
    h("div", { class: "timeup-links" },
      h("button", { class: "link-btn", "data-nav": "share", disabled: !s.tracks.length, onclick: () => shareSongDialog(app) }, "Share"),
      h("button", { class: "link-btn", "data-nav": "export", disabled: !s.tracks.length, onclick: () => exportDialog(app) }, "Export")),
  );
}

/** The host's choice (sent to everyone in an online game). */
function choose(app: App, choice: TimeUpChoice) {
  const c = card;
  if (!c?.chooser) return;
  if (choice === "save") { saveAsIs(app); return; }
  app.couch?.online?.send({ t: "timeup-choice", choice });
  if (choice === "playback") {
    app.playFromTopOnce = true;
    minimise(app, "Playing it back");
    if (app.engine.playing) app.stopLocal();
    app.togglePlay();
    return;
  }
  closeCard(app);
  if (choice === "extra") app.extraBall();
  else { app.stopTimer(); app.unlock(); }
  app.onTimerChanged?.();
}

/** Playback: the card steps aside (a small bar at the bottom) and comes back when it stops. */
function minimise(app: App, text: string) {
  const c = card;
  if (!c) return;
  if (c.ov) { const ov = c.ov; c.ov = null; app.overlays.remove(ov); }
  c.pill = h("div", { class: "timeup-pill", role: "status" },
    h("span", { class: "timeup-pill-text" }, `${c.game ? "SONG COMPLETE" : "TIME"} · ${text}`),
    c.chooser ? h("button", { class: "small-btn", onclick: () => { if (app.engine.playing) app.togglePlay(); else showCard(app); } }, "■ Back to the card") : null);
  document.body.appendChild(c.pill);
  const back = () => {
    if (card !== c || !c.pill) return;
    if (!app.timer.done) { closeCard(app); return; } // a new song or timer started meanwhile
    if (!app.engine.playing && performance.now() - t0 > 600) { showCard(app); return; }
    requestAnimationFrame(back);
  };
  const t0 = performance.now();
  requestAnimationFrame(back);
}

/** Save as-is: name the timed take, then Songs or stay (asked once, remembered). */
function saveAsIs(app: App) {
  const c = card;
  if (!c?.take) return;
  const take = c.take;
  const untitled = !app.song.title || app.song.title === "Untitled";
  const input = h("input", { class: "text-input", "data-nav": "name", value: untitled ? "" : app.song.title, placeholder: take.name, maxlength: 40 }) as HTMLInputElement;
  app.overlays.dialog("Save as-is", (close) => {
    const keep = async () => {
      const name = input.value.trim().slice(0, 40) || take.name;
      try { await renameTake(take, name); } catch (e) { console.warn(e); }
      if (untitled && input.value.trim()) { app.song.title = name; app.changed(); }
      close();
      app.couch?.online?.send({ t: "timeup-choice", choice: "save" });
      closeCard(app);
      app.stopTimer();
      app.unlock();
      app.onTimerChanged?.();
      afterSave(app, name);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void keep(); } });
    requestAnimationFrame(() => input.focus());
    return h("div", { class: "form" },
      h("p", { class: "note" }, "A name for this take (it stays in the song's versions)."),
      input,
      h("button", { class: "row-btn primary", "data-nav": "keep-take", onclick: () => void keep() }, "Keep it"),
      h("button", { class: "row-btn", "data-nav": "cancel", onclick: close }, "Back to the card"));
  });
}

function afterSave(app: App, name: string) {
  const go = (where: "library" | "stay") => {
    if (where === "library") libraryDialog(app, { onOpen: () => app.show("song") });
    else app.overlays.toast(`Saved “${name}”`, 1800);
  };
  const pref = app.settings.afterTimedSave;
  if (pref === "library" || pref === "stay") { go(pref); return; }
  app.overlays.dialog("Saved", (close) => {
    const pick = (where: "library" | "stay") => { app.settings.afterTimedSave = where; app.saveSettings(); close(); go(where); };
    return h("div", { class: "form" },
      h("p", { class: "note big" }, `“${name}” is kept. Where to now?`),
      h("button", { class: "row-btn primary", "data-nav": "library", onclick: () => pick("library") }, "Go to my songs"),
      h("button", { class: "row-btn", "data-nav": "stay", onclick: () => pick("stay") }, "Stay here"),
      h("p", { class: "note" }, "TILT remembers this for next time (Settings → Timer changes it)."));
  });
}
