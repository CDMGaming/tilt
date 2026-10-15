// Sharing whole songs: upload to the server (a short code, TILT-XXXXXXXX, and a link
// /s/XXXXXXXX), or, with no server, a self-contained link (#song=…). Opening either
// imports the song as a new song in your library, never over one you have.

import { normalizeSong, songChain, type Song } from "../engine/model";
import { wholeSong } from "../engine/timeline";
import { decodeSetup } from "../engine/dice";
import {
  SAMPLES_MAX_BYTES, SONG_MAX_BYTES, packSample, parseSongCode, sampleKey, shareable, showCode, songCode,
  songFromFragment, songToFragment, unpackSample, validateSong, type SharedSong,
} from "../engine/share";
import type { App } from "./app";
import { h } from "./dom";
import { newLibId, saveToLibrary } from "./library";
import { makeQr, qrSvg } from "./qr";
import { getSample, putSample } from "./samples";
import { openWithSetup } from "./share";

const RETRY_FOR_MS = 60_000;
const RETRY_EVERY_MS = 3_000;

const shortLink = (code: string) => `${location.origin}/s/${code}`;

async function copy(app: App, text: string, what: string) {
  try { await navigator.clipboard.writeText(text); app.overlays.toast(`${what} copied`, 1200); }
  catch { prompt(what, text); }
}

/** The song's own samples (Grab sampler pads you filled), as upload blobs, smallest first. */
async function userSamples(song: Song) {
  const ids = new Set<string>();
  for (const t of song.tracks) for (const r of t.samples ?? []) if (r?.startsWith("user:")) ids.add(r.slice(5));
  const out: { id: string; name: string; bytes: Uint8Array }[] = [];
  for (const id of ids) {
    const s = await getSample(id);
    if (s) out.push({ id, name: s.name, bytes: packSample(s.name, s.rate, s.data) });
  }
  return out.sort((a, b) => a.bytes.length - b.bytes.length);
}

type Shared = { kind: "server"; code: string; url: string; left: string[] } | { kind: "link"; code: string; url: string; left: string[]; why: string };

/** Upload the song (and the samples that fit in 5 MB); no server: a self-contained link. */
async function upload(song: Song): Promise<Shared> {
  const clean = shareable(song);
  const json = JSON.stringify(clean);
  if (new TextEncoder().encode(json).length > SONG_MAX_BYTES) throw new Error("This song is too big to share (512 KB max). Try deleting unused scenes or automation.");
  const code = await songCode(clean);
  const all = await userSamples(song);
  const fallback = async (why: string): Promise<Shared> =>
    ({ kind: "link", code, url: `${location.origin}/#song=${await songToFragment(clean)}`, left: all.map((s) => s.name), why });
  try {
    // Samples first (the share points at them), as many as fit in the cap.
    const samples: Record<string, string> = {}, left: string[] = [];
    let total = 0;
    for (const s of all) {
      if (total + s.bytes.length > SAMPLES_MAX_BYTES) { left.push(s.name); continue; }
      const key = await sampleKey(s.bytes);
      const r = await fetch(`/api/sample/${key}`, { method: "PUT", body: s.bytes as Uint8Array<ArrayBuffer>, headers: { "content-type": "application/octet-stream" } });
      if (r.status === 503 || r.status === 507) { left.push(s.name); continue; } // no sample storage here, or it's full
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `sample upload failed (${r.status})`);
      samples[s.id] = key;
      total += s.bytes.length;
    }
    const r = await fetch("/api/share", { method: "POST", body: JSON.stringify({ song: clean, samples }), headers: { "content-type": "application/json" } });
    if (r.status >= 500 || r.status === 404) return fallback(r.status === 503 ? "song sharing isn't set up on the server yet" : `the server answered ${r.status}`);
    const body = (await r.json().catch(() => ({}))) as { code?: string; url?: string; error?: string };
    if (!r.ok || !body.code) throw new Error(body.error ?? `sharing failed (${r.status})`);
    return { kind: "server", code: body.code, url: shortLink(body.code), left };
  } catch (e) {
    if (e instanceof TypeError) return fallback("the server can't be reached"); // fetch: offline / no server
    throw e;
  }
}

/** Remember a shared version on the song (newest first, the last 10). */
function remember(app: App, song: Song, code: string) {
  const list = (song.shares ?? []).filter((x) => x.code !== code);
  song.shares = [{ code, at: Date.now() }, ...list].slice(0, 10);
  if (song.tracks.length) void saveToLibrary(song);
  app.renderHeader();
}

/** m:ss of the whole song played once (the chain, repeats and scene tempos included). */
export function songLength(song: Song): string {
  const s = Math.round(wholeSong(song).duration);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Share song: upload, then the code, link, QR code, the phone's share sheet, and earlier versions.
 * `playAs`: how it opens for them, ready to play the whole song (SONG) or scene 1 (SCENE);
 * it's part of what's shared, so each choice has its own code.
 */
export function shareSongDialog(app: App, song: Song = app.song, playAs: "song" | "scene" = app.songMode) {
  const wait = app.overlays.dialog("Share song", () => h("div", { class: "form share" }, h("p", { class: "note big share-wait" }, "Uploading…")));
  void (async () => {
    let res: Shared | null = null, err = "";
    try { res = await upload({ ...song, playAs }); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    if (res?.kind === "server") remember(app, song, res.code);
    app.overlays.remove(wait);
    app.overlays.dialog("Share song", (close) => res ? renderResult(app, song, res, close, playAs)
      : h("div", { class: "form share" }, h("p", { class: "note big" }, err || "Something went wrong"), h("button", { class: "row-btn", "data-nav": "ok", onclick: close }, "Close")));
  })();
}

/** "Opens as": the whole song or scene 1; picking the other one shares again (a different code). */
function opensAs(app: App, song: Song, playAs: "song" | "scene", close: () => void): HTMLElement {
  const steps = songChain(song).length;
  const pick = (m: "song" | "scene", label: string, sub: string) => h("button", {
    class: "opens-btn" + (playAs === m ? " on" : ""), "data-nav": `opens-${m}`, "aria-pressed": String(playAs === m),
    onclick: () => { if (m !== playAs) { close(); shareSongDialog(app, song, m); } },
  }, h("span", null, label), h("small", null, sub));
  return h("div", { class: "opens-as" },
    h("div", { class: "die-label" }, "When they open it, Play plays"),
    h("div", { class: "opens-row" },
      pick("song", "The whole song", `${steps} step${steps > 1 ? "s" : ""} · ${songLength(song)}${song.songLoop ? " · then again" : ""}`),
      pick("scene", "Scene 1", song.sceneLoop === false ? "once" : "on a loop")));
}

function renderResult(app: App, song: Song, res: Shared, close: () => void, playAs: "song" | "scene" = "song"): HTMLElement {
  const qr = res.url.length < 200 ? makeQr(res.url) : null;
  const qrBox = h("div", { class: "share-qr", "aria-label": "QR code of the link" });
  if (qr) qrBox.innerHTML = qrSvg(qr, 5);
  const older = (song.shares ?? []).filter((x) => x.code !== res.code);
  return h("div", { class: "form share song-share" },
    opensAs(app, song, playAs, close),
    res.kind === "server"
      ? h("div", { class: "share-block main" }, h("div", { class: "die-label" }, "Song code"), h("code", { class: "share-code big" }, showCode(res.code)))
      : h("div", { class: "share-block main" }, h("div", { class: "die-label" }, "Offline link"), h("p", { class: "note" }, `Couldn't upload (${res.why}), so here's a link with the whole song inside it. It works without the server; it's just long.`)),
    qr ? qrBox : h("p", { class: "note" }, "The link is too long for a QR code: copy it instead."),
    h("code", { class: "share-link" }, res.url.length > 90 ? `${res.url.slice(0, 70)}…` : res.url),
    h("div", { class: "share-btns" },
      h("button", { class: "small-btn primary", "data-nav": "copy-link", onclick: () => copy(app, res.url, "Link") }, "Copy link"),
      res.kind === "server" ? h("button", { class: "small-btn", "data-nav": "copy-code", onclick: () => copy(app, showCode(res.code), "Code") }, "Copy code") : "",
      "share" in navigator ? h("button", { class: "small-btn", "data-nav": "share-sheet", onclick: () => navigator.share({ title: `TILT: ${song.title}`, text: res.kind === "server" ? `My TILT song “${song.title}”: ${showCode(res.code)}` : `My TILT song “${song.title}”`, url: res.url }).catch(() => {}) }, "Share…") : ""),
    res.left.length ? h("p", { class: "note warn" }, `Shared without ${res.left.length === 1 ? "this sample" : "these samples"} (${res.kind === "link" ? "offline links can't carry samples" : "over the 5 MB limit, or the server's sample storage is off or full"}): ${res.left.join(", ")}. Those pads will be silent for whoever opens it.`) : "",
    h("p", { class: "note" }, "The same song always gets the same code; any change gets a new one. Opening it adds a copy to their Songs: yours stays yours."),
    older.length ? h("div", { class: "share-versions" },
      h("div", { class: "die-label" }, "Shared before"),
      older.map((v) => h("div", { class: "share-version" },
        h("code", null, showCode(v.code)), h("span", { class: "note" }, new Date(v.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })),
        h("button", { class: "small-btn", onclick: () => copy(app, shortLink(v.code), "Link") }, "Copy link")))) : "",
    h("button", { class: "row-btn", "data-nav": "ok", onclick: close }, "Done"));
}

// ---------------------------------------------------------------- opening a shared song

/** Add a shared song to the library as a new song (never over one you have) and open it. */
async function importShared(app: App, song: Song, code: string) {
  const s = normalizeSong(song);
  s.libId = newLibId();
  s.sharedFrom = code;
  delete s.shares;
  await saveToLibrary(s);
  app.engine.stop();
  app.replaceSong(s);
  app.songCur = { row: 0, col: -1 };
  // Set up the way it was shared: the whole song (in chain order, with its repeats) or scene 1.
  app.songMode = s.playAs ?? (songChain(s).length > 1 ? "song" : "scene");
  app.show("song");
  sharedPlayCard(app, s, code);
}

/** A shared song just opened: what it is, and one big Play (browsers want a press before any sound). */
function sharedPlayCard(app: App, s: Song, code: string) {
  const whole = app.songMode === "song", steps = songChain(s).length;
  const what = whole
    ? `The whole song: ${steps} step${steps > 1 ? "s" : ""}, ${songLength(s)}${s.songLoop ? ", then it starts again" : ""}.`
    : `Scene 1${s.sceneLoop === false ? ", once" : ", on a loop"}.`;
  app.overlays.dialog("Shared song", (close) => h("div", { class: "form share shared-open" },
    h("div", { class: "shared-title" }, s.title),
    h("div", { class: "die-label" }, `Shared · ${showCode(code)} · added to your Songs`),
    h("p", { class: "note big" }, what),
    h("button", { class: "row-btn primary play-big", "data-nav": "play", onclick: () => {
      close();
      app.songCur = { row: 0, col: -1 };
      if (whole) app.engine.play({ kind: "song", fromIndex: 0 });
      else app.engine.play({ kind: "scene", sceneId: s.scenes[0].id, once: s.sceneLoop === false });
      app.refresh();
    } }, "▶  Play"),
    h("button", { class: "row-btn", "data-nav": "look", onclick: close }, "Just look around")));
}

/** Fetch a song code from the server; a brand-new code can take a moment to arrive (KV), so retry for a minute. */
export async function openSongCode(app: App, code: string) {
  let cancelled = false, status: HTMLElement | null = null;
  const ov = app.overlays.dialog("Shared song", (close) => {
    status = h("p", { class: "note big share-wait" }, `Loading shared song ${showCode(code)}…`);
    return h("div", { class: "form share" }, status, h("button", { class: "row-btn", "data-nav": "cancel", onclick: () => { cancelled = true; close(); } }, "Cancel"));
  });
  const done = () => app.overlays.remove(ov);
  const t0 = Date.now();
  for (let attempt = 1; !cancelled; attempt++) {
    let r: Response | null = null;
    try { r = await fetch(`/api/share/${code}`); } catch { r = null; }
    if (r?.ok) {
      try {
        const shared = (await r.json()) as SharedSong;
        const why = validateSong(shared.song);
        if (why) throw new Error(why);
        // Its samples: back into this browser under the ids the song's pads use.
        for (const [id, key] of Object.entries(shared.samples ?? {})) {
          const b = await fetch(`/api/sample/${key}`).catch(() => null);
          if (!b?.ok) continue;
          const s = unpackSample(new Uint8Array(await b.arrayBuffer()));
          await putSample(s.name, s.data, s.rate, id);
        }
        done();
        await importShared(app, shared.song, code);
      } catch (e) {
        done();
        app.overlays.toast(`That shared song couldn't be opened: ${e instanceof Error ? e.message : e}`, 4000, { error: true });
      }
      return;
    }
    const gone = r && r.status !== 404; // 400 / 503: no point waiting
    if (gone || Date.now() - t0 > RETRY_FOR_MS) {
      done();
      app.overlays.toast(r?.status === 503 ? "Song sharing isn't set up on this server" : r ? `No song with the code ${showCode(code)}` : "Can't reach the server to open that song", 4000, { error: true });
      return;
    }
    if (status) (status as HTMLElement).textContent = `Loading shared song ${showCode(code)}… (${attempt === 1 ? "it can take a moment for a new code to arrive" : `still looking, ${Math.round((Date.now() - t0) / 1000)} s`})`;
    await new Promise((res) => setTimeout(res, RETRY_EVERY_MS));
  }
}

/** A #song=… link: the whole song is in the address. */
export async function openSongFragment(app: App, frag: string) {
  try {
    const song = await songFromFragment(frag);
    await importShared(app, song, await songCode(song));
  } catch {
    app.overlays.toast("That song link is damaged (copied only part of it?)", 4000, { error: true });
  }
}

/**
 * The one Enter code box: a song code (TILT-XXXXXXXX, 8 characters), a setup code (longer),
 * or a link to either (…/s/CODE, …#song=…, …?code=…).
 */
export async function openCodeOrLink(app: App, text: string): Promise<boolean> {
  const t = text.trim();
  const frag = /#song=([\w-]+)/.exec(t);
  if (frag) { await openSongFragment(app, frag[1]); return true; }
  const path = /\/s\/([0-9A-Za-z]{8})\b/.exec(t);
  const setupParam = /[?&]code=([^&#\s]+)/.exec(t);
  const song = parseSongCode(path ? path[1] : t);
  if (song) { await openSongCode(app, song); return true; }
  const setup = decodeSetup(setupParam ? decodeURIComponent(setupParam[1]) : t);
  if (setup) { openWithSetup(app, setup); app.overlays.toast("Setup code loaded: NEW SONG starts it", 2500); return true; }
  app.overlays.toast("That isn't a song code, a setup code or a TILT link", 3000, { error: true });
  return false;
}

export function enterCodeDialog(app: App) {
  const c = prompt("Song code (TILT-XXXXXXXX), setup code, or a TILT link");
  if (c) void openCodeOrLink(app, c);
}

/** Opened as /s/CODE or with #song=…: load it, then tidy the address. */
export function takeSharedFromUrl(app: App) {
  const m = /^\/s\/([0-9A-Za-z]{8})\/?$/.exec(location.pathname);
  const frag = /^#song=([\w-]+)$/.exec(location.hash);
  if (!m && !frag) return;
  history.replaceState(null, "", `/${location.search}`);
  if (m) { const code = parseSongCode(m[1]); if (code) void openSongCode(app, code); }
  else if (frag) void openSongFragment(app, frag[1]);
}
