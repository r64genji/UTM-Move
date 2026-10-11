// Make the committed inputs of the graph build from the raw OSM extract and the DEM.
// Run: npx tsx pipeline/graph/extract.ts   (needs data/raw/osm/*.geojson and data/raw/dem/*.tif; CI does not)
// Writes data/osm/walk-ways.geojson, landmarks.json, dem-grid.json.
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
