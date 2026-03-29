const CACHE = 'usdt-sender-v1';
const ASSETS = ['/', '/app', '/css/styles.css', '/js/app.js', '/js/config.js', '/usdt-logo.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
