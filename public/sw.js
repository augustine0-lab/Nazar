/*
 * Nazar service worker.
 *
 * What it keeps on the device: the app's own code, fonts, icons and camera models (files that are the same for
 * everyone), so the app opens fast and the camera features do not download their models again.
 * What it never keeps: pages and answers from the server. They hold children's data, and a phone or a school tablet
 * is often shared, so without internet the app shows the offline screen instead of an old copy of a page.
 */
const VERSION = "v1";
const SHELL = `nazar-shell-${VERSION}`;
const STATIC = `nazar-static-${VERSION}`;
const VISION = `nazar-vision-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon.svg", "/icons/icon-192.png", "/icons/apple-touch-icon.png"];
const STATIC_LIMIT = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, STATIC, VISION]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("nazar-") && !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

/** Files whose address changes when their content changes: once fetched, the copy on the device is always right. */
async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    if (limit) void trim(cacheName, limit);
  }
  return response;
}

/** Icons and the offline screen: answer from the device, refresh the copy in the background. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // forms and server actions always go to the server
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Pages always come from the server. Without a connection, the offline screen.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE)) || new Response("Offline", { status: 503 })),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC, STATIC_LIMIT));
    return;
  }
  if (url.pathname.startsWith("/vision/")) {
    event.respondWith(cacheFirst(request, VISION));
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname === OFFLINE) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else (/api, page data, images from the server) goes to the network as usual.
});
