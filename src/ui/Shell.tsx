import { lazy, Suspense } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAppStore } from '../features/app/store.ts'
import { useUserLocation } from '../features/location/useUserLocation.ts'
import { LocateButton } from '../features/location/LocateButton.tsx'
import { LocationLayers } from '../features/location/LocationLayers.tsx'
import { MapProvider } from '../features/map/MapContext.tsx'
import { DESKTOP, useDragScroll, useMedia, usePresence } from './hooks.ts'
import { Icon } from './icons.tsx'
import { TabBar, useActiveTab } from './TabBar.tsx'
import { UpdateToast } from './UpdateToast.tsx'

// MapLibre is the heaviest chunk; load it after the panel so the page is usable at once.
const MapView = lazy(() => import('../features/map/MapView.tsx'))

function Sidebar({ tab }: { tab: number }) {
  // Explore and Routes are one mode here, Navigate is the other. Contribute and the disclaimer are neither.
  const directions = tab === 2
  const routes = tab < 2
  return (
    <>
      <header className="side-head">
        <p className="brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          UTM Move
        </p>
      </header>
      <div className="mode-switch" role="group" aria-label="Mode">
        <Link to="/" aria-current={routes ? 'page' : undefined}>
          <Icon name="map" size={18} />
          Routes
        </Link>
        <Link to="/plan" aria-current={directions ? 'page' : undefined}>
          <Icon name="go" size={18} />
          Directions
        </Link>
      </div>
    </>
  )
}

function PickBanner({ leaving }: { leaving: boolean }) {
  const { cancelPick } = useUserLocation()
  return (
    <div className="pick-banner" role="status" data-leaving={leaving || undefined}>
      Tap the map where you are starting.
      <button type="button" className="btn btn-quiet" onClick={cancelPick}>
        Cancel
      </button>
    </div>
  )
}

export function Shell() {
  useDragScroll()
  const desktop = useMedia(DESKTOP)
  const picking = useAppStore((s) => s.picking)
  const banner = usePresence(picking)
  const tab = useActiveTab()
  // Live navigation takes the whole screen, like a car sat-nav: no tab bar.
  const navigating = useLocation().pathname.startsWith('/navigate')
  return (
    <MapProvider>
      <div className="shell" data-picking={picking || undefined} data-navigating={navigating || undefined}>
        <Suspense fallback={<div className="map" />}>
          <MapView />
        </Suspense>
        {/* Before the dot: a new fix starts the camera's move first, and the dot then slides over in the same time. */}
        <LocateButton />
        <LocationLayers />
        <div className="side">
          {desktop && <Sidebar tab={tab} />}
          <main className="panel">
            <Outlet />
          </main>
          {desktop && (
            <footer className="side-foot">
              <span>© UTM 2026</span>
              <Link to="/info">Info</Link>
              <Link to="/contribute">Contribute</Link>
            </footer>
          )}
        </div>
        {!desktop && <TabBar active={tab} />}
        {banner.mounted && <PickBanner leaving={banner.leaving} />}
        <UpdateToast />
      </div>
    </MapProvider>
  )
}
