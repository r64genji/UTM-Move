import type { Marker } from 'maplibre-gl'
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

  // The draggable start pin.
  const lat = start?.lat
  const lon = start?.lon
  useEffect(() => {
    if (!map || lat === undefined || lon === undefined) return
    let marker: Marker | undefined
    let live = true
    // maplibre is already loaded by the map; importing it here keeps it out of the first bundle.
    import('maplibre-gl').then(({ Marker }) => {
      if (!live) return
      const el = document.createElement('div')
      el.className = 'start-pin'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', 'Your start point. Drag to move it.')
      const m = new Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map)
      m.on('dragend', () => {
        const p = m.getLngLat()
        setStart({ lat: p.lat, lon: p.lng, source: 'pin' })
      })
      marker = m
    })
    return () => {
      live = false
      marker?.remove()
    }
  }, [map, lat, lon, setStart])

  // "Pick on map": the next tap sets the start.
  useEffect(() => {
    if (!map || !picking) return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    map.once('click', (e) => {
      setStart({ lat: e.lngLat.lat, lon: e.lngLat.lng, source: 'map' })
      setPicking(false)
    })
    return () => {
      canvas.style.cursor = ''
    }
  }, [map, picking, setStart, setPicking])

  return <UserLocationLayer fix={'fix' in location ? location.fix : null} />
}
