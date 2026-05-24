/* The Primal Path — service worker
   Caches the app shell + all devotional JSON so it works fully offline.
   Bump CACHE_VERSION whenever you add a new week or change the app. */

const CACHE_VERSION = 'primal-path-v1';

// Core files always cached on install.
const CORE_ASSETS = [
  'index.html',
  'app.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'devotionals/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Cache core assets.
    await cache.addAll(CORE_ASSETS);
    // Also cache every week listed in the manifest.
    try {
      const res = await fetch('devotionals/manifest.json', { cache: 'no-cache' });
      const manifest = await res.json();
      const weekFiles = manifest.weeks.map((w) => 'devotionals/' + w.file);
      await cache.addAll(weekFiles);
    } catch (e) {
      /* offline at install — weeks get cached on first online fetch */
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
    );
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Network-first for devotional data (so new weeks appear),
    // falling back to cache when offline.
    if (event.request.url.includes('/devotionals/')) {
      try {
        const fresh = await fetch(event.request);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw e;
      }
    }
    // Cache-first for the app shell.
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      cache.put(event.request, fresh.clone());
      return fresh;
    } catch (e) {
      // last resort: serve index for navigations
      if (event.request.mode === 'navigate') {
        return cache.match('index.html');
      }
      throw e;
    }
  })());
});
