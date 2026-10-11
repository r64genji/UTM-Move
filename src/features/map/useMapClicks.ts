import { useEffect, useRef } from 'react'
import type { LatLon } from '../../domain/schemas.ts'
import { useMap } from './MapContext.tsx'

/** Call `onClick` with the tapped point while mounted. */
export function useMapClicks(onClick: (p: LatLon) => void) {
  const map = useMap()
  const cb = useRef(onClick)
  useEffect(() => void (cb.current = onClick))
  useEffect(() => {
    if (!map) return
    const click = (e: { lngLat: { lat: number; lng: number } }) => cb.current({ lat: e.lngLat.lat, lon: e.lngLat.lng })
    map.on('click', click)
    return () => void map.off('click', click)
  }, [map])
}
