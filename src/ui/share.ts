// Share a song's setup code (key, scale, tempo, swing, instruments, sounds; not the notes)
// as a code, a link that opens TILT with it loaded, or the phone's share sheet.

import { decodeSetup, encodeSetup, setupFromSong, type Setup } from "../engine/dice";
import type { Song } from "../engine/model";
import type { App } from "./app";
import { h } from "./dom";

/** A link that opens TILT on the setup screen with this code loaded. */
export function codeLink(code: string): string {
  return `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
}

async function copy(app: App, text: string, what: string) {
  try { await navigator.clipboard.writeText(text); app.overlays.toast(`${what} copied`, 1200); }
  catch { prompt(what, text); }
}

/** The setup screen with this code loaded, ready for NEW SONG. */
export function openWithSetup(app: App, s: Setup) {
  app.dice.setup = s;
  app.saveDice();
  app.openDice?.();
}

/** Share dialog: the code for the song as it is now, and the one it started from if that differs. */
export function shareCodeDialog(app: App, song: Song = app.song) {
  const now = setupFromSong(song);
  const nowCode = now ? encodeSetup(now) : "";
  const started = song.setupCode && song.setupCode !== nowCode ? song.setupCode : "";
  const block = (label: string, code: string, main: boolean) => h("div", { class: "share-block" + (main ? " main" : "") },
    h("div", { class: "die-label" }, label),
    h("code", { class: "share-code" }, code),
    h("div", { class: "share-btns" },
      h("button", { class: "small-btn" + (main ? " primary" : ""), "data-nav": `copy-${label}`, onclick: () => copy(app, code, "Code") }, "Copy code"),
      h("button", { class: "small-btn", "data-nav": `link-${label}`, onclick: () => copy(app, codeLink(code), "Link") }, "Copy link"),
      "share" in navigator ? h("button", { class: "small-btn", "data-nav": `share-${label}`, onclick: () => navigator.share({ title: `TILT: ${song.title}`, text: `Start a TILT song from my setup: ${code}`, url: codeLink(code) }).catch(() => {}) }, "Share…") : "",
      h("button", { class: "small-btn", "data-nav": `new-${label}`, title: "Open the setup screen with this code, ready for NEW SONG", onclick: () => { close(); const s = decodeSetup(code); if (s) openWithSetup(app, s); } }, "New song from it")));
  let close = () => {};
  app.overlays.dialog("Share setup code", (c) => {
    close = c;
    return h("div", { class: "form share" },
      now ? block(started ? "This song now" : "This song", nowCode, true) : h("p", { class: "note" }, "Add an instrument first: the code is built from the song's instruments."),
      started ? block("Started from", started, false) : "",
      h("p", { class: "note" }, "A code (or the link) brings back the key, scale, tempo, swing, instruments and their sounds. Not the notes: to send the whole song, use Songs… → Export song file."),
      now && song.tracks.length > 8 ? h("p", { class: "note" }, "Only the first 8 instruments fit in a code.") : "",
      h("button", { class: "row-btn", "data-nav": "ok", onclick: () => c() }, "Done"));
  });
}

/** ?code=… in the address: load it on the setup screen, then tidy the address. */
export function takeCodeFromUrl(app: App) {
  const q = new URLSearchParams(location.search);
  const code = q.get("code");
  if (!code) return;
  q.delete("code");
  history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}${location.hash}`);
  const s = decodeSetup(code);
  if (!s) { app.overlays.toast("That link's code doesn't decode", 2500, { error: true }); return; }
  openWithSetup(app, s);
  app.overlays.toast(`Code ${code} loaded: NEW SONG starts it`, 3000);
}
