// Jam of the day: one setup per day, the same for everyone (seeded from the UTC date), shared as an
// ordinary setup code. No accounts, no streaks: just a common starting point for the day.

import { NO_HOLDS, defaultSpec, encodeSetup, nudgeSetup, type Setup } from "./dice";

/** "2026-10-19" in UTC, so everyone's day changes at the same moment. */
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** A 32-bit seed from the day (FNV-1a over the date string). */
export function daySeed(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h || 1;
}

/** Today's setup and its share code. */
export function jamOfTheDay(d = new Date()): { day: string; setup: Setup; code: string } {
  const day = dayKey(d);
  const setup = nudgeSetup(null, NO_HOLDS, defaultSpec(), daySeed(day), 0, { genShare: 0 });
  return { day, setup, code: encodeSetup(setup) };
}
