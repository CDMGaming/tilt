import { defineConfig } from "vite";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

/** Shown in Help → About: the date, and the commit when it's known. */
function build(): string {
  let sha = process.env.GITHUB_SHA ?? "";
  if (!sha) { try { sha = execSync("git rev-parse HEAD").toString().trim(); } catch { /* not a checkout */ } }
  return `${new Date().toISOString().slice(0, 10)}${sha ? ` · ${sha.slice(0, 7)}` : ""}`;
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build()) },
  server: {
    port: 5178,
    strictPort: true,
    // Under Deno the file watcher dies if a watched build file disappears.
    watch: { ignored: ["**/dist/**", "**/tests/**", "**/docs/**", "**/sed*", "**/*.tmp", "**/*~"] },
  },
  build: {
    target: "es2022", // Chrome/Edge first; top-level await is fine
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        latency: resolve(__dirname, "latency.html"),
      },
    },
  },
});
