// The site as Cloudflare runs it, on this computer: the built app, the Pages Functions
// (/api/share, /api/sample, /s/:code) and in-memory KV (SHARES) and R2 (SAMPLES).
// No Node needed: wrangler runs under Deno from its own folder in %TEMP% (installed on the
// first run). Online games (/relay) aren't part of it; `deno run -A tools/relay.ts` is.
//
// Run: deno run -A tools/pages-dev.ts            → http://127.0.0.1:8788

const tmp = Deno.env.get("TEMP") ?? Deno.env.get("TMPDIR") ?? "/tmp";
const W = `${tmp}/tilt-wrangler`, DIST = `${tmp}/tilt-pages-dist`;
const env = { ...Deno.env.toObject(), DENO_TLS_CA_STORE: "system" };
const run = async (args: string[], cwd?: string) => {
  const { code } = await new Deno.Command(Deno.execPath(), { args, cwd, env, stdout: "inherit", stderr: "inherit" }).output();
  if (code) Deno.exit(code);
};

// wrangler gets a node_modules folder of its own: its bundler can't find its dependencies in Deno's shared cache.
try { await Deno.stat(`${W}/node_modules/wrangler/wrangler-dist/cli.js`); } catch {
  console.log("[pages-dev] first run: installing wrangler into", W);
  await Deno.mkdir(W, { recursive: true });
  await Deno.writeTextFile(`${W}/deno.json`, JSON.stringify({ nodeModulesDir: "auto" }));
  await Deno.writeTextFile(`${W}/package.json`, JSON.stringify({ private: true, dependencies: { wrangler: "4.151.0" } }));
  await run(["install", "--allow-scripts=npm:workerd,npm:esbuild,npm:sharp"], W);
}

// Built outside the project, so the Vite dev server's file watcher is left alone.
await run(["run", "-A", "npm:vite", "build", "--outDir", DIST, "--emptyOutDir"]);
await run(["run", "-A", "--config", `${W}/deno.json`, "--unstable-detect-cjs", `${W}/node_modules/wrangler/wrangler-dist/cli.js`,
  "pages", "dev", DIST, "--kv", "SHARES", "--r2", "SAMPLES", "--port", "8788", "--ip", "127.0.0.1"]);
