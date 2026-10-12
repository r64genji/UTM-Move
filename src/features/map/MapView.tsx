import { addProtocol, AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Bundle MapLibre's worker ourselves; its default lookup next to the main chunk breaks under Vite.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { useSetMap } from './MapContext.tsx'
import { IMAGERY_ATTRIBUTION } from './credits.ts'
import { addArrowImage, buildStyle, CAMPUS_BOUNDS, TILE_BOUNDS } from './style.ts'

let protocolAdded = false

/** The one map. Mounted once by the shell; pages draw on it through the layer components. */
export default function MapView() {
  const el = useRef<HTMLDivElement>(null)
  const setMap = useSetMap()
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!protocolAdded) {
      setWorkerUrl(workerUrl)
      addProtocol('pmtiles', new Protocol().tile)
      protocolAdded = true
    }
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: el.current!,
        style: buildStyle(window.location.origin),
        bounds: CAMPUS_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        maxBounds: TILE_BOUNDS,
        minZoom: 13,
        maxZoom: 19,
        attributionControl: false,
        localIdeographFontFamily: "'Noto Sans CJK SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      })
    } catch {
      // No WebGL (old phone, locked-down browser). The panel still works.
      queueMicrotask(() => setError(true))
      return
    }
    map.addControl(new AttributionControl({ compact: true, customAttribution: IMAGERY_ATTRIBUTION }), 'bottom-right')
    map.addControl(new NavigationControl({ visualizePitch: false, showCompass: false }), 'top-right')
    map.on('load', () => {
      addArrowImage(map)
      setMap(map)
    })
    return () => {
      setMap(null)
      map.remove()
    }
  }, [setMap])

  return (
    <div ref={el} className="map" aria-label="Campus map" role="region">
      {error && <p className="map-error">The map needs WebGL, which this browser does not have.</p>}
    </div>
  )
}
