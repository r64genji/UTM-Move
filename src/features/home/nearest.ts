import type { LatLon, Stop, TransitData } from '../../domain/schemas.ts'
import { minutesBetween, klDateTime, nextDepartures } from '../../domain/transit/departures.ts'
import { distanceM } from '../../domain/walk/geo.ts'

/** The stop closest to a point, with its distance in metres. */
export function nearestStop(stops: Stop[], from: LatLon): { stop: Stop; distanceM: number } | null {
  let best: { stop: Stop; distanceM: number } | null = null
  for (const stop of stops) {
    const d = distanceM(from, stop.location)
    if (!best || d < best.distanceM) best = { stop, distanceM: d }
  }
  return best
}

export type Eta = { routeId: string; headsign?: string; time: string; minutes: number }

/** The next bus of each route from a stop, soonest first. Several patterns of one route count once. */
export function nextPerRoute(data: TransitData, stopId: string, now: Date, limit = 3): Eta[] {
  const { time } = klDateTime(now)
  const out: Eta[] = []
  for (const d of nextDepartures(data, stopId, now, 200)) {
    if (!out.some((e) => e.routeId === d.routeId)) out.push({ routeId: d.routeId, headsign: d.headsign, time: d.time, minutes: minutesBetween(time, d.time) })
  }
  return out.slice(0, limit)
}

/** "Good Morning" until noon, "Good Afternoon" until 17:00, then "Good Evening". Hour is Kuala Lumpur time. */
export const greeting = (now: Date) => {
  const hour = Number(klDateTime(now).time.slice(0, 2))
  return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
}
