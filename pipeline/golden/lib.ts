// Shared by the golden-trips generator and tests/golden-trips.test.ts. Plans every trip in
// tests/golden/trips.json with planQuery on the real built data and reduces it to plain numbers.
import { readFileSync } from 'node:fs'
import { TransitData, type LatLon } from '../../src/domain/schemas.ts'
import { decodeGraph } from '../../src/domain/walk/graph.ts'
import { distanceM } from '../../src/domain/walk/geo.ts'
import { planQuery, type RouterData } from '../../src/workers/routerApi.ts'

export interface GoldenTrip {
  id: string
  name: string
  category: string
  from: LatLon & { name: string }
  to: LatLon & { name: string }
  at: string
  profile: 'fastest' | 'sheltered' | 'no-stairs'
  note?: string
  /** Plausibility exemption: walk may be this many times the straight line. Say why in docs/v2/golden-trips.md. */
  maxDetour?: number
  detourReason?: string
}

export interface LegSummary {
  kind: 'walk' | 'bus'
  durationS: number
  distanceM: number
  from: string
  to: string
  departAt: string
  arriveAt: string
  route?: string
  /** Every stop of a bus leg, in order: id and time. */
  stops?: { id: string; at: string }[]
  geometry: [number, number][] // [lat, lon], 5 decimals
}

export interface OptionSummary {
  kind: 'walk' | 'bus'
  durationS: number
  walkS: number
  walkM: number
  transfers: number
  legs: LegSummary[]
}

export const loadTrips = (): GoldenTrip[] => JSON.parse(readFileSync('tests/golden/trips.json', 'utf8'))

export function loadRouterData(): RouterData {
  const buf = readFileSync('public/data/graph.bin')
  return {
    graph: decodeGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    transit: TransitData.parse(JSON.parse(readFileSync('public/data/transit.json', 'utf8'))),
    places: [],
  }
}

export const lengthM = (g: LatLon[]) => g.slice(1).reduce((s, p, i) => s + distanceM(g[i], p), 0)

export function planTrip(d: RouterData, t: GoldenTrip): OptionSummary[] {
  const plan = planQuery(d, { from: t.from, to: t.to, when: { type: 'depart', at: t.at }, profile: t.profile })
  return plan.options.map((o) => {
    const legs: LegSummary[] = o.legs.map((l) => ({
      kind: l.kind,
      durationS: Math.round(l.durationS),
      distanceM: Math.round(lengthM(l.geometry)),
      from: l.from.name,
      to: l.to.name,
      departAt: l.departAt.toISOString(),
      arriveAt: l.arriveAt.toISOString(),
      ...(l.kind === 'bus' ? { route: l.route?.id, stops: l.stops?.map((s) => ({ id: s.id, at: s.at.toISOString() })) } : {}),
      geometry: l.geometry.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]),
    }))
    return {
      kind: o.kind,
      durationS: Math.round(o.durationS),
      walkS: Math.round(o.walkS),
      walkM: legs.filter((l) => l.kind === 'walk').reduce((s, l) => s + l.distanceM, 0),
      transfers: o.transfers,
      legs,
    }
  })
}

export const straightLineM = (t: GoldenTrip) => distanceM(t.from, t.to)
