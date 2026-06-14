// Service worker — makes the dashboard open offline.
// RELEASE RULE: when index.html bumps its ?v= asset versions, bump CACHE here
// too (md-cache-v2, v3, …) and update the SHELL list to the new ?v= URLs.
const CACHE = "md-cache-v4";

const SHELL = [
  "index.html",
  "css/style.css?v=7",
  "js/crypto.js?v=7",
  "js/data.encrypted.js?v=7",
  "js/app.js?v=7",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Navigations: network-first so updates arrive when online,
  // cached index.html as the offline fallback.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Same-origin assets: cache-first, fall back to network and cache the result.
  if (new URL(req.url).origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});
