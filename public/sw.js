/* Pitchline service worker — installable PWA + offline shell.
   Conservative on purpose: API responses are never cached (dynamic/auth), pages are network-first
   (so the app always updates when online), static assets are cache-first (Vite hashes their names). */
const CACHE = 'pitchline-v1';
const SHELL = '/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // only same-origin
  if (url.pathname.startsWith('/api/')) return;       // never cache the API

  if (request.mode === 'navigate') {
    // Network-first for page loads; fall back to the cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((response) => { const copy = response.clone(); caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => undefined); return response; })
        .catch(() => caches.match(SHELL).then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // Static assets: serve from cache first, then network (and cache a copy of successful same-origin responses).
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
      }
      return response;
    }).catch(() => cached))
  );
});
