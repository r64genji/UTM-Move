/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { loadRouterData } from '../../../pipeline/golden/lib.ts'
import { planQuery } from '../../workers/routerApi.ts'
import type { Leg, TripOption } from '../router/planTrip.ts'
import type { LatLon } from '../schemas.ts'
import { distanceM } from '../walk/geo.ts'
import { createNavigation, follow, startState, view, type Fix, type NavEvent, type NavState } from './follow.ts'

const data = loadRouterData()
const FROM = { lat: 1.565247, lon: 103.635122 } // Kolej Tun Dr Ismail
const TO = { lat: 1.56415, lon: 103.638103 } // N28 School of Computing
const plan = (from: LatLon) =>
  planQuery(data, { from, to: TO, when: { type: 'depart', at: '2026-03-17T10:00:00+08:00' }, profile: 'fastest' }).options[0]

/** The real walking route from the graph, as lat/lon pairs. */
const ROUTE: [number, number][] = [
  [1.565247, 103.635122], [1.565336, 103.635119], [1.565333, 103.63503], [1.565296, 103.634823], [1.565201, 103.634591], [1.565114, 103.634437],
  [1.565151, 103.634416], [1.565273, 103.634638], [1.565362, 103.634924], [1.565392, 103.635244], [1.565401, 103.63534], [1.565398, 103.635664],
  [1.565397, 103.635733], [1.565396, 103.635813], [1.565372, 103.635905], [1.56533, 103.635984], [1.565267, 103.636056], [1.565142, 103.636135],
  [1.565076, 103.636147], [1.564895, 103.636156], [1.56459, 103.636126], [1.564581, 103.636184], [1.564554, 103.63647], [1.564527, 103.636488],
  [1.564496, 103.636712], [1.564442, 103.636768], [1.564398, 103.636844], [1.564389, 103.636993], [1.564419, 103.637075], [1.564427, 103.637161],
  [1.564471, 103.637163], [1.564477, 103.637179], [1.56448, 103.637265], [1.564471, 103.637274], [1.564435, 103.637285], [1.564154, 103.637303],
  [1.564141, 103.637339], [1.564155, 103.637393], [1.564218, 103.637391], [1.564332, 103.637361], [1.564431, 103.637376], [1.56442, 103.637449],
  [1.564171, 103.63765], [1.564328, 103.637832], [1.564348, 103.63785], [1.56433, 103.637879], [1.564169, 103.638025], [1.564137, 103.638031],
  [1.56415, 103.638103],
]
const rounded = (o: TripOption) => o.legs[0].geometry.map((p): [number, number] => [+p.lat.toFixed(6), +p.lon.toFixed(6)])

/** A fix every `stepM` metres along a line, one every `everyS` seconds from `t0`. */
function walkAlong(line: LatLon[], t0: number, stepM = 4, everyS = 3): Fix[] {
  const out: Fix[] = []
  let t = t0
  for (let i = 1; i < line.length; i++) {
    const len = distanceM(line[i - 1], line[i])
    for (let d = 0; d < len; d += stepM) {
      const f = d / len
      out.push({ lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * f, lon: line[i - 1].lon + (line[i].lon - line[i - 1].lon) * f, accuracy: 8, t })
      t += everyS * 1000
    }
  }
  const end = line[line.length - 1]
  out.push({ ...end, accuracy: 8, t })
  return out
}

function replay(nav: ReturnType<typeof createNavigation>, state: NavState, fixes: Fix[]) {
  const events: NavEvent[] = []
  for (const fix of fixes) {
    const r = follow(nav, state, fix)
    state = r.state
    events.push(...r.events)
  }
  return { state, events }
}
const texts = (events: NavEvent[]) => events.flatMap((e) => (e.type === 'step' ? [e.text] : []))

describe('replaying a GPS track on the real graph', () => {
  const first = plan(FROM)
  const line = first.legs[0].geometry

  test('the fixture is what the router plans today', () => {
    expect(rounded(first)).toEqual(ROUTE)
  })

  // Walk 90 m past the loop, then 40 m south of the path for 12 s, then back on a new route.
  const onRoute = walkAlong(line.slice(0, 21), 0)
  const last = onRoute[onRoute.length - 1]
  const stray = (i: number): Fix => ({ lat: last.lat - 40 / 111_195, lon: last.lon, accuracy: 10, t: last.t + (i + 1) * 1000 })
  const deviation = Array.from({ length: 12 }, (_, i) => stray(i))

  test('emits each step once, then exactly one re-route after 10 s off the path', () => {
    const nav = createNavigation(first)
    const a = replay(nav, startState, [...onRoute, ...deviation])
    expect(texts(a.events)).toEqual(['Head west', 'Turn right after M24', 'Turn right after M24', 'Turn left after M20'])
    expect(a.events.filter((e) => e.type === 'reroute')).toHaveLength(1)
    const re = a.events.find((e) => e.type === 'reroute')!
    expect(re.type === 'reroute' && re.from.t).toBe(last.t + 11_000)
  })

  test('after the new plan, the new route is followed to arrival', () => {
    const here = deviation[deviation.length - 1]
    const second = plan(here)
    const nav = createNavigation(second)
    const b = replay(nav, startState, walkAlong(second.legs[0].geometry, here.t + 3000))
    expect(texts(b.events)).toEqual([
      'Head northeast', 'Turn right after M06', 'Bear right', 'Turn left', 'Turn left', 'Turn right', 'Bear right', 'Turn left',
      'Turn right', 'Arrive at Destination',
    ])
    expect(b.events.filter((e) => e.type === 'reroute')).toHaveLength(0)
    expect(b.events.at(-1)).toEqual({ type: 'arrive' })
  })

  test('rough fixes are ignored', () => {
    const nav = createNavigation(first)
    const r = follow(nav, startState, { ...deviation[0], accuracy: 80 })
    expect(r).toEqual({ state: startState, events: [] })
  })
})

describe('bus legs', () => {
  const at = (hhmm: string) => new Date(`2026-03-17T${hhmm}:00+08:00`)
  const walk = (a: LatLon, b: LatLon): Leg => ({
    kind: 'walk', from: { name: 'Home', location: a }, to: { name: 'Stop A', location: b }, departAt: at('08:00'), arriveAt: at('08:06'),
    durationS: 360, geometry: [a, b], labels: [],
    steps: [{ turn: 'depart', instruction: 'Head east', location: a, distanceM: 504 }, { turn: 'arrive', instruction: 'Arrive at Stop A', location: b, distanceM: 0 }],
  })
  const A = { lat: 1.56, lon: 103.64 }
  const B = { lat: 1.56, lon: 103.6445 } // 500 m east
  const C = { lat: 1.56, lon: 103.66 }
  const bus: Leg = {
    kind: 'bus', from: { name: 'Stop A', location: B }, to: { name: 'Stop B', location: C }, departAt: at('08:10'), arriveAt: at('08:20'),
    durationS: 600, geometry: [B, C], labels: [], route: { id: 'C', name: 'Route C' }, headsign: 'Library',
  }
  const option: TripOption = { kind: 'bus', departAt: at('08:00'), arriveAt: at('08:20'), durationS: 1200, walkS: 360, transfers: 0, legs: [walk(A, B), bus] }
  const nav = createNavigation(option)

  test('the maneuvers read Board route C to Library, Get off at Stop B', () => {
    expect(nav.maneuvers.map((m) => m.text)).toEqual(['Head east', 'Board route C to Library', 'Get off at Stop B'])
  })

  test('walking too slowly for the bus', () => {
    const r = follow(nav, startState, { ...A, accuracy: 5, t: 0 })
    expect(view(nav, r.state, at('08:06')).busWarning).toEqual({ text: 'Bus leaves in 4 min. You need 6 min to walk.', late: true })
  })
})
