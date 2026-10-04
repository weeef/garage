// Offline cache for the app shell.
// CACHE is set from package.json's version by `npm run sync-version` (runs on every build/release):
// a new version = a new cache name = phones install the whole new set atomically, then offer a reload.
const CACHE = 'garage-log-1.13.0';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'version.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'lib/car3d.js',
  'lib/carfax.js',
  'lib/carlook.js',
  'lib/fuel.js',
  'lib/logic.js',
  'lib/plates.js',
  'lib/replica.js',
  'lib/sync.js',
  'lib/themes.js',
  'lib/ui-car.js',
  'lib/ui-fuel.js',
  'lib/ui-import.js',
  'lib/ui-receipts.js',
  'lib/ui-registration.js',
  'lib/ui-replica.js',
  'lib/updatebanner.js',
  'lib/workorder.js',
  'lib/vendor/fflate.min.js',
  'lib/vendor/GLTFLoader.js',
  'lib/vendor/pdf.min.js',
  'lib/vendor/pdf.worker.min.js',
  'lib/vendor/three.min.js'
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'garage-log-models' && k !== 'garage-log-receipts').map((k) => caches.delete(k)))) // keep downloaded car models and receipts
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
