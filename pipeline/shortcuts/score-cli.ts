// npm run score:shortcuts [dataDir]
// Reads data/shortcuts/candidates.geojson + data/evidence/*.jsonl,
// writes data/shortcuts/scored.geojson and the map report data/raw/reports/shortcuts.html.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Shortcut, type Evidence } from '../../src/domain/schemas.ts'
import { isInOsm, readOsmWays } from './osm.ts'
import { scoreShortcut } from './score.ts'
import { featureCollection, readCandidates, readEvidence, toFeature } from './store.ts'

const root = process.argv[2] ?? 'data'
const candidates = readCandidates(root)
const evidence = readEvidence(root)

const byShortcut = new Map<string, Evidence[]>()
for (const e of evidence) byShortcut.set(e.shortcutId, [...(byShortcut.get(e.shortcutId) ?? []), e])
const orphans = [...byShortcut.keys()].filter((id) => !candidates.some((c) => c.id === id))
if (orphans.length) console.warn(`evidence for unknown shortcuts (ignored): ${orphans.join(', ')}`)

// A candidate OSM now has (>= 70% within 8 m of an OSM way) is marked inOsm and dropped from the overlay.
const osmWays = existsSync(join(root, 'osm', 'walk-ways.geojson')) ? readOsmWays(root) : []
const features = candidates.map((c) => {
  const ev = byShortcut.get(c.id) ?? []
  const { level, reasons } = scoreShortcut(ev)
  const shortcut = Shortcut.parse({
    id: c.id,
    geometry: c.geometry,
    level,
    kind: c.kind,
    evidenceIds: ev.map((e) => e.id),
    indoor: c.kind === 'through-building',
    covered: c.kind === 'covered-walkway' || c.kind === 'through-building',
    note: c.note,
  })
  const inOsm = osmWays.length > 0 && isInOsm(c.geometry, osmWays)
  return toFeature({ ...shortcut, from: c.from, to: c.to, reasons, ...(inOsm ? { inOsm: true } : {}) })
})

writeFileSync(join(root, 'shortcuts', 'scored.geojson'), featureCollection(features))

const levels = { verified: 0, likely: 0, guess: 0 }
for (const f of features) levels[f.properties.level as keyof typeof levels] += 1
console.log(`${candidates.length} candidates, ${evidence.length} evidence records:`, levels, `, ${features.filter((f) => f.properties.inOsm).length} already in OSM (dropped from overlay)`)

const boundaryPath = join(root, 'campus-boundary.geojson')
const boundary = existsSync(boundaryPath) ? readFileSync(boundaryPath, 'utf8') : 'null'
const reportPath = join(root, 'raw', 'reports', 'shortcuts.html')
mkdirSync(join(root, 'raw', 'reports'), { recursive: true })
writeFileSync(reportPath, report(featureCollection(features), boundary, levels))
console.log(`wrote ${join(root, 'shortcuts', 'scored.geojson')} and ${reportPath}`)

function report(scored: string, boundary: string, counts: typeof levels): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>UTM shortcut candidates</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%; font: 14px system-ui, sans-serif }
  #legend { position: absolute; top: 10px; left: 10px; background: #fff; padding: 8px 12px; border-radius: 6px; box-shadow: 0 1px 4px #0004 }
  #legend i { display: inline-block; width: 14px; height: 4px; margin-right: 6px; vertical-align: middle }
</style></head>
<body><div id="map"></div>
<div id="legend"><b>Shortcut candidates</b><br>
  <i style="background:#16a34a"></i>verified (${counts.verified})<br>
  <i style="background:#f59e0b"></i>likely (${counts.likely})<br>
  <i style="background:#dc2626"></i>guess (${counts.guess})
</div>
<script>
const scored = ${scored}
const boundary = ${boundary}
const map = new maplibregl.Map({
  container: 'map',
  center: [103.6387, 1.5589],
  zoom: 15,
  style: {
    version: 8,
    sources: { esri: { type: 'raster', tileSize: 256, attribution: 'Esri World Imagery',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] } },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
  },
})
map.on('load', () => {
  if (boundary) {
    map.addSource('boundary', { type: 'geojson', data: boundary })
    map.addLayer({ id: 'boundary', type: 'line', source: 'boundary', paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
  }
  map.addSource('scored', { type: 'geojson', data: scored })
  map.addLayer({ id: 'scored', type: 'line', source: 'scored', layout: { 'line-cap': 'round' }, paint: {
    'line-width': 5,
    'line-color': ['match', ['get', 'level'], 'verified', '#16a34a', 'likely', '#f59e0b', '#dc2626'],
  } })
  map.on('click', 'scored', (e) => {
    const p = e.features[0].properties
    const list = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? []).join(', ')
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(
      '<b>' + p.id + '</b> (' + p.kind + ')<br>' + (p.from ?? '?') + ' → ' + (p.to ?? '?') +
      '<br>level: <b>' + p.level + '</b><br>' + list(p.reasons) + '<br>evidence: ' + list(p.evidenceIds)
    ).addTo(map)
  })
  map.on('mouseenter', 'scored', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'scored', () => (map.getCanvas().style.cursor = ''))
  if (scored.features.length) {
    const b = new maplibregl.LngLatBounds()
    for (const f of scored.features) for (const c of f.geometry.coordinates) b.extend(c)
    map.fitBounds(b, { padding: 60, maxZoom: 18 })
  }
})
</script></body></html>
`
}
