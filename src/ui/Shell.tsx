import { lazy, Suspense } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAppStore } from '../features/app/store.ts'
import { useUserLocation } from '../features/location/useUserLocation.ts'
import { LocateButton } from '../features/location/LocateButton.tsx'
import { LocationLayers } from '../features/location/LocationLayers.tsx'
import { MapProvider } from '../features/map/MapContext.tsx'
import { DESKTOP, useDragScroll, useMedia } from './hooks.ts'
import { Icon } from './icons.tsx'
import { TabBar } from './TabBar.tsx'
import { UpdateToast } from './UpdateToast.tsx'

// MapLibre is the heaviest chunk; load it after the panel so the page is usable at once.
const MapView = lazy(() => import('../features/map/MapView.tsx'))

function Sidebar() {
  const { pathname } = useLocation()
  const directions = /^\/(plan|navigate|search)/.test(pathname)
  return (
    <>
      <header className="side-head">
        <p className="brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          UTM Move
        </p>
      </header>
      <div className="mode-switch" role="group" aria-label="Mode">
        <Link to="/" aria-current={directions ? undefined : 'page'}>
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

function PickBanner() {
  const { cancelPick } = useUserLocation()
  return (
    <div className="pick-banner" role="status">
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
  // Live navigation takes the whole screen, like a car sat-nav: no tab bar.
  const navigating = useLocation().pathname.startsWith('/navigate')
  return (
    <MapProvider>
      <div className="shell" data-picking={picking || undefined} data-navigating={navigating || undefined}>
        <Suspense fallback={<div className="map" />}>
          <MapView />
        </Suspense>
        <LocationLayers />
        <LocateButton />
        <div className="side">
          {desktop && <Sidebar />}
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
        {!desktop && !navigating && <TabBar />}
        {picking && <PickBanner />}
        <UpdateToast />
      </div>
    </MapProvider>
  )
}
