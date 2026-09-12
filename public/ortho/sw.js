const CACHE_NAME = "ortho-v70";
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "src/backup.js",
  "src/dom.js",
  "src/forms/ghf.js",
  "src/forms/ortho-day.js",
  "src/forms/registry.js",
  "src/index.js",
  "src/main.js",
  "src/render.js",
  "src/schema/engine.js",
  "src/schema/report.js",
  "src/score.js",
  "src/state.js",
  "src/util.js",
  "src/views/form.js",
  "src/views/home.js",
  "src/views/summary.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (e.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
