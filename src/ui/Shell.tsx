import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router'
import { MapProvider } from '../features/map/MapContext.tsx'
import { Sheet } from './Sheet.tsx'

// MapLibre is the heaviest chunk; load it after the panel so the page is usable at once.
const MapView = lazy(() => import('../features/map/MapView.tsx'))

export function Shell() {
  return (
    <MapProvider>
      <div className="shell">
        <Suspense fallback={<div className="map" />}>
          <MapView />
        </Suspense>
        <Sheet>
          <Outlet />
        </Sheet>
      </div>
    </MapProvider>
  )
}
