// npm run gps:shortcuts
// Downloads public OSM GPS tracks for the campus (cached), reads data/gpx/*.gpx, keeps walking-speed stretches,
// finds walks that leave the OSM network along a shared line (new candidates), and records one `gps-trace`
// evidence record per (candidate, track). Also writes data/walk-speeds.json and data/raw/reports/gps.html.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Evidence } from '../../src/domain/schemas.ts'
import { scoreShortcut } from '../shortcuts/score.ts'
import { addCandidate, appendEvidence, readCandidates, readEvidence } from '../shortcuts/store.ts'
import { clusterStretches, followsCandidate, LineIndex, offNetworkStretches, parseGpx, percentile, thin, walkingRuns, type Stretch, type Track } from './core.ts'
import { fetchOsmTracks } from './fetch-osm.ts'

const root = process.argv[2] ?? 'data'
const today = new Date().toISOString().slice(0, 10)

const tracks: Track[] = []
for (const f of await fetchOsmTracks(root)) tracks.push(...parseGpx(readFileSync(f, 'utf8'), basename(f, '.gpx')))
const gpxDir = join(root, 'gpx')
for (const f of existsSync(gpxDir) ? readdirSync(gpxDir).filter((n) => n.toLowerCase().endsWith('.gpx')) : [])
  for (const t of parseGpx(readFileSync(join(gpxDir, f), 'utf8'), `gpx-${basename(f, '.gpx')}`))
    tracks.push({ ...t, id: t.id.includes('#') ? `gpx-${basename(f, '.gpx')}${t.id.slice(t.id.indexOf('#'))}` : t.id })

// Walk network: every OSM way (walkers use roads too). Off-network = more than 25 m from all of them.
// data/raw is not in git, so CI falls back to the committed walkable ways (roads included).
const rawWays = join(root, 'raw', 'osm', 'ways.geojson')
const ways = JSON.parse(readFileSync(existsSync(rawWays) ? rawWays : join(root, 'osm', 'walk-ways.geojson'), 'utf8')) as { features: { geometry: { coordinates: [number, number][] } }[] }
const network = new LineIndex(ways.features.map((f) => f.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))))

// Walking-speed runs per track.
const walked = tracks.map((t) => ({ track: t, runs: t.segments.flatMap((s) => walkingRuns(s)) })).filter((w) => w.runs.length)
const speeds = walked.flatMap((w) => w.runs.flatMap((r) => r.speedsKmh)).sort((a, b) => a - b)
const walkedPoints = speeds.length
console.log(`${tracks.length} tracks, ${walked.length} with walking stretches (${walkedPoints} points at 2-8 km/h)`)

// 1. New candidates: off-network stretches shared by 2+ separate tracks.
const stretches: Stretch[] = walked.flatMap((w) =>
  w.runs.flatMap((r) => offNetworkStretches(r.points, network).map((line) => ({ trackId: w.track.id, line }))),
)
const shared = clusterStretches(stretches).filter((c) => c.trackIds.length >= 2)
for (const c of shared) addCandidate({ kind: 'footpath', geometry: thin(c.line), note: `GPS: off the OSM network, walked by ${c.trackIds.length} tracks` }, root)
console.log(`${stretches.length} off-network stretches -> ${shared.length} shared by 2+ tracks`)

// 2. Evidence: every candidate (any source) that a track follows along its length.
const candidates = readCandidates(root)
let added = 0
for (const w of walked) {
  const index = new LineIndex(w.runs.map((r) => r.points))
  const date = new Date(w.track.segments.flat().find((p) => p.t)?.t ?? Date.now()).toISOString().slice(0, 10)
  for (const c of candidates) {
    if (!followsCandidate(index, c.geometry)) continue
    const res = appendEvidence(
      {
        shortcutId: c.id,
        source: 'gps-trace',
        ref: w.track.id,
        summary: `Walking-speed GPS track ${w.track.id} follows this line`,
        ...(w.track.url ? { url: w.track.url } : {}),
        observedAt: date <= today ? date : today,
        confidence: 0.8,
      },
      root,
    )
    if (res.added) added++
  }
}
console.log(`${added} new gps-trace evidence records`)

// 3. Walk speeds.
if (speeds.length) {
  const stat = (v: number[]) => ({ kmh: +percentile(v, 0.5).toFixed(2), mps: +(percentile(v, 0.5) / 3.6).toFixed(3), p25Kmh: +percentile(v, 0.25).toFixed(2), p75Kmh: +percentile(v, 0.75).toFixed(2) })
  writeFileSync(
    join(root, 'walk-speeds.json'),
    JSON.stringify({ tracks: walked.length, points: speeds.length, all: stat(speeds), slopeBands: null, note: 'Points at 2-8 km/h only (standing and vehicles removed). No elevation in OSM trackpoints, so no slope bands.' }, null, 2) + '\n',
  )
  console.log('walk speed (km/h):', stat(speeds))
}

// 4. Score + report.
const evidence = readEvidence(root)
const byId = new Map<string, Evidence[]>()
for (const e of evidence) byId.set(e.shortcutId, [...(byId.get(e.shortcutId) ?? []), e])
const all = readCandidates(root)
const levels = { verified: 0, likely: 0, guess: 0 }
const features = all.map((c) => {
  const { level, reasons } = scoreShortcut(byId.get(c.id) ?? [])
  levels[level]++
  return { type: 'Feature', properties: { id: c.id, level, kind: c.kind, reasons, gps: (byId.get(c.id) ?? []).filter((e) => e.source === 'gps-trace').length }, geometry: { type: 'LineString', coordinates: c.geometry.map((p) => [p.lon, p.lat]) } }
})
const trackFeatures = walked.map((w) => ({ type: 'Feature', properties: { id: w.track.id }, geometry: { type: 'MultiLineString', coordinates: w.runs.map((r) => thin(r.points, 6).map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)])) } }))
mkdirSync(join(root, 'raw', 'reports'), { recursive: true })
const boundaryPath = join(root, 'campus-boundary.geojson')
writeFileSync(join(root, 'raw', 'reports', 'gps.html'), report(JSON.stringify({ type: 'FeatureCollection', features: trackFeatures }), JSON.stringify({ type: 'FeatureCollection', features }), existsSync(boundaryPath) ? readFileSync(boundaryPath, 'utf8') : 'null', levels))
console.log(`${all.length} candidates:`, levels, `-> ${join(root, 'raw', 'reports', 'gps.html')}`)

function report(tr: string, sc: string, boundary: string, c: typeof levels): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>UTM GPS tracks and shortcuts</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%; font: 14px system-ui, sans-serif }
  #legend { position: absolute; top: 10px; left: 10px; background: #fff; padding: 8px 12px; border-radius: 6px; box-shadow: 0 1px 4px #0004 }
  #legend i { display: inline-block; width: 14px; height: 4px; margin-right: 6px; vertical-align: middle }
</style></head>
<body><div id="map"></div>
<div id="legend"><b>GPS tracks (walking only) and shortcuts</b><br>
  <i style="background:#38bdf8"></i>GPS tracks (${trackFeatures.length})<br>
  <i style="background:#16a34a"></i>verified (${c.verified})<br>
  <i style="background:#f59e0b"></i>likely (${c.likely})<br>
  <i style="background:#dc2626"></i>guess (${c.guess})
</div>
<script>
const tracks = ${tr}
const scored = ${sc}
const boundary = ${boundary}
const map = new maplibregl.Map({
  container: 'map', center: [103.6387, 1.5589], zoom: 15,
  style: { version: 8,
    sources: { esri: { type: 'raster', tileSize: 256, attribution: 'Esri World Imagery', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] } },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }] },
})
map.on('load', () => {
  if (boundary) { map.addSource('boundary', { type: 'geojson', data: boundary }); map.addLayer({ id: 'boundary', type: 'line', source: 'boundary', paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [2, 2] } }) }
  map.addSource('tracks', { type: 'geojson', data: tracks })
  map.addLayer({ id: 'tracks', type: 'line', source: 'tracks', paint: { 'line-color': '#38bdf8', 'line-width': 1.5, 'line-opacity': 0.55 } })
  map.addSource('scored', { type: 'geojson', data: scored })
  map.addLayer({ id: 'scored', type: 'line', source: 'scored', layout: { 'line-cap': 'round' }, paint: { 'line-width': 5, 'line-color': ['match', ['get', 'level'], 'verified', '#16a34a', 'likely', '#f59e0b', '#dc2626'] } })
  map.on('click', 'scored', (e) => {
    const p = e.features[0].properties
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<b>' + p.id + '</b> (' + p.kind + ')<br>level: <b>' + p.level + '</b><br>' + p.gps + ' GPS tracks<br>' + p.reasons).addTo(map)
  })
})
</script></body></html>
`
}
