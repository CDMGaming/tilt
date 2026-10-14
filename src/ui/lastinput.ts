// Which input the player used last (mouse, keyboard, gamepad, touch), so hints can
// say "tap", "click", "press Enter" or "press A" to match.

import { isPhone } from "./phone";

export type InputKind = "mouse" | "keyboard" | "gamepad" | "touch";

let last: InputKind | null = null;
let watching = false;

export function watchInput() {
  if (watching) return;
  watching = true;
  window.addEventListener("pointerdown", (e) => (last = e.pointerType === "mouse" ? "mouse" : "touch"), true);
  window.addEventListener("keydown", () => (last = "keyboard"), true);
  window.addEventListener("gamepadconnected", () => pollGamepad());
}

/** Call now and then (every frame is fine): a pressed button or a pushed stick means a gamepad. */
export function pollGamepad() {
  for (const p of navigator.getGamepads?.() ?? []) if (p?.buttons.some((b) => b.pressed) || p?.axes.some((a) => Math.abs(a) > 0.5)) { last = "gamepad"; return; }
}

export const lastInput = (): InputKind => last ?? (isPhone() ? "touch" : "mouse");

/** Pick the hint for the input in use. */
export const byInput = (mouse: string, keyboard: string, gamepad: string, touch: string) =>
  ({ mouse, keyboard, gamepad, touch })[lastInput()];
