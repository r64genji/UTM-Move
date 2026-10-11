// Service worker: precaches the whole app, its data and the basemap, so a trip can be planned with no signal.
import { clientsClaim } from 'workbox-core'
import { createHandlerBoundToURL, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { createPartialResponse } from 'workbox-range-requests'
import { NavigationRoute, registerRoute } from 'workbox-routing'

type Worker = {
  addEventListener(type: 'message', fn: (e: { data?: { type?: string } }) => void): void
  skipWaiting(): void
}
const sw = self as unknown as Worker

// A new version waits until the user taps Reload in the app.
sw.addEventListener('message', (e) => e.data?.type === 'SKIP_WAITING' && sw.skipWaiting())
clientsClaim()

// PMTiles reads the map with HTTP Range requests. The cache holds whole files, so cut the slice out of the cached copy.
registerRoute(
  ({ url }) => url.pathname.endsWith('.pmtiles'),
  async ({ request }) => {
    const cached = await matchPrecache(new URL(request.url).pathname)
    return cached ? createPartialResponse(request, cached) : fetch(request)
  },
)

precacheAndRoute((self as unknown as { __WB_MANIFEST: { url: string; revision: string | null }[] }).__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
