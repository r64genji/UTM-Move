// Declarative overlay API. Render these anywhere under <MapProvider>; they draw while mounted.
import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import type { Feature, FeatureCollection } from 'geojson'
import type { LatLon } from '../../domain/schemas.ts'
import { reducedMotion } from './camera.ts'
import { toLngLat } from './geo.ts'
import { useMap } from './MapContext.tsx'

export type RouteLeg =
  /** `likely` = shortcut not yet verified (dashed). `covered` = sheltered walkway (roof band). */
  | { mode: 'walk'; path: LatLon[]; style?: 'normal' | 'likely' | 'covered' }
  | { mode: 'bus'; path: LatLon[]; color: string; routeId: string }

export type MapMarker = { id: string; kind: 'place' | 'stop'; position: LatLon; label?: string; selected?: boolean; color?: string }

export type UserFix = LatLon & { accuracy: number }

const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

/** Each source's layers and the opacity they fade up to. Layers appear by fading in, never by popping. */
const FADE: Record<string, [layer: string, prop: string, to: number][]> = {
  'utm-route': [
    ['utm-route-covered', 'line-opacity', 1],
    ['utm-route-casing', 'line-opacity', 1],
    ['utm-route-bus', 'line-opacity', 1],
    ['utm-route-walk', 'line-opacity', 1],
    ['utm-route-arrows', 'icon-opacity', 1],
  ],
  'utm-markers': [
    ['utm-stops', 'circle-opacity', 1],
    ['utm-stops', 'circle-stroke-opacity', 1],
    ['utm-places', 'circle-opacity', 1],
    ['utm-places', 'circle-stroke-opacity', 1],
    ['utm-marker-labels', 'text-opacity', 1],
  ],
}
const FADE_MS = 260
const OUT_MS = 160

function fadeTo(map: Map, id: string, value: number, ms: number) {
  for (const [layer, prop, to] of FADE[id]) {
    map.setPaintProperty(layer, `${prop}-transition` as 'line-opacity-transition', { duration: reducedMotion() ? 0 : ms, delay: 0 })
    map.setPaintProperty(layer, prop as 'line-opacity', value * to)
  }
}

/** Run `then` once the source has taken its new data (or after a moment, whichever is first). */
function whenLoaded(map: Map, id: string, then: () => void) {
  let done = false
  const go = () => {
    if (done) return
    done = true
    map.off('sourcedata', onData)
    requestAnimationFrame(then)
  }
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => e.sourceId === id && e.isSourceLoaded && go()
  map.on('sourcedata', onData)
  setTimeout(go, 500)
}

const fadeToken = new WeakMap<Map, Record<string, number>>()
const nextToken = (map: Map, id: string) => {
  const t = fadeToken.get(map) ?? {}
  fadeToken.set(map, t)
  return (t[id] = (t[id] ?? 0) + 1)
}
const isCurrent = (map: Map, id: string, token: number) => fadeToken.get(map)?.[id] === token

/** What was drawn, ignoring properties: fade in when this changes, not when a marker is merely selected. */
const shapeOf = (data: FeatureCollection) => JSON.stringify(data.features.map((f) => f.geometry))

function useSourceData(id: string, data: FeatureCollection, selectedKey?: string) {
  const map = useMap()
  const shown = useRef('')
  const popped = useRef('')
  const claim = useRef<object>(null)
  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>(id)
    if (!map || !source) return
    const shape = shapeOf(data)
    const appear = shape !== '[]' && shape !== shown.current
    const pop = selectedKey !== undefined && selectedKey !== popped.current
    shown.current = shape
    popped.current = selectedKey ?? ''
    claim.current = {}
    claims.set(source, claim.current)
    const token = appear ? nextToken(map, id) : 0
    if (appear) fadeTo(map, id, 0, 0)
    source.setData(data)
    if (!appear && !pop) return
    whenLoaded(map, id, () => {
      if (appear && !isCurrent(map, id, token)) return
      if (appear) fadeTo(map, id, 1, FADE_MS)
      if (pop && selectedKey) popSelected(map)
    })
  }, [map, id, data, selectedKey])
  // Leaving: fade out, then empty the source unless someone else has drawn on it since.
  useEffect(() => {
    if (!map) return
    const source = map.getSource<GeoJSONSource>(id)
    return () => {
      const mine = claim.current
      shown.current = '' // drawn again from nothing if this instance comes back
      if (!source || !mine || claims.get(source) !== mine) return
      const token = nextToken(map, id)
      fadeTo(map, id, 0, OUT_MS)
      setTimeout(() => {
        if (claims.get(source) !== mine || !map.getContainer().isConnected) return
        source.setData(fc([]))
        if (isCurrent(map, id, token)) fadeTo(map, id, 1, 0)
      }, reducedMotion() ? 0 : OUT_MS)
    }
  }, [map, id])
}
const claims = new WeakMap<GeoJSONSource, object>()

/** The selected marker grows into place with a small overshoot. */
const POP: Record<string, [from: number, to: number]> = { 'utm-stops': [6, 9], 'utm-places': [7, 10] }
const pops = new WeakMap<Map, number>()
function popSelected(map: Map) {
  if (reducedMotion()) return
  cancelAnimationFrame(pops.get(map) ?? 0)
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 300)
    const k = 1 + 3.5 * (t - 1) ** 3 + 2.5 * (t - 1) ** 2 // ease-out with overshoot
    for (const [layer, [from, to]] of Object.entries(POP)) {
      map.setPaintProperty(layer, 'circle-radius', ['case', ['get', 'selected'], from + (to - from) * k, from])
    }
    if (t < 1) pops.set(map, requestAnimationFrame(step))
  }
  step(t0)
}

/** `arrows` draws direction arrowheads along the lines. The all-routes overview turns them off. */
export function RouteLayer({ legs, arrows = true }: { legs: RouteLeg[]; arrows?: boolean }) {
  const data = fc(
    legs.map((leg) => ({
      type: 'Feature',
      properties: leg.mode === 'bus' ? { mode: 'bus', color: leg.color, routeId: leg.routeId, arrows } : { mode: 'walk', style: leg.style ?? 'normal', arrows },
      geometry: { type: 'LineString', coordinates: leg.path.map(toLngLat) },
    })),
  )
  useSourceData('utm-route', useStable(data))
  return null
}

export function MarkerLayer({ markers, onSelect }: { markers: MapMarker[]; onSelect?: (m: MapMarker) => void }) {
  const map = useMap()
  const data = fc(
    markers.map((m) => ({
      type: 'Feature',
      properties: { id: m.id, kind: m.kind, label: m.label ?? '', selected: !!m.selected, color: m.color ?? null },
      geometry: { type: 'Point', coordinates: toLngLat(m.position) },
    })),
  )
  useSourceData('utm-markers', useStable(data), markers.filter((m) => m.selected).map((m) => m.id).join())

  useEffect(() => {
    if (!map || !onSelect) return
    const layers = ['utm-places', 'utm-stops']
    const click = (e: MapLayerMouseEvent) => {
      const hit = markers.find((m) => m.id === e.features?.[0]?.properties.id)
      if (hit) onSelect(hit)
    }
    const enter = () => (map.getCanvas().style.cursor = 'pointer')
    const leave = () => (map.getCanvas().style.cursor = '')
    map.on('click', layers, click)
    map.on('mouseenter', layers, enter)
    map.on('mouseleave', layers, leave)
    return () => {
      map.off('click', layers, click)
      map.off('mouseenter', layers, enter)
      map.off('mouseleave', layers, leave)
    }
  }, [map, markers, onSelect])
  return null
}

/** Same object while the content is unchanged, so callers can pass fresh arrays every render. */
function useStable(data: FeatureCollection): FeatureCollection {
  const json = JSON.stringify(data)
  return useMemo(() => JSON.parse(json), [json])
}
