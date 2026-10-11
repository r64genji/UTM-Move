import { describe, expect, test } from 'vitest'
import type { OpeningHours } from '../schemas.ts'
import { distanceM } from './geo.ts'
import { decodeGraph, edgeCoords, encodeGraph, nodeLatLon, type GraphInput, type GraphInputEdge } from './graph.ts'
import { openUntil } from './hours.ts'
import { pathToLeg, route, walkTimes, type Profile } from './router.ts'
import { snapToEdge, snapToNode } from './snap.ts'

// Points in metres east (x) and north (y) of a spot on campus.
const P = (x: number, y: number) => ({ lat: 1.56 + y / 110_574, lon: 103.64 + x / 111_279 })

function graph(points: [number, number, string?][], edges: (Omit<GraphInputEdge, 'lengthM'> & { lengthM?: number })[]) {
  const nodes = points.map(([x, y, name]) => ({ ...P(x, y), name }))
  const input: GraphInput = {
    nodes,
    edges: edges.map((e) => ({ lengthM: Math.round(distanceM(nodes[e.from], nodes[e.to])), ...e })),
  }
  return decodeGraph(encodeGraph(input))
}

// KL is UTC+8. Monday 2026-10-12.
const MON_10AM = new Date('2026-10-12T02:00:00Z')
const MON_8PM = new Date('2026-10-12T12:00:00Z')
const nodesOf = (g: ReturnType<typeof graph>, from: number, to: number, profile: Profile, at = MON_10AM) =>
  route(g, from, to, { profile, at })?.nodes

// A(0) -- B(1) -- C(2) open road; A - D(3) - E(4) - C covered; B -> F(5) by steps or a longer ramp via G(6).
const campus = graph(
  [[0, 0], [100, 0, 'FKE P05'], [200, 0], [0, 50], [200, 50, 'Covered stop'], [100, -60], [180, -60]],
  [
    { from: 0, to: 1, kind: 'road' },
    { from: 1, to: 2, kind: 'road' },
    { from: 0, to: 3, kind: 'covered', sheltered: true },
    { from: 3, to: 4, kind: 'covered', sheltered: true },
    { from: 4, to: 2, kind: 'covered', sheltered: true },
    { from: 1, to: 5, kind: 'steps', climbUpM: 8 },
    { from: 1, to: 6, kind: 'footway', climbUpM: 4 },
    { from: 6, to: 5, kind: 'footway', climbUpM: 4 },
  ],
)

// X(0) to Y(1): through a building (doors 0-2, 3-1, inside 2-3) or around it via Z(4).
const HOURS: OpeningHours = [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '08:00', close: '18:00' }]
const building = (frontDoorStepFree: boolean) =>
  graph(
    [[0, 0], [100, 0], [10, 0], [90, 0], [50, 80]],
    [
      { from: 0, to: 2, kind: 'door', stepFree: frontDoorStepFree, hours: HOURS, name: 'FKE P05' },
      { from: 2, to: 3, kind: 'indoor', indoor: true, sheltered: true, hours: HOURS, name: 'FKE P05' },
      { from: 3, to: 1, kind: 'door', stepFree: true, hours: HOURS, name: 'FKE P05' },
      { from: 0, to: 4, kind: 'road' },
      { from: 4, to: 1, kind: 'road' },
    ],
  )

describe('profiles pick the expected path', () => {
  test('fastest takes the open road, sheltered takes the covered walkway', () => {
    expect(nodesOf(campus, 0, 2, 'fastest')).toEqual([0, 1, 2])
    expect(nodesOf(campus, 0, 2, 'sheltered')).toEqual([0, 3, 4, 2])
  })

  test('fastest climbs the steps, no-stairs takes the ramp', () => {
    expect(nodesOf(campus, 1, 5, 'fastest')).toEqual([1, 5])
    expect(nodesOf(campus, 1, 5, 'no-stairs')).toEqual([1, 6, 5])
  })

  test('a likely shortcut must save more than its penalty', () => {
    const shortcut = (detourY: number) =>
      graph([[0, 0], [100, 0], [50, detourY]], [
        { from: 0, to: 1, kind: 'shortcut', likely: true },
        { from: 0, to: 2, kind: 'road' },
        { from: 2, to: 1, kind: 'road' },
      ])
    expect(nodesOf(shortcut(10), 0, 1, 'fastest')).toEqual([0, 2, 1]) // road 102 m beats 100 m x 1.2
    expect(nodesOf(shortcut(40), 0, 1, 'fastest')).toEqual([0, 1]) // road 128 m loses
  })

  test('goes through the building while open and around it when closed', () => {
    const g = building(true)
    expect(nodesOf(g, 0, 1, 'fastest', MON_10AM)).toEqual([0, 2, 3, 1])
    expect(nodesOf(g, 0, 1, 'fastest', MON_8PM)).toEqual([0, 4, 1])
    expect(nodesOf(g, 0, 1, 'fastest', new Date('2026-10-11T02:00:00Z'))).toEqual([0, 4, 1]) // Sunday
  })

  test('no-stairs skips a door that is not step-free', () => {
    expect(nodesOf(building(false), 0, 1, 'fastest')).toEqual([0, 2, 3, 1])
    expect(nodesOf(building(false), 0, 1, 'no-stairs')).toEqual([0, 4, 1])
  })

  test('no route when every way is removed', () => {
    const g = graph([[0, 0], [0, 30]], [{ from: 0, to: 1, kind: 'steps' }])
    expect(route(g, 0, 1, { profile: 'no-stairs', at: MON_10AM })).toBeNull()
  })
})

describe('snapping', () => {
  test('nearest node and projection onto the nearest edge', () => {
    expect(snapToNode(campus, P(97, 4))).toBe(1)
    const s = snapToEdge(campus, P(50, -5))!
    expect(s.edge).toBe(0)
    expect(s.t).toBeCloseTo(0.5, 2)
    expect(s.distanceM).toBeCloseTo(5, 0)
  })

  test('routes between two snapped points', () => {
    const p = route(campus, snapToEdge(campus, P(50, -5))!, snapToEdge(campus, P(150, -3))!, { profile: 'fastest', at: MON_10AM })!
    expect(p.nodes).toEqual([1])
    expect(p.distanceM).toBeCloseTo(100, 0)
    // Both points on one edge: walk straight along it.
    const q = route(campus, snapToEdge(campus, P(20, 2))!, snapToEdge(campus, P(70, 2))!, { profile: 'fastest', at: MON_10AM })!
    expect(q.nodes).toEqual([])
    expect(q.distanceM).toBeCloseTo(50, 0)
  })
})

describe('one-to-many', () => {
  test('walk time to each stop, capped', () => {
    const t = walkTimes(campus, 0, [1, 2, 3], { profile: 'fastest', at: MON_10AM, maxTimeS: 100 })
    expect([...t].map(Math.round)).toEqual([71, Infinity, 36])
  })

  test('reverse gives time from each node to the destination (downhill steps are faster)', () => {
    const up = walkTimes(campus, 5, [1], { profile: 'fastest', at: MON_10AM, maxTimeS: 900, reverse: true })
    const down = walkTimes(campus, 1, [5], { profile: 'fastest', at: MON_10AM, maxTimeS: 900, reverse: true })
    expect(Math.round(up[0])).toBe(68) // B up the steps to F
    expect(Math.round(down[0])).toBe(48) // F down the steps to B
  })
})

describe('leg', () => {
  test('labels the building and gives steps with landmarks', () => {
    const g = building(true)
    const leg = pathToLeg(g, route(g, 0, 1, { profile: 'fastest', at: MON_10AM })!, MON_10AM, 'Bus stop')
    expect(leg.labels).toEqual([{ text: 'Through FKE P05, open until 18:00', from: 0, to: 3 }])
    expect(leg.coords).toHaveLength(4)
    expect(leg.steps.map((s) => s.instruction)).toEqual(['Head east through FKE P05', 'Arrive at Bus stop'])

    const covered = pathToLeg(campus, route(campus, 0, 2, { profile: 'sheltered', at: MON_10AM })!, MON_10AM)
    expect(covered.labels).toEqual([{ text: 'Covered walkway', from: 0, to: 3 }])
    expect(covered.steps.map((s) => [s.instruction, Math.round(s.distanceM)])).toEqual([
      ['Head north', 50],
      ['Turn right', 200],
      ['Turn right after Covered stop', 50],
      ['Arrive', 0],
    ])
  })
})

describe('graph.bin', () => {
  test('round trip keeps every field', () => {
    const input: GraphInput = {
      nodes: [{ ...P(0, 0), name: 'Door A' }, P(30, 40)],
      edges: [{
        from: 0, to: 1, lengthM: 52.5, climbUpM: 1.5, climbDownM: 0.25, kind: 'shortcut',
        sheltered: true, likely: true, hours: HOURS, name: 'Arked', geometry: [P(0, 40)],
      }],
    }
    const g = decodeGraph(encodeGraph(input))
    expect(g.nodeCount).toBe(2)
    expect(g.edgeCount).toBe(1)
    expect(nodeLatLon(g, 1).lat).toBeCloseTo(input.nodes[1].lat, 7)
    expect(g.strings[g.nodeName[0]]).toBe('Door A')
    expect(g.nodeName[1]).toBe(0xffff)
    expect([g.edgeLength[0], g.edgeClimbUp[0], g.edgeClimbDown[0], g.edgeKind[0], g.edgeFlags[0]]).toEqual([52.5, 1.5, 0.25, 6, 5])
    expect(g.hours[g.edgeHours[0]]).toEqual(HOURS)
    expect(g.strings[g.edgeName[0]]).toBe('Arked')
    expect(edgeCoords(g, 0, 1).map((p) => [p.lat.toFixed(6), p.lon.toFixed(6)])).toEqual([
      ['1.560362', '103.640270'],
      ['1.560362', '103.640000'],
      ['1.560000', '103.640000'],
    ])
    expect([...g.adj]).toEqual([0, 1])
  })

  test('rejects a file that is not a graph', () => {
    expect(() => decodeGraph(new ArrayBuffer(64))).toThrow('not a graph.bin file')
  })
})

test('opening hours past midnight', () => {
  const late: OpeningHours = [{ days: ['fri'], open: '18:00', close: '02:00' }]
  expect(openUntil(late, new Date('2026-10-16T15:00:00Z'))).toBe('02:00') // Fri 23:00
  expect(openUntil(late, new Date('2026-10-16T17:30:00Z'))).toBe('02:00') // Sat 01:30
  expect(openUntil(late, new Date('2026-10-16T19:00:00Z'))).toBeNull() // Sat 03:00
})
