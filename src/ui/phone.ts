// Phones (Android and iPhone): a touch screen that's small in at least one
// direction. The layout switches to side rails (landscape) or top and bottom
// bars (portrait), the editor to its compact form, and touch targets grow.
// `?phone` in the address forces it on a desktop, for testing.

const forced = new URLSearchParams(location.search).has("phone");
const query = matchMedia("(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)");

export function isPhone(): boolean { return forced || query.matches; }

/** Keep `body.phone` current (rotating, docking a keyboard) and tell the app when it flips. */
export function watchPhone(onChange: () => void) {
  const apply = () => document.body.classList.toggle("phone", isPhone());
  apply();
  query.addEventListener("change", () => { apply(); onChange(); });
}

/** iPhone: play through the ring/silent switch (Safari 16.4+), like a music app. */
export function audioSessionPlayback() {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try { if (nav.audioSession) nav.audioSession.type = "playback"; } catch { /* older Safari: the switch mutes us */ }
}

/** Ask the browser to keep saved songs even when space is short (granted to installed apps). */
export function keepStorage() {
  void navigator.storage?.persist?.().catch(() => {});
}
