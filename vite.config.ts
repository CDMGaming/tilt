import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: {
    port: 5178,
    strictPort: true,
    // Under Deno the file watcher dies if a watched build file disappears.
    watch: { ignored: ["**/dist/**", "**/tests/**", "**/docs/**"] },
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
