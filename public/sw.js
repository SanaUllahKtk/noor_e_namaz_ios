// Service Worker for 100% Offline Caching
// Noor-e-Namaz | Technology Tycoons

const CACHE_NAME = 'noor-namaz-cache-v35';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/quran-segments.js',
  './js/prayer-calc.js',
  './js/cities-db.js',
  './js/audio-synth.js',
  './js/quran-data.js',
  './js/quran-meta.js',
  './js/wazaif-data.js',
  './js/islamic-knowledge.js',
  './js/storage.js',
  './audio/adhan.mp3',
  './audio/adhan-mishary.mp3',
  './audio/adhan-makkah.mp3',
  './audio/surahs/001.mp3',
  './audio/surahs/108.mp3',
  './audio/surahs/112.mp3',
  './audio/surahs/113.mp3',
  './audio/surahs/114.mp3',
  './audio/surahs/002255.mp3',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Pre-caching offline assets for Technology Tycoons Noor-e-Namaz...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Some cache items failed to prefetch, continuing...', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for code & markup (JS, CSS, HTML, JSON) to ensure instant updates
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for media assets (mp3, icons, etc.) for fastest offline playback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// Focus or open app window when user taps notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
