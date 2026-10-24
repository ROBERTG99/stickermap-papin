/* Mapa Papin service worker: offline shell, runtime caches and the Android share target.
   Plain JS on purpose (no build step): everything is cached as it is used, so there is no precache manifest to keep in sync. */
const VERSION = "mp-v3";
const SHELL = `${VERSION}-shell`; // hashed JS/CSS/fonts/flags/icons + index.html
const IMAGES = `${VERSION}-img`; // /img/thumb|display|icons (immutable)
const DATA = `${VERSION}-data`; // GET /api/*
const TILES = `${VERSION}-tiles`; // OpenFreeMap style, tiles, glyphs, sprites
const SHARE = "mp-share"; // files received through the share target (not versioned: survives updates)
const MAX = { [IMAGES]: 400, [TILES]: 800 };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, IMAGES, DATA, TILES, SHARE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trim(name) {
  const max = MAX[name];
  if (!max) return;
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

const cacheFirst = (cacheName) => async (request) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") { await cache.put(request, res.clone()); void trim(cacheName); }
  return res;
};

const staleWhileRevalidate = (cacheName) => async (request, event) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => { if (res.ok) { void cache.put(request, res.clone()).then(() => trim(cacheName)); } return res; });
  if (hit) { event.waitUntil(refresh.catch(() => {})); return hit; }
  return refresh;
};

/** Network first, but a slow or dead network falls back to the last copy ("Mostramos lo último que viste"). */
const networkFirst = (cacheName, timeoutMs) => async (request) => {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))]);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
};

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("photos").filter((f) => f instanceof File);
    const cache = await caches.open(SHARE);
    for (const key of await cache.keys()) await cache.delete(key);
    await Promise.all(files.map((file, i) => cache.put(`/__share/${i}`, new Response(file, { headers: { "Content-Type": file.type, "X-Name": encodeURIComponent(file.name) } }))));
  } catch {
    /* an empty share still opens the add screen */
  }
  return Response.redirect("/compartir", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.origin === location.origin && url.pathname === "/compartir") {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== "GET") return;

  if (url.origin === "https://tiles.openfreemap.org" || url.origin === "https://tiles.maps.eox.at") {
    event.respondWith(staleWhileRevalidate(TILES)(request, event).catch(() => Response.error()));
    return;
  }
  if (url.origin !== location.origin) return;
  // admin and private data are never cached
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/dev")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(request); } catch {
        const cache = await caches.open(SHELL);
        return (await cache.match("/")) ?? (await cache.match("/index.html")) ?? Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/img/")) { event.respondWith(cacheFirst(IMAGES)(request)); return; }
  if (/^\/(assets|flags|icons)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(SHELL)(request)); return;
  }
  if (url.pathname === "/api/spots") { event.respondWith(networkFirst(DATA, 4000)(request)); return; }
  if (/^\/api\/(types|people|stats|config)$/.test(url.pathname)) { event.respondWith(staleWhileRevalidate(DATA)(request, event)); return; }
});

// The app shell must be available offline after the first visit: warm index.html once the SW is active.
self.addEventListener("message", (event) => {
  if (event.data === "warm-shell") event.waitUntil(caches.open(SHELL).then((c) => c.add("/")).catch(() => {}));
});
