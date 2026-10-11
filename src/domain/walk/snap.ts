// Snap a point to the walk graph: nearest node, or the nearest point on any edge.
import KDBush from 'kdbush'
import type { LatLon } from '../schemas.ts'
import { edgeCoords, toDeg, type Graph } from './graph.ts'

const M_PER_DEG = 111_320

interface Index {
  kx: number
  nodes: KDBush
  /** Segment midpoints. segEdge/segIdx say which edge and which segment of its polyline. */
  segs: KDBush
  segEdge: Uint32Array
  segIdx: Uint32Array
  segMid: Float64Array
  maxHalfSeg: number
}

const cache = new WeakMap<Graph, Index>()

function index(g: Graph): Index {
  let ix = cache.get(g)
  if (ix) return ix
  let sum = 0
  for (let n = 0; n < g.nodeCount; n++) sum += g.nodeLat[n]
  const lat0 = g.nodeCount ? toDeg(sum / g.nodeCount) : 0
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180)
  const nodes = new KDBush(Math.max(1, g.nodeCount))
  for (let n = 0; n < g.nodeCount; n++) nodes.add(toDeg(g.nodeLon[n]) * kx, toDeg(g.nodeLat[n]) * M_PER_DEG)
  nodes.finish()

  const segCount = g.edgeCount + g.geomLat.length
  const segs = new KDBush(Math.max(1, segCount))
  const segEdge = new Uint32Array(segCount)
  const segIdx = new Uint32Array(segCount)
  const segMid = new Float64Array(segCount * 2)
  let maxHalfSeg = 0
  let s = 0
  for (let e = 0; e < g.edgeCount; e++) {
    const pts = edgeCoords(g, e, 0)
    for (let i = 1; i < pts.length; i++, s++) {
      const ax = pts[i - 1].lon * kx, ay = pts[i - 1].lat * M_PER_DEG
      const bx = pts[i].lon * kx, by = pts[i].lat * M_PER_DEG
      segMid[2 * s] = (ax + bx) / 2
      segMid[2 * s + 1] = (ay + by) / 2
      segs.add(segMid[2 * s], segMid[2 * s + 1])
      segEdge[s] = e
      segIdx[s] = i - 1
      maxHalfSeg = Math.max(maxHalfSeg, Math.hypot(bx - ax, by - ay) / 2)
    }
  }
  segs.finish()
  ix = { kx, nodes, segs, segEdge, segIdx, segMid, maxHalfSeg }
  cache.set(g, ix)
  return ix
}

/** Nearest item to (x, y): grow the search radius until something is found. */
function nearest(tree: KDBush, x: number, y: number, dist: (i: number) => number): number {
  for (let r = 25; r < 1e7; r *= 4) {
    let best = -1
    let bestD = Infinity
    for (const i of tree.within(x, y, r)) {
      const d = dist(i)
      if (d < bestD) [best, bestD] = [i, d]
    }
    if (best >= 0) return best
  }
  return -1
}

/** Index of the graph node closest to p, or -1 if the graph is empty. */
export function snapToNode(g: Graph, p: LatLon): number {
  if (g.nodeCount === 0) return -1
  const ix = index(g)
  const x = p.lon * ix.kx
  const y = p.lat * M_PER_DEG
  return nearest(ix.nodes, x, y, (n) => Math.hypot(toDeg(g.nodeLon[n]) * ix.kx - x, toDeg(g.nodeLat[n]) * M_PER_DEG - y))
}

export interface EdgeSnap {
  edge: number
  /** Position on the edge as a fraction of its length, measured from edgeFrom. */
  t: number
  point: LatLon
  distanceM: number
}

/** Project p onto the nearest edge. Exact: checks every segment whose midpoint could be close enough. */
export function snapToEdge(g: Graph, p: LatLon): EdgeSnap | null {
  if (g.edgeCount === 0) return null
  const ix = index(g)
  const x = p.lon * ix.kx
  const y = p.lat * M_PER_DEG
  const mid = (s: number) => [ix.segMid[2 * s], ix.segMid[2 * s + 1]]
  const first = nearest(ix.segs, x, y, (s) => { const [mx, my] = mid(s); return Math.hypot(mx - x, my - y) })
  const [fx, fy] = mid(first)
  const radius = Math.hypot(fx - x, fy - y) + ix.maxHalfSeg

  let best: { edge: number; seg: number; u: number; d: number } | null = null
  const lines = new Map<number, LatLon[]>()
  for (const s of ix.segs.within(x, y, radius)) {
    const e = ix.segEdge[s]
    let pts = lines.get(e)
    if (!pts) lines.set(e, (pts = edgeCoords(g, e, 0)))
    const i = ix.segIdx[s]
    const ax = pts[i].lon * ix.kx, ay = pts[i].lat * M_PER_DEG
    const dx = pts[i + 1].lon * ix.kx - ax, dy = pts[i + 1].lat * M_PER_DEG - ay
    const len2 = dx * dx + dy * dy
    const u = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
    const d = Math.hypot(ax + u * dx - x, ay + u * dy - y)
    if (!best || d < best.d) best = { edge: e, seg: i, u, d }
  }
  if (!best) return null
  const pts = lines.get(best.edge)!
  let before = 0
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot((pts[i].lon - pts[i - 1].lon) * ix.kx, (pts[i].lat - pts[i - 1].lat) * M_PER_DEG)
    if (i - 1 < best.seg) before += len
    if (i - 1 === best.seg) before += len * best.u
    total += len
  }
  const a = pts[best.seg], b = pts[best.seg + 1]
  return {
    edge: best.edge,
    t: total > 0 ? before / total : 0,
    point: { lat: a.lat + (b.lat - a.lat) * best.u, lon: a.lon + (b.lon - a.lon) * best.u },
    distanceM: best.d,
  }
}
