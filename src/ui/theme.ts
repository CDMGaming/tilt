// Instrument colours. Each instrument has one identity colour (CSS tokens
// --inst-<kind> in style.css are the single source); a second or third track
// of the same instrument gets a lighter / darker shade of it.

import type { InstrumentKind, Track } from "../engine/model";

const cache = new Map<string, string>();

/** Identity colour of an instrument, read from the CSS tokens. */
export function instColor(kind: InstrumentKind): string {
  let c = cache.get(kind);
  if (!c) {
    c = getComputedStyle(document.documentElement).getPropertyValue(`--inst-${kind}`).trim() || "#8f9bbd";
    cache.set(kind, c);
  }
  return c;
}

function mix(hex: string, toward: [number, number, number], amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (toward[i] - v) * amount));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Shade 0 = the identity colour; 1 lighter, 2 darker, 3 lighter still. */
export function trackColor(t: Track): string {
  const base = instColor(t.kind);
  switch (t.color % 4) {
    case 1: return mix(base, [255, 255, 255], 0.38);
    case 2: return mix(base, [0, 0, 0], 0.3);
    case 3: return mix(base, [255, 255, 255], 0.62);
    default: return base;
  }
}
