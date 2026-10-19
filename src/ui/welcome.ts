// Welcome back: a small card when TILT reopens the song you left, with a new song one click away.
// It goes by itself after a while, or as soon as you do something.

import type { App } from "./app";
import { h } from "./dom";

export function welcomeBack(app: App) {
  const close = () => { card.classList.add("out"); setTimeout(() => card.remove(), 300); removeEventListener("keydown", close); };
  const card = h("div", { class: "welcome-back", role: "status" },
    h("div", { class: "wb-text" }, h("span", { class: "wb-label" }, "Welcome back"), h("span", { class: "wb-title" }, `“${app.song.title}”`)),
    h("button", { class: "small-btn", "data-nav": "wb-keep", onclick: close }, "Keep going"),
    h("button", { class: "small-btn primary", "data-nav": "wb-new", onclick: () => { close(); app.stopLocal(); app.openDice?.(); } }, "New song ▶"));
  document.body.appendChild(card);
  setTimeout(close, 12000);
  setTimeout(() => addEventListener("keydown", close, { once: true }), 500);
}
