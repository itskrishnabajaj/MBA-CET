/* ============================================================
   MBA-CET EXAM SIMULATOR — service-worker.js
   Offline-first, cache-first strategy for all assets
   ============================================================ */

const CACHE_NAME  = 'mba-cet-v1.0';
const STATIC_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Fonts (Google Fonts CDN — cache on first load)
const FONT_CACHE_NAME = 'mba-cet-fonts-v1.0';

// ============================================================
// INSTALL — Pre-cache all static assets
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_URLS))
      .then(() => self.skipWaiting())
      .catch(err => {
        // Even if some assets fail (e.g. icons not yet generated), proceed
        console.warn('[SW] Install cache partial failure:', err);
        return self.skipWaiting();
      })
  );
});

// ============================================================
// ACTIVATE — Clean up old caches
// ============================================================
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME, FONT_CACHE_NAME];

  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => !currentCaches.includes(name))
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — Cache-first strategy
// ============================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip browser extension requests
  if (!url.protocol.startsWith('http')) return;

  // Google Fonts — network-first with font cache fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // App assets — cache-first, then network
  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline fallback: serve index.html for navigation requests
        if (request.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        return new Response(
          JSON.stringify({ error: 'Offline', message: 'Resource not available offline.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })
  );
});

// ============================================================
// MESSAGE — Force update from client
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
