import { prepareStorage } from "./migrate";

/** `?sandbox` in the URL uses separate storage, so testing never touches real songs. */
// `?sandbox=b` gives a second, separate sandbox (two tabs testing an online game).
const sandbox = new URLSearchParams(location.search).get("sandbox");
const suffix = sandbox === null ? "." : sandbox ? `-sandbox-${sandbox}.` : "-sandbox.";

/** Where saved data lived before the app was called TILT (copied over on first launch, never deleted). */
export const OLD_PREFIX = "rollbox" + suffix;

// Everything that reads storage imports this module, so this runs first.
export const STORE_PREFIX = await prepareStorage("tilt" + suffix, OLD_PREFIX);
