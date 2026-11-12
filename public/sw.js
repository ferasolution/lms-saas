// Minimal service worker so the app can be installed on phones ("Add to Home Screen").
// It doesn't cache API data: school information should always be fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
