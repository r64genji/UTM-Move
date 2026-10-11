// Small geo helpers for the places pipeline. Coordinates are { lat, lon }.
import { readFileSync } from 'node:fs'
import type { LatLon } from '../../src/domain/schemas.ts'

const R = 6371008.8

/** Great-circle distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Ray-casting point-in-polygon on a single ring. */
export function inRing(p: LatLon, ring: LatLon[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
  }
  return inside
}

/** Distance in metres from p to the nearest point of segment ab (local flat projection). */
export function distanceToSegmentM(p: LatLon, a: LatLon, b: LatLon): number {
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111320
  const ky = 110574
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky
  const bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** Nearest point on segment ab to p. */
export function nearestOnSegment(p: LatLon, a: LatLon, b: LatLon): LatLon {
  const k = Math.cos((p.lat * Math.PI) / 180)
  const dx = (b.lon - a.lon) * k, dy = b.lat - a.lat
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (((p.lon - a.lon) * k) * dx + (p.lat - a.lat) * dy) / len2))
  return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }
}

export function distanceToRingM(p: LatLon, ring: LatLon[]): number {
  let best = Infinity
  for (let i = 1; i < ring.length; i++) best = Math.min(best, distanceToSegmentM(p, ring[i - 1], ring[i]))
  return best
}

/** The UTM campus polygon (outer ring) from data/campus-boundary.geojson. */
export function loadBoundary(path = 'data/campus-boundary.geojson'): LatLon[] {
  const gj = JSON.parse(readFileSync(path, 'utf8'))
  const coords: number[][] = gj.features[0].geometry.coordinates[0]
  return coords.map(([lon, lat]) => ({ lat, lon }))
}

