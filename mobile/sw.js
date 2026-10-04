// Offline cache for the app shell.
// CACHE is set from package.json's version by `npm run sync-version` (runs on every build/release):
// a new version = a new cache name = phones install the whole new set atomically, then offer a reload.
const CACHE = 'garage-log-1.5.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'logic.js', 'sync.js', 'carfax.js', 'workorder.js', 'car3d.js', 'vendor/three.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'version.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cache:'reload' bypasses the browser's HTTP cache so a new version never installs stale files.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first from this version's cache; fall back to the network (and the app shell when offline).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
        return Response.error();
      }
    })
  );
});
