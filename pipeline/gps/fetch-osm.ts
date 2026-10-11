// Download every public OSM GPS trackpoint page in the campus bbox into data/raw/gpx-osm/page-N.gpx.
// 1 request per second, cached: existing pages are not fetched again. Stops at the first page with no points.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'UTM-Move-v2 (abrahamtan99@gmail.com)'

export function campusBbox(root: string): string {
  const b = JSON.parse(readFileSync(join(root, 'campus-boundary.geojson'), 'utf8'))
  const xs: number[] = []
  const ys: number[] = []
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      xs.push(c[0])
      ys.push(c[1] as number)
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  for (const f of b.features ?? [b]) walk(f.geometry.coordinates)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => n.toFixed(6)).join(',')
}

export async function fetchOsmTracks(root = 'data'): Promise<string[]> {
  const dir = join(root, 'raw', 'gpx-osm')
  mkdirSync(dir, { recursive: true })
  const bbox = campusBbox(root)
  const files: string[] = []
  for (let page = 0; ; page++) {
    const file = join(dir, `page-${page}.gpx`)
    if (!existsSync(file)) {
      await new Promise((r) => setTimeout(r, 1000))
      const res = await fetch(`https://api.openstreetmap.org/api/0.6/trackpoints?bbox=${bbox}&page=${page}`, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`trackpoints page ${page}: HTTP ${res.status}`)
      writeFileSync(file, await res.text())
      console.log(`fetched page ${page}`)
    }
    if (!readFileSync(file, 'utf8').includes('<trkpt')) {
      break
    }
    files.push(file)
  }
  return files
}
