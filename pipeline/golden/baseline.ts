// Regenerates tests/golden/baseline.json (our routes) and tests/golden/real.json (OSM GPS trace times).
// Run: npx tsx pipeline/golden/baseline.ts   (needs npm run build:transit && npm run build:graph)
// Review the diff before committing: a changed baseline means the router changed.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { distanceM } from '../../src/domain/walk/geo.ts'
import { loadRouterData, loadTrips, planTrip, straightLineM, type GoldenTrip } from './lib.ts'

const GPX_DIR = process.env.GPX_DIR ?? '/home/abe/projects/v2-wt/gps/data/raw/gpx-osm'
const NEAR_M = 100

interface Pt { lat: number; lon: number; t: number }

function tracks(): { file: string; pts: Pt[] }[] {
  if (!existsSync(GPX_DIR)) return []
  return readdirSync(GPX_DIR).filter((f) => f.endsWith('.gpx')).flatMap((f) =>
    readFileSync(`${GPX_DIR}/${f}`, 'utf8').split('<trkseg>').slice(1).map((seg) => ({
      file: f,
      pts: [...seg.matchAll(/<trkpt lat="([\d.-]+)" lon="([\d.-]+)">\s*<time>([^<]+)<\/time>/g)].map((m) => ({ lat: +m[1], lon: +m[2], t: Date.parse(m[3]) / 1000 })),
    })))
}

/** Real time: a trace that passes within 100 m of the origin, then within 100 m of the destination. */
function realTime(all: ReturnType<typeof tracks>, t: GoldenTrip) {
  for (const { file, pts } of all) {
    const i = pts.findIndex((p) => distanceM(p, t.from) < NEAR_M)
    if (i < 0) continue
    const j = pts.findIndex((p, k) => k > i && distanceM(p, t.to) < NEAR_M)
    if (j <= i) continue
    const duration_s = Math.round(pts[j].t - pts[i].t)
    // Straight-line speed over 1.8 m/s means a vehicle trace (bus), not a walker.
    return { duration_s, source: file, mode: distanceM(t.from, t.to) / Math.max(duration_s, 1) > 1.8 ? 'vehicle' : 'walk' }
  }
  return { duration_s: null, source: null, mode: null }
}

const data = loadRouterData()
const all = tracks()
const trips = loadTrips()
const baseline = Object.fromEntries(trips.map((t) => [t.id, { straightM: Math.round(straightLineM(t)), options: planTrip(data, t) }]))
const real = Object.fromEntries(trips.map((t) => [t.id, realTime(all, t)]))
writeFileSync('tests/golden/baseline.json', JSON.stringify(baseline) + '\n')
writeFileSync('tests/golden/real.json', JSON.stringify(real, null, 1) + '\n')
console.log(`${trips.length} trips, ${all.length} GPX segments, ${Object.values(real).filter((r) => r.duration_s != null).length} with a real time`)
