// Time's up, pinball style: the display flashes TILT for about a second with
// a low buzz and a thunk (like a machine's tilt warning), then the song is done.

import type { App } from "./app";
import { h } from "./dom";
import { dmdText } from "./dmd";

/** The buzz: a low sawtooth through a lowpass, with a short thump at the start. Made here, no sound files. */
function buzz(ctx: AudioContext) {
  const t = ctx.currentTime + 0.01, out = ctx.createGain();
  out.gain.value = 0.32;
  out.connect(ctx.destination);
  const saw = ctx.createOscillator(), lp = ctx.createBiquadFilter(), env = ctx.createGain();
  saw.type = "sawtooth";
  saw.frequency.setValueAtTime(58, t);
  saw.frequency.linearRampToValueAtTime(52, t + 0.55);
  lp.type = "lowpass";
  lp.frequency.value = 700;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(1, t + 0.015);
  env.gain.setValueAtTime(1, t + 0.42);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  saw.connect(lp).connect(env).connect(out);
  const thump = ctx.createOscillator(), te = ctx.createGain();
  thump.frequency.setValueAtTime(140, t);
  thump.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  te.gain.setValueAtTime(1.4, t);
  te.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  thump.connect(te).connect(out);
  for (const o of [saw, thump]) { o.start(t); o.stop(t + 0.65); }
  setTimeout(() => out.disconnect(), 1000);
}

/** Flash TILT (about a second), then call `after`. */
export function tiltFlash(app: App, after: () => void) {
  try { if (app.engine.ctx.state !== "running") void app.engine.ctx.resume(); buzz(app.engine.ctx); } catch { /* no audio: the flash still shows */ }
  const el = h("div", { class: "tilt-flash", role: "alert", "aria-label": "Tilt" }, dmdText("TILT", { height: 120, slant: 7 }));
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); after(); }, 1100);
}
