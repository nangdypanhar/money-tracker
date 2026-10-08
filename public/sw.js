/*
 * MoneyTrack service worker — offline support only; no data leaves the device (data lives in IndexedDB).
 * Registered as /sw.js?v=<build version>: each build installs a fresh worker with its own cache,
 * and old caches are deleted on activate.
 *
 * - Install: precache every screen and the /_next/static assets those pages reference, so the
 *   installed app works fully offline, including screens never opened before.
 * - Pages: network first (3s timeout on a weak connection), then the cached copy.
 * - Build assets, fonts, icons: cache first (their URLs are content-hashed).
 * - /reset.html is never cached: it must always be the real escape hatch.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `moneytrack-${VERSION}`;
const ROUTES = [
  "/",
  "/transactions",
  "/budget",
  "/budget/breakdown",
  "/budget/report",
  "/budget/limits",
  "/more",
  "/accounts",
  "/goals",
  "/categories",
  "/backup",
  "/security",
];
const FILES = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"];
const NETWORK_TIMEOUT_MS = 3000;

async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set(FILES);
  await Promise.all(
    ROUTES.map(async (route) => {
      try {
        const response = await fetch(route, { cache: "reload" });
        if (!response.ok) return;
        const html = await response.clone().text();
        for (const match of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(match[0]);
        await cache.put(route, response);
      } catch {
        // Offline during install: that page will be cached the first time it's visited.
      }
    }),
  );
  await Promise.all(
    [...assets].map((url) =>
      cache.add(url).catch(() => {
        // One missing asset shouldn't stop the install.
      }),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("moneytrack-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function putInCache(request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/reset.html" || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const network = fetch(request);
        try {
          const response = await withTimeout(network, NETWORK_TIMEOUT_MS);
          event.waitUntil(putInCache(url.pathname, response.clone()));
          return response;
        } catch {
          // Pages are cached by path, so "/?refreshed=…" still finds "/".
          const cached = (await caches.match(url.pathname)) ?? (await caches.match(request, { ignoreSearch: true }));
          if (cached) return cached;
          try {
            return await network; // slow but not offline: keep waiting rather than fail
          } catch {
            return (await caches.match("/")) ?? Response.error();
          }
        }
      })(),
    );
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|svg|png|ico|webmanifest)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            event.waitUntil(putInCache(request, response.clone()));
            return response;
          }),
      ),
    );
    return;
  }

  // Other same-origin requests (e.g. RSC payloads for client navigation): network, then cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        event.waitUntil(putInCache(request, response.clone()));
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? Response.error()),
  );
});
