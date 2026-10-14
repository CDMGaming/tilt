// Production server: the built app (dist/) and the online relay on one port,
// so a player only needs one address (https://... and wss://.../relay).
// Run: deno run --allow-net --allow-read tools/serve.ts [port] [distDir]

import { Rooms, relaySocket } from "./relay.ts";

const port = Number(Deno.args[0] ?? 8097);
const dist = Deno.args[1] ?? "dist";
const rooms = new Rooms();

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json", svg: "image/svg+xml", png: "image/png", webp: "image/webp", ico: "image/x-icon",
  webmanifest: "application/manifest+json", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", txt: "text/plain; charset=utf-8",
};

async function file(path: string): Promise<Response | null> {
  try {
    const body = await Deno.readFile(path);
    const ext = path.split(".").pop()!.toLowerCase();
    // Vite fingerprints everything under assets/: cache it for good. The page itself: always fresh.
    const cache = path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    return new Response(body, { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": cache } });
  } catch {
    return null;
  }
}

Deno.serve({ port, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/relay" || req.headers.get("upgrade") === "websocket") {
    if (req.headers.get("upgrade") !== "websocket") return new Response("Rollbox relay: connect with a WebSocket\n");
    return relaySocket(rooms, req);
  }
  if (url.pathname === "/health") return new Response(JSON.stringify({ ok: true, rooms: rooms.rooms.size }), { headers: { "content-type": "application/json" } });
  const rel = decodeURIComponent(url.pathname).replace(/\\/g, "/");
  if (rel.split("/").includes("..")) return new Response("Bad path", { status: 400 });
  const hit = await file(`${dist}${rel.endsWith("/") ? rel + "index.html" : rel}`);
  if (hit) return hit;
  // A missing file is a 404; anything else (no extension) is the app itself.
  if (/\.[a-z0-9]+$/i.test(rel)) return new Response("Not found", { status: 404 });
  return (await file(`${dist}/index.html`))!;
});
console.log(`[rollbox] app + relay on http://0.0.0.0:${port}`);
