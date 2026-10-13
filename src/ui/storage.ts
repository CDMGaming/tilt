/** `?sandbox` in the URL uses separate storage, so testing never touches real songs. */
// `?sandbox=b` gives a second, separate sandbox (two tabs testing an online game).
const sandbox = new URLSearchParams(location.search).get("sandbox");
export const STORE_PREFIX = sandbox === null ? "rollbox." : sandbox ? `rollbox-sandbox-${sandbox}.` : "rollbox-sandbox.";
