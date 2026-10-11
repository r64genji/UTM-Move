// Post-filter for vision lines: drop what OSM already maps, and lines that cut through buildings.
import type { LatLon } from '../../src/domain/schemas.ts'

type XY = [number, number]
const K = (Math.PI / 180) * 6_371_000
const ORIGIN_LAT = 1.56
const toXY = (p: LatLon): XY => [p.lon * K * Math.cos((ORIGIN_LAT * Math.PI) / 180), p.lat * K]

/** Points along the line every `step` metres, including both ends. */
function sample(line: XY[], step: number): XY[] {
  const out: XY[] = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step))
    for (let j = 1; j <= n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n])
  }
  return out
}

function distToSegment([px, py]: XY, [ax, ay]: XY, [bx, by]: XY): number {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function inPolygon([x, y]: XY, ring: XY[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Share (0..1) of the line's length lying within `maxM` metres of any of the ways. */
export function fractionNearWays(line: LatLon[], ways: LatLon[][], maxM = 8): number {
  const segs = ways.map((w) => w.map(toXY))
  const pts = sample(line.map(toXY), 1)
  const near = pts.filter((p) => segs.some((w) => w.some((_, i) => i > 0 && distToSegment(p, w[i - 1], w[i]) <= maxM)))
  return near.length / pts.length
}

/** Metres of the line that lie inside any building outline. */
export function metresInsideBuildings(line: LatLon[], buildings: LatLon[][]): number {
  const rings = buildings.map((b) => b.map(toXY))
  const pts = sample(line.map(toXY), 1)
  return pts.filter((p) => rings.some((r) => inPolygon(p, r))).length * (lengthM(line) / pts.length)
}

export function lengthM(line: LatLon[]): number {
  const xy = line.map(toXY)
  return xy.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - xy[i][0], p[1] - xy[i][1]), 0)
}

/** Reason to drop a line, or undefined to keep it. */
export function dropReason(kind: string, line: LatLon[], ways: LatLon[][], buildings: LatLon[][] | undefined): string | undefined {
  if (fractionNearWays(line, ways) >= 0.7) return 'already-mapped'
  if (buildings && kind !== 'through-building' && kind !== 'bridge' && metresInsideBuildings(line, buildings) > 10) return 'through-building-interior'
  return undefined
}
