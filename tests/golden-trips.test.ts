/// <reference types="node" />
// Golden trips (#23): re-plan every trip in tests/golden/trips.json and compare with baseline.json.
// Needs no network: only the built data (npm run build:transit && npm run build:graph).
// After an intended router change: npx tsx pipeline/golden/baseline.ts, then review the diff.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { loadRouterData, loadTrips, planTrip, straightLineM, type OptionSummary } from '../pipeline/golden/lib.ts'
import { distanceM } from '../src/domain/walk/geo.ts'

const data = loadRouterData()
const trips = loadTrips()
const baseline: Record<string, { straightM: number; options: OptionSummary[] }> = JSON.parse(readFileSync('tests/golden/baseline.json', 'utf8'))
const stopIds = new Set(data.transit.stops.map((s) => s.id))

/** Walk-only route may be at most this many times the straight line, unless the trip sets maxDetour. */
const MAX_DETOUR = 1.8
const MAX_WALK_MPS = 2.2
const MAX_BUS_MPS = 25
const best = (o: OptionSummary[]) => Math.min(...o.map((x) => x.durationS))

describe('golden trips', () => {
  test('the trip list is about 30 and every trip has a baseline', () => {
    expect(trips.length).toBeGreaterThanOrEqual(30)
    expect(trips.filter((t) => !baseline[t.id])).toEqual([])
  })

  describe.each(trips.map((t) => [t.id, t] as const))('%s', (_id, t) => {
    const now = planTrip(data, t)
    const base = baseline[t.id].options

    test('is no more than 10% slower than the baseline', () => {
      expect(best(now)).toBeLessThanOrEqual(best(base) * 1.1)
    })

    test('still offers a bus when the baseline did', () => {
      const hadBus = base.some((o) => o.kind === 'bus')
      expect(hadBus && !now.some((o) => o.kind === 'bus')).toBe(false)
    })

    test('is plausible: walk detour, leg speeds, real stops in time order', () => {
      const walk = now.find((o) => o.kind === 'walk')!
      expect(walk.walkM / straightLineM(t)).toBeLessThanOrEqual(t.maxDetour ?? MAX_DETOUR)
      for (const o of now) {
        let clock = 0
        expect(o.legs.some((l, i) => i > 0 && l.kind === 'walk' && o.legs[i - 1].kind === 'walk')).toBe(false)
        for (const l of o.legs) {
          expect(Date.parse(l.departAt)).toBeGreaterThanOrEqual(clock)
          expect(Date.parse(l.arriveAt)).toBeGreaterThanOrEqual(Date.parse(l.departAt))
          clock = Date.parse(l.arriveAt)
          if (l.distanceM > 30) {
            expect(l.distanceM / l.durationS).toBeLessThanOrEqual(l.kind === 'walk' ? MAX_WALK_MPS : MAX_BUS_MPS)
          }
          if (l.kind === 'bus') {
            expect(l.stops!.length).toBeGreaterThanOrEqual(2)
            let prev = 0
            for (const s of l.stops!) {
              expect(stopIds.has(s.id)).toBe(true)
              expect(Date.parse(s.at)).toBeGreaterThanOrEqual(prev)
              prev = Date.parse(s.at)
            }
          }
        }
        // The route ends where the trip ends.
        const last = o.legs[o.legs.length - 1].geometry.at(-1)!
        expect(distanceM({ lat: last[0], lon: last[1] }, t.to)).toBeLessThan(80)
      }
    })
  })
})
