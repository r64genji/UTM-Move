// Served as /sw.js on utm-move.vercel.app only (the app itself is app-sw.js). The old app's service worker keeps showing the old site there; this one removes itself, clears its caches and reloads the open tabs so they hit the redirect.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k)
      await self.registration.unregister()
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url)
    })(),
  ),
)
