import type { Map, Marker } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../app/store.ts'
import { reducedMotion, setInset } from '../map/camera.ts'
import { useMap } from '../map/MapContext.tsx'
import type { UserFix } from '../map/layers.tsx'

// maplibre is already loaded by the map; importing it here keeps it out of the first bundle.
const loadMarker = () => import('maplibre-gl').then((m) => m.Marker)

const div = (className: string, parent?: HTMLElement) => {
  const el = document.createElement('div')
  el.className = className
  parent?.append(el)
  return el
}

/** Diameter of the accuracy circle in screen pixels at the map's current zoom. */
const accPx = (map: Map, fix: UserFix) => Math.min(2400, (2 * fix.accuracy) / ((40_075_017 * Math.cos((fix.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom())))

/**
 * The blue "you are here" dot. A soft halo pulses around it and the accuracy circle fades in. New fixes slide the dot
 * over to the new spot instead of teleporting it.
 */
function UserDot({ fix, keep }: { fix: UserFix | null; keep: boolean }) {
  const map = useMap()
  const dot = useRef<{ marker: Marker; el: HTMLElement; at: number; from: [number, number]; raf: number; shown: [number, number] } | null>(null)
  const live = useRef(false)

  useEffect(() => {
    if (!map || !fix) return
    const to: [number, number] = [fix.lon, fix.lat]
    const set = () => dot.current?.el.style.setProperty('--acc', `${accPx(map, fix)}px`)
    live.current = true
    if (dot.current) {
      const d = dot.current
      d.el.classList.add('in')
      cancelAnimationFrame(d.raf)
      const now = performance.now()
      const ms = Math.min(1200, Math.max(300, now - d.at))
      const from = d.shown
      d.at = now
      // A jump of more than ~150 m is a new place, not a step: no sliding across the campus.
      const far = Math.hypot((to[0] - from[0]) * 111_320 * Math.cos((fix.lat * Math.PI) / 180), (to[1] - from[1]) * 111_320) > 150
      const step = (t: number) => {
        const k = reducedMotion() || far ? 1 : Math.min(1, (t - now) / ms)
        d.shown = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]
        d.marker.setLngLat(d.shown)
        if (k < 1) d.raf = requestAnimationFrame(step)
      }
      step(now)
      set()
      return
    }
    loadMarker().then((Marker) => {
      if (!live.current || dot.current) return
      const el = div('user-dot')
      el.setAttribute('aria-hidden', 'true')
      div('user-acc', el)
      div('user-halo', el)
      div('user-core', el)
      const marker = new Marker({ element: el, pitchAlignment: 'map' }).setLngLat(to).addTo(map)
      dot.current = { marker, el, at: performance.now(), from: to, shown: to, raf: 0 }
      set()
      requestAnimationFrame(() => el.classList.add('in'))
    })
  }, [map, fix])

  // The accuracy circle is sized in pixels, so it follows the zoom.
  useEffect(() => {
    if (!map || !fix) return
    const size = () => dot.current?.el.style.setProperty('--acc', `${accPx(map, fix)}px`)
    map.on('zoom', size)
    return () => void map.off('zoom', size)
  }, [map, fix])

  // No fix any more (permission gone): fade out. While "finding you" the old dot stays so it does not blink.
  useEffect(() => {
    if (fix || keep) return
    live.current = false
    const d = dot.current
    if (!d) return
    d.el.classList.remove('in')
    const timer = setTimeout(() => {
      d.marker.remove()
      cancelAnimationFrame(d.raf)
      if (dot.current === d) dot.current = null
    }, 200)
    return () => clearTimeout(timer)
  }, [fix, keep])

  useEffect(
    () => () => {
      live.current = false
      cancelAnimationFrame(dot.current?.raf ?? 0)
      dot.current?.marker.remove()
      dot.current = null
    },
    [],
  )
  return null
}

/** Everything the location feature draws on the map. Mounted once by the shell. */
export function LocationLayers() {
  const map = useMap()
  const location = useAppStore((s) => s.location)
  const start = useAppStore((s) => s.start)
  const picking = useAppStore((s) => s.picking)
  const setStart = useAppStore((s) => s.setStart)
  const setPicking = useAppStore((s) => s.setPicking)

  // The draggable start pin. Shown only when it says something the blue dot does not: a spot you placed, or a rough fix to correct.
  const lat = start?.lat
  const lon = start?.lon
  const pinned = !!start && (start.source !== 'gps' || location.status === 'low-accuracy')
  const pin = useRef<Marker | null>(null)
  useEffect(() => {
    if (!map || !pinned) return
    let marker: Marker | undefined
    let live = true
    loadMarker().then((Marker) => {
      if (!live) return
      const el = div('start-pin')
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', 'Your start point. Drag to move it.')
      div('start-pin-head', el)
      const m = new Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat([useAppStore.getState().start?.lon ?? 0, useAppStore.getState().start?.lat ?? 0]).addTo(map)
      m.on('dragstart', () => el.classList.add('lift'))
      m.on('dragend', () => {
        el.classList.remove('lift')
        const p = m.getLngLat()
        setStart({ lat: p.lat, lon: p.lng, source: 'pin' })
      })
      marker = pin.current = m
    })
    return () => {
      live = false
      pin.current = null
      const el = marker?.getElement()
      el?.classList.add('leaving')
      setTimeout(() => marker?.remove(), reducedMotion() ? 0 : 160)
    }
  }, [map, pinned, setStart])
  useEffect(() => {
    if (lat !== undefined && lon !== undefined) pin.current?.setLngLat([lon, lat])
  }, [lat, lon])

  // "Pick on map": the next tap sets the start. The panel is hidden meanwhile, so the camera drops the sheet's padding too.
  useEffect(() => {
    if (!map) return
    setInset(map, { hidden: picking })
    if (!picking) return
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

  return <UserDot fix={'fix' in location ? location.fix : null} keep={location.status === 'asking'} />
}
