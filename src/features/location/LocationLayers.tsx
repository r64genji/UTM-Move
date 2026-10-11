import { Marker } from 'maplibre-gl'
import { useEffect } from 'react'
import { useAppStore } from '../app/store.ts'
import { useMap } from '../map/MapContext.tsx'
import { UserLocationLayer } from '../map/layers.tsx'

/** Everything the location feature draws on the map. Mounted once by the shell. */
export function LocationLayers() {
  const map = useMap()
  const location = useAppStore((s) => s.location)
  const start = useAppStore((s) => s.start)
  const picking = useAppStore((s) => s.picking)
  const setStart = useAppStore((s) => s.setStart)
  const setPicking = useAppStore((s) => s.setPicking)
  const setSheet = useAppStore((s) => s.setSheet)

  // The draggable start pin.
  const lat = start?.lat
  const lon = start?.lon
  useEffect(() => {
    if (!map || lat === undefined || lon === undefined) return
    const el = document.createElement('div')
    el.className = 'start-pin'
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Your start point. Drag to move it.')
    const marker = new Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      setStart({ lat: p.lat, lon: p.lng, source: 'pin' })
    })
    return () => void marker.remove()
  }, [map, lat, lon, setStart])

  // "Pick on map": the next tap sets the start.
  useEffect(() => {
    if (!map || !picking) return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    map.once('click', (e) => {
      setStart({ lat: e.lngLat.lat, lon: e.lngLat.lng, source: 'map' })
      setPicking(false)
      setSheet('half')
    })
    return () => {
      canvas.style.cursor = ''
    }
  }, [map, picking, setStart, setPicking, setSheet])

  return <UserLocationLayer fix={'fix' in location ? location.fix : null} />
}
