import type { LatLon } from '../../domain/schemas.ts'

/** MapLibre wants `[lon, lat]`. Convert only at the map edge. */
export const toLngLat = (p: LatLon): [number, number] => [p.lon, p.lat]

/** A circle of `radiusM` metres around `center`, as a GeoJSON ring (lon/lat). */
export function circleRing(center: LatLon, radiusM: number, steps = 64): [number, number][] {
  const mPerDegLat = 111_320
  const mPerDegLon = mPerDegLat * Math.cos((center.lat * Math.PI) / 180)
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([center.lon + (radiusM * Math.cos(a)) / mPerDegLon, center.lat + (radiusM * Math.sin(a)) / mPerDegLat])
  }
  return ring
}
