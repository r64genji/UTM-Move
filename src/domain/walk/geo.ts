import type { LatLon } from '../schemas.ts'

const R = 6371008.8
const rad = Math.PI / 180

/** Great-circle distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Initial bearing from a to b, degrees clockwise from north, 0..360. */
export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}

/** Part of a polyline between fractions f0 and f1 of its length (f0 > f1 walks it backwards). */
export function slice(line: LatLon[], f0: number, f1: number): LatLon[] {
  if (f0 > f1) return slice(line, f1, f0).reverse()
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distanceM(line[i - 1], line[i]))
  const total = cum[cum.length - 1]
  const at = (d: number): LatLon => {
    let i = 1
    while (i < line.length - 1 && cum[i] < d) i++
    const seg = cum[i] - cum[i - 1]
    const t = seg > 0 ? (d - cum[i - 1]) / seg : 0
    return { lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t, lon: line[i - 1].lon + (line[i].lon - line[i - 1].lon) * t }
  }
  const d0 = f0 * total
  const d1 = f1 * total
  const out = [at(d0)]
  for (let i = 1; i < line.length - 1; i++) if (cum[i] > d0 && cum[i] < d1) out.push(line[i])
  out.push(at(d1))
  return out
}
