import { useEffect, useRef } from 'react'
import { useAppStore } from '../app/store.ts'
import { Icon } from '../../ui/icons.tsx'
import { toLngLat } from '../map/geo.ts'
import { useMap } from '../map/MapContext.tsx'
import { requestLocation } from './useUserLocation.ts'

/** Map button: ask for a fix and centre the map on it. */
export function LocateButton() {
  const map = useMap()
  const location = useAppStore((s) => s.location)
  const wanted = useRef(false)
  useEffect(() => {
    if (!wanted.current || !map || !('fix' in location)) return
    wanted.current = false
    map.easeTo({ center: toLngLat(location.fix), zoom: Math.max(map.getZoom(), 16.5), duration: 500 })
  }, [map, location])
  return (
    <button
      type="button"
      className="map-locate"
      aria-label="Show my location"
      onClick={() => {
        wanted.current = true
        requestLocation()
      }}
    >
      <Icon name="locate" size={22} />
    </button>
  )
}
