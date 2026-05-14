const CACHE_NAME = 'esp32-hub-v14-pwa';
const APP_SHELL = [
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null))).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // API harus network-first agar data sensor/grafik tidak stale.
  if (isApiRequest(url)) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({detail:'offline'}), {
      status: 503,
      headers: {'Content-Type':'application/json'}
    })));
    return;
  }

  // Navigasi halaman: network-first, fallback ke cached index/offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
        return res;
      }).catch(async () => {
        return (await caches.match('/index.html')) || (await caches.match('/offline.html'));
      })
    );
    return;
  }

  // Asset static: cache-first, lalu update cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
