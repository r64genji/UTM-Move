import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router'
import { LocationLayers } from '../features/location/LocationLayers.tsx'
import { MapProvider } from '../features/map/MapContext.tsx'
import { Sheet } from './Sheet.tsx'
import { UpdateToast } from './UpdateToast.tsx'

// MapLibre is the heaviest chunk; load it after the panel so the page is usable at once.
const MapView = lazy(() => import('../features/map/MapView.tsx'))

export function Shell() {
  return (
    <MapProvider>
      <div className="shell">
        <Suspense fallback={<div className="map" />}>
          <MapView />
        </Suspense>
        <LocationLayers />
        <Sheet>
          <Outlet />
        </Sheet>
        <UpdateToast />
      </div>
    </MapProvider>
  )
}
