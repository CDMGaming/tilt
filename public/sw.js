// TILT offline cache. The page itself is fetched fresh when there's a
// connection (so a new version shows up at once) and from the cache when
// there isn't; everything else (code, sounds, fonts) is cached on first use.
// Online games (/relay) and /health are never cached.
//
// Never cache an HTML page as a file: for a moment after a deploy the host can answer a
// missing script or stylesheet with the app's page (200, text/html), and a cached copy of
// that would keep TILT broken in this browser for good.
// v2: drops v1, which could hold such pages under script / stylesheet names.
const CACHE = "tilt-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isPage = (res) => (res.headers.get("content-type") ?? "").includes("text/html");

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname === "/relay" || url.pathname === "/health") return;
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && isPage(res)) (await caches.open(CACHE)).put("/", res.clone());
        return res;
      } catch {
        return (await caches.match("/")) ?? Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit && !isPage(hit)) return hit;
    const res = await fetch(req);
    if (res.ok && !isPage(res)) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
