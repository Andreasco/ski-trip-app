// Bump on every release so old caches are replaced.
const VERSION = "discesa-v50";

const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/og.jpg",
  "css/style.css", "css/fonts.css", "js/data.js", "js/budget.js", "js/store.js", "js/painter.js", "js/app.js",
  "fonts/Barlow-400.woff2", "fonts/Barlow-600.woff2", "fonts/Barlow-800.woff2", "fonts/BowlbyOne-400.woff2", "fonts/ShantellSans-500.woff2",
  "vendor/maplibre-gl.js", "vendor/maplibre-gl.css",
];
const DEM = { alpe: [1058, 735], thorens: [1061, 734], tignes: [1063, 733], serre: [1061, 737] };
const OPTIONAL = Object.entries(DEM).flatMap(([id, [cx, cy]]) => [
  `data/pistes-${id}.geojson`,
  ...[-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => `data/dem/${id}/${cx + dx}_${cy + dy}.png`)),
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then(async (cache) => {
    await cache.addAll(SHELL);
    await Promise.allSettled(OPTIONAL.map((file) => cache.add(file)));
    self.skipWaiting();
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;

  const save = async (response) => {
    // Saved without the fragment, so a personal code in a link never stays in the cache.
    if (response.ok) (await caches.open(VERSION)).put(request.url.split("#")[0], response.clone());
    return response;
  };

  // Heavy files never change; everything else tries the network briefly, so updates reach everyone.
  if (/\/(fonts|vendor|data\/dem|icons)\//.test(request.url)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then(save)));
    return;
  }
  const network = fetch(request).then(save);
  const timeout = new Promise((_, reject) => setTimeout(reject, 3000));
  event.respondWith(Promise.race([network, timeout]).catch(() => caches.match(request)
    .then((hit) => hit || (request.mode === "navigate" ? caches.match("index.html") : network))));
});
