// Declarative overlay API. Render these anywhere under <MapProvider>; they draw while mounted.
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import type { Feature, FeatureCollection } from 'geojson'
import type { LatLon } from '../../domain/schemas.ts'
import { circleRing, toLngLat } from './geo.ts'
import { useMap } from './MapContext.tsx'

export type RouteLeg =
  /** `likely` = shortcut not yet verified (dashed). `covered` = sheltered walkway (roof band). */
  | { mode: 'walk'; path: LatLon[]; style?: 'normal' | 'likely' | 'covered' }
  | { mode: 'bus'; path: LatLon[]; color: string; routeId: string }

export type MapMarker = { id: string; kind: 'place' | 'stop'; position: LatLon; label?: string; selected?: boolean }

export type UserFix = LatLon & { accuracy: number }

const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

function useSourceData(id: string, data: FeatureCollection) {
  const map = useMap()
  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>(id)
    if (!source) return
    source.setData(data)
    return () => void source.setData(fc([]))
  }, [map, id, data])
}

export function RouteLayer({ legs }: { legs: RouteLeg[] }) {
  const data = fc(
    legs.map((leg) => ({
      type: 'Feature',
      properties: leg.mode === 'bus' ? { mode: 'bus', color: leg.color, routeId: leg.routeId } : { mode: 'walk', style: leg.style ?? 'normal' },
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
      properties: { id: m.id, kind: m.kind, label: m.label ?? '', selected: !!m.selected },
      geometry: { type: 'Point', coordinates: toLngLat(m.position) },
    })),
  )
  useSourceData('utm-markers', useStable(data))

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

export function UserLocationLayer({ fix }: { fix: UserFix | null }) {
  const data = fc(
    fix
      ? [
          { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(fix, fix.accuracy)] } },
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(fix) } },
        ]
      : [],
  )
  useSourceData('utm-user', useStable(data))
  return null
}

/** Same object while the content is unchanged, so callers can pass fresh arrays every render. */
function useStable(data: FeatureCollection): FeatureCollection {
  const json = JSON.stringify(data)
  return useMemo(() => JSON.parse(json), [json])
}
