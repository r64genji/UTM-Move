// The router's query API. Plain functions, so tests and the benchmark call them directly.
// router.worker.ts wraps them with Comlink.
import { z } from 'zod'
import { Place, type LatLon, type TransitData } from '../domain/schemas.ts'
import { planTrip, type Plan, type PlanRequest } from '../domain/router/planTrip.ts'
import type { Graph } from '../domain/walk/graph.ts'
import type { Profile } from '../domain/walk/router.ts'

export type Spot = LatLon | { placeId: string } | { stopId: string }

export interface TripQuery {
  from: Spot
  to: Spot
  when: { type: 'now' | 'depart' | 'arrive'; /** ISO 8601 with offset. Defaults to now. */ at?: string }
  profile: Profile
  /** Flat-ground walking speed, m/s. Default 1.4. */
  walkSpeed?: number
}

export interface RouterData {
  graph: Graph
  transit: TransitData
  places: Place[]
}

export const parsePlaces = (json: unknown): Place[] => z.array(Place).parse(json)

function resolve(d: RouterData, s: Spot, fallbackName: string): { name: string; location: LatLon } {
  if ('placeId' in s) {
    const p = d.places.find((x) => x.id === s.placeId)
    if (!p) throw new Error(`Unknown place: ${s.placeId}`)
    return { name: p.name, location: p.location }
  }
  if ('stopId' in s) {
    const p = d.transit.stops.find((x) => x.id === s.stopId)
    if (!p) throw new Error(`Unknown stop: ${s.stopId}`)
    return { name: p.name, location: p.location }
  }
  return { name: fallbackName, location: { lat: s.lat, lon: s.lon } }
}

/** Plan a trip. The result is plain data and survives structuredClone. */
export function planQuery(d: RouterData, q: TripQuery): Plan {
  const at = q.when.type === 'now' || !q.when.at ? new Date() : new Date(q.when.at)
  if (Number.isNaN(at.getTime())) throw new Error(`Bad time: ${q.when.at}`)
  const req: PlanRequest = {
    from: resolve(d, q.from, 'Start'),
    to: resolve(d, q.to, 'Destination'),
    mode: q.when.type === 'arrive' ? 'arrive' : 'depart',
    at,
    profile: q.profile,
    walkSpeed: q.walkSpeed,
  }
  return planTrip(d.graph, d.transit, req)
}
