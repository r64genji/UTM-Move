import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { LatLon, Stop } from '../../domain/schemas.ts'
import { MarkerLayer } from '../map/layers.tsx'
import { toLngLat } from '../map/geo.ts'
import { useMap } from '../map/MapContext.tsx'
import { DESKTOP, useMedia } from '../../ui/hooks.ts'

export const TIMETABLE_NOTE = 'Timetable only. No live bus positions.'

/** `carried` is the transit data's `timetableNote`, set while the times are from an earlier session. */
export const Note = ({ carried }: { carried?: string }) => (
  <p className="note">
    {carried ? `${carried} ` : ''}
    {TIMETABLE_NOTE}
  </p>
)

/** Stops as map markers. Tapping one opens its stop page. */
export function StopMarkers({ stops, selectedId }: { stops: Stop[]; selectedId?: string }) {
  const navigate = useNavigate()
  const markers = stops.map((s) => ({ id: s.id, kind: 'stop' as const, position: s.location, label: s.id, selected: s.id === selectedId }))
  return <MarkerLayer markers={markers} onSelect={(m) => navigate(`/stop/${encodeURIComponent(m.id)}`)} />
}

/** Move the map to show these points (clear of the top card on phones, the sheet's padding is already on the map). */
export function FitTo({ points, maxZoom = 17 }: { points: LatLon[]; maxZoom?: number }) {
  const map = useMap()
  const desktop = useMedia(DESKTOP)
  const key = points.map((p) => `${p.lat},${p.lon}`).join(';')
  useEffect(() => {
    if (!map || !points.length) return
    // The bottom sheet eases the map padding on mount; wait so that move does not cancel ours.
    const timer = setTimeout(() => {
      if (points.length === 1) {
        map.easeTo({ center: toLngLat(points[0]), zoom: Math.max(map.getZoom(), 16.5), duration: 400 })
        return
      }
      const lons = points.map((p) => p.lon)
      const lats = points.map((p) => p.lat)
      const sw = toLngLat({ lat: Math.min(...lats), lon: Math.min(...lons) })
      const ne = toLngLat({ lat: Math.max(...lats), lon: Math.max(...lons) })
      // Clear of whatever floats on top of the map on phones (search bar, directions card).
      const covered = desktop ? 0 : (document.querySelector('.map-top, .map-bar, .plan-top, .nav-top')?.getBoundingClientRect().bottom ?? 0)
      map.fitBounds([sw, ne], { padding: { top: Math.max(80, covered + 24), right: 64, bottom: 48, left: 48 }, maxZoom, duration: 400 })
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, maxZoom, desktop])
  return null
}

export const countdown = (min: number) => (min <= 0 ? 'Now' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`)
