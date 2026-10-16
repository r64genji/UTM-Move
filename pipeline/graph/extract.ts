// Make the committed inputs of the graph build from the raw OSM extract and the DEM.
// Run: npx tsx pipeline/graph/extract.ts   (needs data/raw/osm/*.geojson and data/raw/dem/*.tif; CI does not)
// Writes data/osm/walk-ways.geojson, landmarks.json, building-labels.geojson, dem-grid.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { fromFile } from 'geotiff'
import type { DemGrid } from './dem.ts'
import { classifyWay } from './ways.ts'

const OSM = 'data/raw/osm'
const DEM_TIF = 'data/raw/dem/Copernicus_DSM_COG_10_N01_00_E103_00_DEM.tif'
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

type Feature = { geometry: { type: string; coordinates: number[] | number[][] }; properties: Record<string, unknown> }
const read = (f: string): Feature[] => JSON.parse(readFileSync(`${OSM}/${f}`, 'utf8')).features

const ways: unknown[] = []
const bbox = [Infinity, Infinity, -Infinity, -Infinity]
for (const f of read('ways.geojson')) {
  const props = classifyWay(f.properties)
  if (!props || f.geometry.type !== 'LineString') continue
  const coords = (f.geometry.coordinates as number[][]).map(([x, y]) => [r6(x), r6(y)])
  for (const [x, y] of coords) {
    bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y); bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y)
  }
  ways.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } })
}
writeFileSync('data/osm/walk-ways.geojson', `{"type":"FeatureCollection","features":[\n${ways.map((w) => JSON.stringify(w)).join(',\n')}\n]}\n`)

const landmarks = read('buildings.geojson')
  .filter((b) => b.properties.inside_campus && (b.properties.name || b.properties.ref))
  .map((b) => {
    const [x, y] = b.properties.center as number[]
    return [r6(y), r6(x), String(b.properties.name ?? b.properties.ref)]
  })
writeFileSync('data/osm/landmarks.json', JSON.stringify(landmarks))

const area = (ring: number[][]) => Math.abs(ring.reduce((s, [x, y], i) => s + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0))
const blockOwner = new Map<string, string>()
for (const p of JSON.parse(readFileSync('data/places.curated.json', 'utf8')) as { name: string }[]) {
  const m = p.name.match(/^Block ([A-Z]{1,3}\d{1,3}[A-Z]?), (.+)$/)
  if (m) blockOwner.set(m[1], m[2])
}
const labels = new Map<string, { code: string; name: string; at: number[]; area: number }>()
for (const b of read('buildings.geojson')) {
  const p = b.properties as Record<string, string | undefined> & { inside_campus: boolean; center: number[] }
  if (!p.inside_campus || !(p.name || p.ref || p['addr:housenumber'])) continue
  const m = p.name?.match(/^([A-Z]{1,3}\d{1,3}[A-Z]?)\b[\s,]*(.*)$/)
  const t = m ? null : p.name?.match(/^(.+?)[\s,]+\(?([A-Z]{1,3}\d{1,3}[A-Z]?)\)?$/)
  const code = m ? m[1] : t ? t[2] : (p.ref ?? p['addr:housenumber'] ?? '')
  const name = (m ? m[2].replace(/^\((.*)\)$/, '$1') : t ? t[1] : p.name) || p.alt_name || p['name:en'] || p.short_name || blockOwner.get(code) || ''
  const a = area((b.geometry.coordinates as unknown as number[][][])[0])
  const key = `${code}|${name}`
  if ((labels.get(key)?.area ?? -1) < a) labels.set(key, { code, name, at: p.center.map(r6), area: a })
}
writeFileSync('data/osm/building-labels.geojson', `{"type":"FeatureCollection","features":[\n${[...labels.values()]
  .map(({ code, name, at }) => JSON.stringify({ type: 'Feature', properties: { code, name }, geometry: { type: 'Point', coordinates: at } }))
  .join(',\n')}\n]}\n`)

const tiff = await fromFile(DEM_TIF)
const img = await tiff.getImage()
const [ox, oy] = img.getOrigin()
const [rx, ry] = img.getResolution()
const m = 0.003
const c0 = Math.floor((bbox[0] - m - ox) / rx)
const c1 = Math.ceil((bbox[2] + m - ox) / rx)
const r0 = Math.floor((bbox[3] + m - oy) / ry)
const r1 = Math.ceil((bbox[1] - m - oy) / ry)
const [band] = (await tiff.readRasters({ window: [c0, r0, c1, r1], interleave: false })) as unknown as [Float32Array]
const cols = c1 - c0
const rows = r1 - r0
const dm = new Int16Array(band.length)
band.forEach((v, i) => (dm[i] = Math.round(v * 10)))
const grid: DemGrid = {
  west: r6(ox + (c0 + 0.5) * rx),
  north: r6(oy + (r0 + 0.5) * ry),
  dLon: rx,
  dLat: -ry,
  cols,
  rows,
  dm: Buffer.from(dm.buffer).toString('base64'),
}
writeFileSync('data/osm/dem-grid.json', JSON.stringify(grid))
console.log(`${ways.length} walkable ways, ${landmarks.length} landmarks, DEM ${cols}x${rows}, z ${Math.min(...band)}..${Math.max(...band)} m`)
