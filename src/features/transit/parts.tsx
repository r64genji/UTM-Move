import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { LatLon, Stop } from '../../domain/schemas.ts'
import { MarkerLayer } from '../map/layers.tsx'
import { setFit } from '../map/camera.ts'
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

/** Show these points above the sheet and clear of the floating cards. The camera lands once (see map/camera.ts). */
export function FitTo({ points, maxZoom = 17 }: { points: LatLon[]; maxZoom?: number }) {
  const map = useMap()
  const desktop = useMedia(DESKTOP)
  const key = points.map((p) => `${p.lat},${p.lon}`).join(';')
  useEffect(() => {
    if (!map || !points.length) return
    // Clear of whatever floats on top of the map on phones (search bar, directions card).
    const covered = desktop ? 0 : (document.querySelector('.map-top, .map-bar, .plan-top, .nav-top')?.getBoundingClientRect().bottom ?? 0)
    return setFit(map, { points, maxZoom, top: Math.max(80, covered + 24) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, maxZoom, desktop])
  return null
}

export const countdown = (min: number) => (min <= 0 ? 'Now' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`)
