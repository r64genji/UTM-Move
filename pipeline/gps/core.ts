// Pure GPS logic: GPX parsing, walking-speed filter, matching to the walk network, clustering off-network walks.
import type { LatLon } from '../../src/domain/schemas.ts'

export interface Pt extends LatLon {
  /** Unix ms; missing for untimed points. */
  t?: number
}
export interface Track {
  /** Stable id: OSM trace id (`osm-trace-123`), `gpx-<file>`, or `<source>#n` for anonymous traces. */
  id: string
  url?: string
  segments: Pt[][]
}

// ---------- geometry (local metres) ----------

const K = (Math.PI / 180) * 6_371_000
const ORIGIN: LatLon = { lat: 1.56, lon: 103.64 }
const COS = Math.cos((ORIGIN.lat * Math.PI) / 180)
export const toXY = (p: LatLon): [number, number] => [(p.lon - ORIGIN.lon) * K * COS, (p.lat - ORIGIN.lat) * K]
export const fromXY = ([x, y]: [number, number]): LatLon => ({ lat: ORIGIN.lat + y / K, lon: ORIGIN.lon + x / (K * COS) })
export function distM(a: LatLon, b: LatLon): number {
  const [ax, ay] = toXY(a)
  const [bx, by] = toXY(b)
  return Math.hypot(ax - bx, ay - by)
}

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Grid index over polyline segments so nearest-line queries stay fast. */
export class LineIndex {
  private cells = new Map<string, [[number, number], [number, number]][]>()
  private cell = 50
  constructor(lines: LatLon[][]) {
    const cell = this.cell
    for (const line of lines) {
      const xy = line.map(toXY)
      for (let i = 1; i < xy.length; i++) {
        const [a, b] = [xy[i - 1], xy[i]]
        const x0 = Math.floor(Math.min(a[0], b[0]) / cell)
        const x1 = Math.floor(Math.max(a[0], b[0]) / cell)
        const y0 = Math.floor(Math.min(a[1], b[1]) / cell)
        const y1 = Math.floor(Math.max(a[1], b[1]) / cell)
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`
          const list = this.cells.get(k)
          if (list) list.push([a, b])
          else this.cells.set(k, [[a, b]])
        }
      }
    }
  }
  /** Distance in metres to the nearest line, or Infinity beyond `max`. */
  nearest(p: LatLon, max: number): number {
    const xy = toXY(p)
    const r = Math.ceil(max / this.cell)
    const cx = Math.floor(xy[0] / this.cell)
    const cy = Math.floor(xy[1] / this.cell)
    let best = Infinity
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++)
      for (const [a, b] of this.cells.get(`${x},${y}`) ?? []) best = Math.min(best, segDist(xy, a, b))
    return best <= max ? best : Infinity
  }
}

// ---------- GPX ----------

/** Parse GPX text into tracks. Segments with the same OSM trace url are one track. `source` names anonymous tracks. */
export function parseGpx(xml: string, source: string): Track[] {
  const tracks: Track[] = []
  const blocks = xml.match(/<trk>[\s\S]*?<\/trk>/g) ?? []
  blocks.forEach((block, n) => {
    const url = /<url>([^<]*)<\/url>/.exec(block)?.[1]
    const traceId = url && /\/traces\/(\d+)/.exec(url)?.[1]
    const segments = (block.match(/<trkseg>[\s\S]*?<\/trkseg>/g) ?? []).map((seg) =>
      [...seg.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/trkpt>)/g)].map((m): Pt => {
        const time = m[3] && /<time>([^<]+)<\/time>/.exec(m[3])?.[1]
        const t = time ? Date.parse(time) : NaN
        return { lat: Number(m[1]), lon: Number(m[2]), ...(Number.isNaN(t) ? {} : { t }) }
      }),
    )
    const id = traceId ? `osm-trace-${traceId}` : `${source}#${n}`
    const existing = tracks.find((t) => t.id === id)
    if (existing) existing.segments.push(...segments)
    else tracks.push({ id, ...(url ? { url: `https://www.openstreetmap.org${url}` } : {}), segments })
  })
  return tracks
}

// ---------- walking-speed filter ----------

export const WALK_MIN_KMH = 2
export const WALK_MAX_KMH = 8

/** Speed (km/h) at each point, measured over the nearest points at least `span` m away on each side. NaN if untimed. */
export function pointSpeedsKmh(seg: Pt[], span = 15): number[] {
  return seg.map((_, i) => {
    let a = i
    let b = i
    while (a > 0 && distM(seg[a], seg[i]) < span / 2) a--
    while (b < seg.length - 1 && distM(seg[b], seg[i]) < span / 2) b++
    const ta = seg[a].t
    const tb = seg[b].t
    if (ta === undefined || tb === undefined || tb <= ta) return NaN
    return (distM(seg[a], seg[b]) / ((tb - ta) / 1000)) * 3.6
  })
}

/** Runs of consecutive points moving at walking speed. Untimed, slow (standing) or fast (vehicle) points break a run. */
export function walkingRuns(seg: Pt[]): { points: Pt[]; speedsKmh: number[] }[] {
  const speeds = pointSpeedsKmh(seg)
  const runs: { points: Pt[]; speedsKmh: number[] }[] = []
  let cur: { points: Pt[]; speedsKmh: number[] } | undefined
  seg.forEach((p, i) => {
    const s = speeds[i]
    if (s >= WALK_MIN_KMH && s <= WALK_MAX_KMH) {
      if (!cur) runs.push((cur = { points: [], speedsKmh: [] }))
      cur.points.push(p)
      cur.speedsKmh.push(s)
    } else cur = undefined
  })
  return runs.filter((r) => r.points.length >= 2)
}

export function percentile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo)
}

// ---------- matching ----------

const lengthM = (pts: LatLon[]): number => pts.slice(1).reduce((s, p, i) => s + distM(pts[i], p), 0)

/** Stretches of a walking run that stay more than `farM` from every network line, at least `minLenM` long. */
export function offNetworkStretches(run: Pt[], network: LineIndex, farM = 25, minLenM = 40): LatLon[][] {
  const out: LatLon[][] = []
  let cur: LatLon[] = []
  const flush = () => {
    if (cur.length >= 2 && lengthM(cur) >= minLenM) out.push(cur)
    cur = []
  }
  for (const p of run) {
    if (network.nearest(p, farM) === Infinity) cur.push({ lat: p.lat, lon: p.lon })
    else flush()
  }
  flush()
  return out
}

/** Share of `a`'s points within `tolM` of line `b`. */
export function coverage(a: LatLon[], b: LineIndex, tolM: number): number {
  return a.filter((p) => b.nearest(p, tolM) !== Infinity).length / a.length
}

/** Points of a candidate line every ~`step` m, so a sparse 2-point line can be tested for coverage. */
export function densifyLine(line: LatLon[], step = 3): LatLon[] {
  const out: LatLon[] = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const n = Math.max(1, Math.ceil(distM(line[i - 1], line[i]) / step))
    for (let j = 1; j <= n; j++) {
      const f = j / n
      out.push({ lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * f, lon: line[i - 1].lon + (line[i].lon - line[i - 1].lon) * f })
    }
  }
  return out
}

/**
 * Does the walked line follow the candidate along its whole length? Every ~3 m of the candidate must have a
 * walked point within `tolM`, for at least `minShare` of the candidate.
 */
export function followsCandidate(walked: LineIndex, candidate: LatLon[], tolM = 10, minShare = 0.8): boolean {
  return coverage(densifyLine(candidate), walked, tolM) >= minShare
}

export interface Stretch {
  trackId: string
  line: LatLon[]
}
export interface Cluster {
  line: LatLon[]
  trackIds: string[]
}

/** Group off-network stretches that run along the same line (each covers 70% of the other within `tolM`). Longest stretch is the cluster line. */
export function clusterStretches(stretches: Stretch[], tolM = 12): Cluster[] {
  const sorted = [...stretches].sort((a, b) => lengthM(b.line) - lengthM(a.line))
  const clusters: (Cluster & { index: LineIndex })[] = []
  for (const s of sorted) {
    const dense = densifyLine(s.line)
    const home = clusters.find((c) => coverage(dense, c.index, tolM) >= 0.7 && coverage(densifyLine(c.line), new LineIndex([s.line]), tolM) >= 0.7)
    if (home) {
      if (!home.trackIds.includes(s.trackId)) home.trackIds.push(s.trackId)
    } else clusters.push({ line: s.line, trackIds: [s.trackId], index: new LineIndex([s.line]) })
  }
  return clusters.map(({ line, trackIds }) => ({ line, trackIds }))
}

/** Drop every k-th point to thin lines for the map and the candidate geometry (keeps both ends). */
export function thin(line: LatLon[], minGapM = 4): LatLon[] {
  const out = [line[0]]
  for (const p of line.slice(1, -1)) if (distM(out[out.length - 1], p) >= minGapM) out.push(p)
  out.push(line[line.length - 1])
  return out
}
