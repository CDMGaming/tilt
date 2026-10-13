/** `?sandbox` in the URL uses separate storage, so testing never touches real songs. */
export const STORE_PREFIX = new URLSearchParams(location.search).has("sandbox") ? "rollbox-sandbox." : "rollbox.";
