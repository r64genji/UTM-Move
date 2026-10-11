import { describe, expect, test } from 'vitest'
import type { LatLon, TransitData } from '../schemas.ts'
import { distanceM } from '../walk/geo.ts'
import { decodeGraph, encodeGraph } from '../walk/graph.ts'
import { planTrip, type Plan, type PlanRequest } from './planTrip.ts'

// Points in metres east of a spot on campus. The whole map is one road along x.
const P = (x: number): LatLon => ({ lat: 1.56, lon: 103.64 + x / 111_279 })
const X = (p: LatLon) => Math.round(((p.lon - 103.64) * 111_279) / 10) * 10

// O 0 -- A 140 -- M1 1400 -- M2 1500 -- B 2900 -- D 3040. Walking at 1.4 m/s: O to D is 2170 s.
const xs = [0, 140, 1400, 1500, 2900, 3040]
const nodes = xs.map((x) => P(x))
const g = decodeGraph(encodeGraph({
  nodes,
  edges: xs.slice(1).map((_, i) => ({ from: i, to: i + 1, lengthM: Math.round(distanceM(nodes[i], nodes[i + 1])), kind: 'road' as const })),
}))

function encodePolyline(points: LatLon[]): string {
  let out = ''
  let la = 0
  let lo = 0
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1
    while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5 }
    out += String.fromCharCode(n + 63)
  }
  for (const p of points) {
    const a = Math.round(p.lat * 1e5), b = Math.round(p.lon * 1e5)
    put(a - la); put(b - lo); la = a; lo = b
  }
  return out
}

const stops = [['A', 140], ['M1', 1400], ['M2', 1500], ['B', 2900]] as const
const trip = (id: string, routeId: string, patternId: string, headsign: string, st: [string, string][]) => ({
  id, routeId, patternId, headsign, calendarId: 'wk', stopTimes: st.map(([stopId, time]) => ({ stopId, time })),
})
function timetable(trips: ReturnType<typeof trip>[]): TransitData {
  return {
    stops: stops.map(([id, x]) => ({ id, name: `Stop ${id}`, location: P(x) })),
    routes: [{ id: 'R1', name: 'Route 1', color: '#ff0000' }, { id: 'R2', name: 'Route 2', color: '#0000ff' }],
    // R1's line starts 100 m before A and runs past B.
    patterns: [
      { id: 'R1:out', routeId: 'R1', headsign: 'To B', stopIds: ['A', 'B'], shape: encodePolyline([P(40), P(1000), P(3000)]) },
      { id: 'R1:short', routeId: 'R1', headsign: 'To M1', stopIds: ['A', 'M1'], shape: encodePolyline([P(40), P(1400)]) },
      { id: 'R2:out', routeId: 'R2', headsign: 'To B', stopIds: ['M2', 'B'], shape: encodePolyline([P(1500), P(2900)]) },
    ],
    calendars: [{ id: 'wk', days: ['mon', 'tue', 'wed', 'thu', 'fri'], startDate: '2026-01-01', endDate: '2026-12-31', exceptions: [] }],
    trips,
  }
}

const direct = timetable([
  trip('r1-0810', 'R1', 'R1:out', 'To B', [['A', '08:10'], ['B', '08:22']]),
  trip('r1-0910', 'R1', 'R1:out', 'To B', [['A', '09:10'], ['B', '09:22']]),
])

// KL is UTC+8. Tuesday 2026-03-10.
const kl = (hms: string, date = '2026-03-10') => new Date(`${date}T${hms}+08:00`)
const hms = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(11, 19)
const req = (over: Partial<PlanRequest>): PlanRequest => ({
  from: { name: 'Origin', location: P(0) },
  to: { name: 'Destination', location: P(3040) },
  mode: 'depart',
  at: kl('08:00:00'),
  ...over,
})
const summary = (p: Plan) => p.options.map((o) => ({
  kind: o.kind, depart: hms(o.departAt), arrive: hms(o.arriveAt), transfers: o.transfers, walkS: o.walkS,
  legs: o.legs.map((l) => `${l.kind} ${l.from.name} > ${l.to.name} ${hms(l.departAt)}-${hms(l.arriveAt)}`),
}))

describe('planTrip', () => {
  test('depart now: walk-only plus the bus, with literal legs', () => {
    const plan = planTrip(g, direct, req({}))
    expect(summary(plan)).toEqual([
      { kind: 'walk', depart: '08:00:00', arrive: '08:36:10', transfers: 0, walkS: 2170, legs: ['walk Origin > Destination 08:00:00-08:36:10'] },
      {
        kind: 'bus', depart: '08:08:19', arrive: '08:23:41', transfers: 0, walkS: 202,
        legs: ['walk Origin > Stop A 08:08:19-08:10:00', 'bus Stop A > Stop B 08:10:00-08:22:00', 'walk Stop B > Destination 08:22:00-08:23:41'],
      },
    ])
    const bus = plan.options[1].legs[1]
    expect(bus.route).toEqual({ id: 'R1', name: 'Route 1', color: '#ff0000' })
    expect(bus.headsign).toBe('To B')
    expect(bus.labels).toEqual([{ text: 'Bus in 10 min' }])
    expect(bus.stops!.map((s) => [s.id, hms(s.at)])).toEqual([['A', '08:10:00'], ['B', '08:22:00']])
    // Cut from the line between A and B: starts on A, keeps the vertex at 1000 m, ends on B.
    expect(bus.geometry.map(X)).toEqual([140, 1000, 2900])
    expect(plan.options[1].legs[0].steps!.map((s) => s.instruction)).toEqual(['Head east', 'Arrive at Stop A'])
  })

  test('depart at 09:00 boards the 09:10', () => {
    const plan = planTrip(g, direct, req({ at: kl('09:00:00') }))
    expect(summary(plan)[1]).toMatchObject({ depart: '09:08:19', arrive: '09:23:41' })
    expect(plan.options[1].legs[1].labels).toEqual([{ text: 'Bus in 10 min' }])
  })

  test('arrive by 08:25 takes the 08:10 and leaves as late as possible', () => {
    const plan = planTrip(g, direct, req({ mode: 'arrive', at: kl('08:25:00') }))
    expect(summary(plan)).toEqual([
      { kind: 'walk', depart: '07:48:50', arrive: '08:25:00', transfers: 0, walkS: 2170, legs: ['walk Origin > Destination 07:48:50-08:25:00'] },
      {
        kind: 'bus', depart: '08:08:19', arrive: '08:23:41', transfers: 0, walkS: 202,
        legs: ['walk Origin > Stop A 08:08:19-08:10:00', 'bus Stop A > Stop B 08:10:00-08:22:00', 'walk Stop B > Destination 08:22:00-08:23:41'],
      },
    ])
  })

  test('arrive by 08:20 cannot use the 08:10 bus: walk only', () => {
    expect(summary(planTrip(g, direct, req({ mode: 'arrive', at: kl('08:20:00') })))).toHaveLength(1)
  })

  test('walk only is still there when no bus runs (night, weekend)', () => {
    expect(summary(planTrip(g, direct, req({ at: kl('23:00:00') })))).toEqual([
      { kind: 'walk', depart: '23:00:00', arrive: '23:36:10', transfers: 0, walkS: 2170, legs: ['walk Origin > Destination 23:00:00-23:36:10'] },
    ])
    expect(planTrip(g, direct, req({ at: kl('08:00:00', '2026-03-14') })).options).toHaveLength(1)
  })

  test('a bus that saves under 2 minutes is dropped', () => {
    // Arrives 08:34:00 + 100 s = 08:35:40, only 31 s before walking.
    const slow = timetable([trip('slow', 'R1', 'R1:out', 'To B', [['A', '08:10'], ['B', '08:34']])])
    expect(planTrip(g, slow, req({})).options.map((o) => o.kind)).toEqual(['walk'])
    // Arrives 08:32:00 + 100 s = 08:33:40, saves 2.5 minutes: offered.
    const ok = timetable([trip('ok', 'R1', 'R1:out', 'To B', [['A', '08:10'], ['B', '08:32']])])
    expect(planTrip(g, ok, req({})).options.map((o) => o.kind)).toEqual(['walk', 'bus'])
  })

  test('one transfer: footpath between M1 and M2', () => {
    const data = timetable([
      trip('r1', 'R1', 'R1:short', 'To M1', [['A', '08:02'], ['M1', '08:05']]),
      trip('r2', 'R2', 'R2:out', 'To B', [['M2', '08:08'], ['B', '08:13']]),
    ])
    const plan = planTrip(g, data, req({}))
    expect(summary(plan)[1]).toEqual({
      kind: 'bus', depart: '08:00:19', arrive: '08:14:41', transfers: 1, walkS: 274,
      legs: [
        'walk Origin > Stop A 08:00:19-08:02:00', 'bus Stop A > Stop M1 08:02:00-08:05:00',
        'walk Stop M1 > Stop M2 08:05:00-08:06:12', 'bus Stop M2 > Stop B 08:08:00-08:13:00',
        'walk Stop B > Destination 08:13:00-08:14:41',
      ],
    })
    expect(plan.options[1].legs[3].labels).toEqual([{ text: 'Wait 2 min' }])
    expect(plan.options[1].legs[2].geometry.map(X)).toEqual([1400, 1500])
  })
})
