// Georeferencing: fit a similarity transform (plan pixels -> lat/lon) from the building outline in the plan
// to an OSM building outline, by trying every pair of plan corners against every pair of OSM corners.
export interface XY { x: number; y: number }
export interface LL { lat: number; lon: number }

const K = (Math.PI / 180) * 6_371_000
/** Local metres around `o` (x east, y north). */
export const toM = (p: LL, o: LL): XY => ({ x: (p.lon - o.lon) * K * Math.cos((o.lat * Math.PI) / 180), y: (p.lat - o.lat) * K })
export const toLL = (p: XY, o: LL): LL => ({ lat: o.lat + p.y / K, lon: o.lon + p.x / (K * Math.cos((o.lat * Math.PI) / 180)) })

function distToSeg(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
/** Distance from p to a closed ring. */
export function distToRing(p: XY, ring: XY[]): number {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSeg(p, ring[i], ring[(i + 1) % ring.length]))
  return d
}
const perim = (r: XY[]) => r.reduce((s, p, i) => s + Math.hypot(p.x - r[(i + 1) % r.length].x, p.y - r[(i + 1) % r.length].y), 0)
function sample(ring: XY[], step: number): XY[] {
  const out: XY[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let j = 0; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n })
  }
  return out
}

export interface Fit {
  /** plan pixel (y down) -> local metres */
  apply: (p: XY) => XY
  scale: number // metres per pixel
  rotationDeg: number
  /** mean / max distance (m) between the transformed plan outline and the OSM outline */
  meanM: number
  maxM: number
}

/** Similarity from two point pairs: a1->b1, a2->b2 (no reflection). */
function similarity(a1: XY, a2: XY, b1: XY, b2: XY) {
  const ax = a2.x - a1.x, ay = a2.y - a1.y, bx = b2.x - b1.x, by = b2.y - b1.y
  const al = Math.hypot(ax, ay)
  if (al < 1e-9) return undefined
  const s = Math.hypot(bx, by) / al
  const th = Math.atan2(by, bx) - Math.atan2(ay, ax)
  const c = Math.cos(th) * s, d = Math.sin(th) * s
  return { s, th, apply: (p: XY): XY => ({ x: b1.x + c * (p.x - a1.x) - d * (p.y - a1.y), y: b1.y + d * (p.x - a1.x) + c * (p.y - a1.y) }) }
}

/**
 * All good fits of `plan` (pixel polygon) onto `osm` (metre polygon), best first, one per distinct pose.
 * Pixel y points down, so it is flipped to y up before fitting.
 */
export function fitOutline(plan: XY[], osm: XY[]): Fit[] {
  const flip = plan.map((p) => ({ x: p.x, y: -p.y }))
  const ps = sample(flip, 1), os = sample(osm, 1)
  const fits: Fit[] = []
  for (let i = 0; i < flip.length; i++) for (let j = 0; j < flip.length; j++) {
    if (i === j) continue
    for (let a = 0; a < osm.length; a++) for (let b = 0; b < osm.length; b++) {
      if (a === b) continue
      const t = similarity(flip[i], flip[j], osm[a], osm[b])
      if (!t) continue
      if (t.s * perim(flip) < 0.8 * perim(osm) || t.s * perim(flip) > 1.25 * perim(osm)) continue // size must agree
      const tp = sample(flip.map(t.apply), 2)
      // chamfer both ways
      const d1 = tp.map((p) => distToRing(p, osm))
      const d2 = os.filter((_, k) => k % 2 === 0).map((p) => distToRing(p, flip.map(t.apply)))
      const all = [...d1, ...d2]
      const meanM = all.reduce((x, y) => x + y, 0) / all.length
      const maxM = Math.max(...all)
      fits.push({ apply: (p) => t.apply({ x: p.x, y: -p.y }), scale: t.s, rotationDeg: (t.th * 180) / Math.PI, meanM, maxM })
    }
  }
  fits.sort((x, y) => x.meanM - y.meanM)
  void ps
  return fits
}

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
/** Best fit, or why not: the runner-up with a different pose must be clearly worse (otherwise the outline is symmetric). */
export function bestFit(fits: Fit[], opts = { meanM: 3, maxM: 8, margin: 1.5 }): { fit?: Fit; reason?: string } {
  const f = fits[0]
  if (!f) return { reason: 'no fit' }
  if (f.meanM > opts.meanM || f.maxM > opts.maxM) return { reason: `outline mismatch (mean ${f.meanM.toFixed(1)} m, max ${f.maxM.toFixed(1)} m)` }
  const other = fits.find((g) => angDiff(g.rotationDeg, f.rotationDeg) > 15)
  if (other && other.meanM < Math.max(f.meanM * opts.margin, 1)) return { reason: `ambiguous pose (${f.rotationDeg.toFixed(0)} vs ${other.rotationDeg.toFixed(0)} deg both fit)` }
  return { fit: f }
}
