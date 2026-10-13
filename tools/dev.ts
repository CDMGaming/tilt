// Dev server launcher. Under Deno, a browser tab closing mid-reload (or a temp
// file vanishing from the watcher) surfaces as an unhandled error that would kill
// Vite. Log those and keep serving instead.
// Run: deno run -A tools/dev.ts
import { createServer } from "npm:vite@^6";

globalThis.addEventListener("unhandledrejection", (e) => {
  console.warn("[dev] ignored:", (e.reason as Error)?.message ?? e.reason);
  e.preventDefault();
});
globalThis.addEventListener("error", (e) => {
  console.warn("[dev] ignored:", e.message);
  e.preventDefault();
});

// Run from the project root whatever the current directory is (paths may contain spaces).
const root = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
Deno.chdir(root);
const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
server.printUrls();
