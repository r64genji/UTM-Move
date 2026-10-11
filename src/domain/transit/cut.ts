// Cut a bus leg's line from a pattern polyline: snap each stop onto the line, then slice between two stops.
import type { LatLon } from '../schemas.ts'
import { distanceM } from '../walk/geo.ts'

const M_PER_DEG = 111_320
/** A stop may be this much farther from the line than its best match and still count, so earlier passes win on loops. */
const EARLIER_PASS_SLACK_M = 25

function cumulative(line: LatLon[]): number[] {
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distanceM(line[i - 1], line[i]))
  return cum
}

/**
 * Distance along `line` (metres) of each stop, in stop order and never going backwards.
 * Each stop is projected on the nearest segment ahead of the previous stop.
 */
export function stopOffsets(line: LatLon[], stops: LatLon[]): number[] {
  if (line.length < 2) return stops.map(() => 0)
  const cum = cumulative(line)
  const kx = M_PER_DEG * Math.cos((line[0].lat * Math.PI) / 180)
  const out: number[] = []
  let seg = 0
  let along = 0
  for (const p of stops) {
    const hits: { seg: number; d: number; at: number }[] = []
    for (let s = seg; s < line.length - 1; s++) {
      const ax = line[s].lon * kx, ay = line[s].lat * M_PER_DEG
      const dx = line[s + 1].lon * kx - ax, dy = line[s + 1].lat * M_PER_DEG - ay
      const len2 = dx * dx + dy * dy
      const u = len2 > 0 ? Math.min(1, Math.max(0, ((p.lon * kx - ax) * dx + (p.lat * M_PER_DEG - ay) * dy) / len2)) : 0
      const d = Math.hypot(ax + u * dx - p.lon * kx, ay + u * dy - p.lat * M_PER_DEG)
      hits.push({ seg: s, d, at: cum[s] + u * (cum[s + 1] - cum[s]) })
    }
    const min = Math.min(...hits.map((h) => h.d))
    const pick = hits.find((h) => h.d <= min + EARLIER_PASS_SLACK_M)!
    seg = pick.seg
    along = Math.max(along, pick.at)
    out.push(along)
  }
  return out
}

/** The part of `line` between two distances along it. The ends are the exact cut points. */
export function cutLine(line: LatLon[], from: number, to: number): LatLon[] {
  const cum = cumulative(line)
  const at = (d: number): LatLon => {
    let i = 1
    while (i < line.length - 1 && cum[i] < d) i++
    const seg = cum[i] - cum[i - 1]
    const t = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i - 1]) / seg)) : 0
    return { lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * t, lon: line[i - 1].lon + (line[i].lon - line[i - 1].lon) * t }
  }
  const out = [at(from)]
  for (let i = 0; i < line.length; i++) if (cum[i] > from && cum[i] < to) out.push(line[i])
  out.push(at(to))
  return out
}

/**
 * Line for a ride from stop index `board` to `alight` of a pattern. Starts and ends exactly on the stops,
 * so a line that begins away from its first stop (a few v1 lines do) still reaches it.
 */
export function rideGeometry(line: LatLon[], stops: LatLon[], board: number, alight: number): LatLon[] {
  if (line.length < 2) return stops.slice(board, alight + 1)
  const offsets = stopOffsets(line, stops)
  const cut = cutLine(line, offsets[board], offsets[alight])
  if (distanceM(cut[0], stops[board]) > 2) cut.unshift(stops[board])
  if (distanceM(cut[cut.length - 1], stops[alight]) > 2) cut.push(stops[alight])
  return cut
}
