// 100 reproducible random trips for the router benchmarks.
import type { Graph } from '../../src/domain/walk/graph.ts'
import { toDeg } from '../../src/domain/walk/graph.ts'
import type { TransitData } from '../../src/domain/schemas.ts'
import type { Spot, TripQuery } from '../../src/workers/routerApi.ts'

export function makeQueries(g: Graph, transit: TransitData, n = 100, seed = 7): TripQuery[] {
  let s = seed
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]
  const point = (): Spot => {
    const i = Math.floor(rand() * g.nodeCount)
    return { lat: toDeg(g.nodeLat[i]) + (rand() - 0.5) * 4e-4, lon: toDeg(g.nodeLon[i]) + (rand() - 0.5) * 4e-4 }
  }
  const spot = (): Spot => (rand() < 0.4 ? { stopId: pick(transit.stops).id } : point())
  return Array.from({ length: n }, () => {
    const mins = 7 * 60 + Math.floor(rand() * 13 * 60)
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return {
      from: spot(),
      to: spot(),
      when: { type: pick(['depart', 'depart', 'arrive'] as const), at: `2026-03-17T${hh}:${mm}:00+08:00` },
      profile: pick(['fastest', 'sheltered', 'no-stairs'] as const),
    }
  })
}

export function percentiles(ms: number[]) {
  const a = [...ms].sort((x, y) => x - y)
  const at = (p: number) => a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)]
  return { p50: at(0.5), p95: at(0.95), max: a[a.length - 1] }
}
