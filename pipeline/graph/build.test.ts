import { describe, expect, test } from 'vitest'
import { gzipSync } from 'node:zlib'
import { distanceM } from '../../src/domain/walk/geo.ts'
import { decodeGraph, encodeGraph, FLAG_LIKELY, type Graph } from '../../src/domain/walk/graph.ts'
import { route } from '../../src/domain/walk/router.ts'
import { snapToNode } from '../../src/domain/walk/snap.ts'
import { buildGraph, climbOf, loadInputs, type BuildInputs } from './build.ts'

const MON_10AM = new Date('2026-10-12T02:00:00Z')
const { inputs } = loadInputs()
const built = buildGraph(inputs)
const buf = encodeGraph(built.input)
const g: Graph = decodeGraph(buf)

/** Nodes reachable from node 0. */
function reachable(graph: Graph): number {
  const seen = new Uint8Array(graph.nodeCount)
  const todo = [0]
  seen[0] = 1
  let n = 1
  while (todo.length) {
    const u = todo.pop()!
    for (let i = graph.adjStart[u]; i < graph.adjStart[u + 1]; i++) {
      const e = graph.adj[i] >> 1
      const v = graph.edgeFrom[e] === u ? graph.edgeTo[e] : graph.edgeFrom[e]
      if (!seen[v]) { seen[v] = 1; n++; todo.push(v) }
    }
  }
  return n
}

describe('real campus graph', () => {
  test('is one connected network and gzips under 300 KB', () => {
    expect(reachable(g)).toBe(g.nodeCount)
    expect(gzipSync(Buffer.from(buf)).length).toBeLessThan(300 * 1024)
  })

  test('every bus stop is a node and can be walked to from every other stop', () => {
    const ids = inputs.stops.map((s) => built.report.stopNode.get(s.id)!)
    expect(ids).toHaveLength(51)
    inputs.stops.forEach((s, i) => {
      expect(distanceM(s.location, { lat: g.nodeLat[ids[i]] / 1e7, lon: g.nodeLon[ids[i]] / 1e7 })).toBeLessThan(2.5)
      expect(snapToNode(g, s.location)).toBe(ids[i])
    })
    const from = ids[0]
    for (const to of ids) expect(route(g, from, to, { profile: 'fastest', at: MON_10AM })).not.toBeNull()
  })

  test.skipIf(inputs.entrances.length === 0)('every place entrance is connected', () => {
    expect(inputs.entrances.length).toBeGreaterThan(300)
    for (const d of inputs.entrances) {
      const n = built.report.doorNode.get(d.id)!
      expect(distanceM(d.location, { lat: g.nodeLat[n] / 1e7, lon: g.nodeLon[n] / 1e7 })).toBeLessThan(2.5)
      expect(route(g, 0, n, { profile: 'fastest', at: MON_10AM })).not.toBeNull()
    }
  })

  test.each([
    ['CP', 'AM'],
    ['CP', 'KP1'],
    ['AM', 'KTC_A'],
  ])('walking %s to %s is a plausible detour of the straight line', (a, b) => {
    const [pa, pb] = [a, b].map((id) => inputs.stops.find((s) => s.id === id)!)
    const straight = distanceM(pa.location, pb.location)
    const path = route(g, built.report.stopNode.get(a)!, built.report.stopNode.get(b)!, { profile: 'fastest', at: MON_10AM })!
    expect(path.distanceM).toBeGreaterThan(straight * 0.96)
    expect(path.distanceM).toBeLessThan(straight * 1.92)
    expect(path.timeS).toBeGreaterThan(path.distanceM / 1.6)
    expect(path.timeS).toBeLessThan(path.distanceM / 0.8)
  })
})

describe('climbOf', () => {
  const slope = (rise: number) => (lat: number) => ((lat - 1.56) * 110_574 * rise)
  const line = [{ lat: 1.56, lon: 103.64 }, { lat: 1.5604, lon: 103.64 }] // ~44 m north
  test('a steady 10% slope', () => expect(climbOf(line, slope(0.1), false)).toEqual([4.4, 0]))
  test('the other way is all descent', () => expect(climbOf([...line].reverse(), slope(0.1), false)).toEqual([0, 4.4]))
  test('flat ground with 0.3 m noise counts nothing', () => {
    let k = 0
    expect(climbOf(line, () => 10 + (k++ % 2) * 0.3, false)).toEqual([0, 0])
  })
  test('a bridge ignores the ground under it', () => expect(climbOf(line, (lat) => (lat > 1.5602 ? 30 : 0), true)).toEqual([30, 0]))
})

describe('merging shortcuts, indoor links and doors', () => {
  const flat = { west: 103.6, north: 1.57, dLon: 0.001, dLat: 0.001, cols: 4, rows: 4, dm: Buffer.from(new Int16Array(16).fill(100).buffer).toString('base64') }
  const way = (a: number[], b: number[]) => ({ geometry: { type: 'LineString', coordinates: [a, b] }, properties: { kind: 'footway', stepFree: true } })
  const sc = (id: string, level: string, extra = {}) => ({
    geometry: { type: 'LineString', coordinates: [[103.6012, 1.5688], [103.6038, 1.5688]] },
    properties: { id, level, kind: 'footpath', ...extra },
  })
  const base: BuildInputs = {
    // Two parallel lanes 0.0008 deg (~89 m) apart, joined at the west end.
    ways: [way([103.601, 1.5688], [103.601, 1.568]), way([103.601, 1.568], [103.604, 1.568]), way([103.601, 1.5688], [103.6015, 1.5688]), way([103.6035, 1.5688], [103.604, 1.5688]), way([103.604, 1.5688], [103.604, 1.568])],
    dem: flat,
    landmarks: [],
    stops: [{ id: 'S', location: { lat: 1.5681, lon: 103.6025 } }],
    entrances: [],
    shortcuts: [sc('v', 'verified'), sc('l', 'likely'), sc('g', 'guess'), sc('p', 'verified', { access: 'private' })],
    indoor: [],
  }
  const hours = [{ days: ['mon'], open: '08:00', close: '18:00' }]

  test('verified and likely are used, guess and private are not', () => {
    const { input, report } = buildGraph(base)
    expect(report.shortcuts).toEqual({ verified: 1, likely: 1, skipped: 2 })
    expect(input.edges.filter((e) => e.kind === 'shortcut').map((e) => !!e.likely).sort()).toEqual([false, true])
    expect(decodeGraph(encodeGraph(input)).edgeFlags.filter((f) => f & FLAG_LIKELY)).toHaveLength(1)
  })

  test('a door with hours and an indoor link keep their hours', () => {
    const indoor = [
      { geometry: { type: 'Point', coordinates: [103.6025, 1.5683] }, properties: { name: 'Main door', hours, stepFree: false } },
      { geometry: { type: 'LineString', coordinates: [[103.6025, 1.5683], [103.603, 1.568]] }, properties: { name: 'Lobby', hours } },
    ]
    const { input, report } = buildGraph({ ...base, shortcuts: [], indoor })
    expect(report.doors).toBe(1)
    expect(report.indoorEdges).toBe(1)
    const door = input.edges.find((e) => e.kind === 'door')!
    expect(door).toMatchObject({ name: 'Main door', hours })
    expect(door.stepFree).toBeUndefined()
    expect(input.edges.find((e) => e.kind === 'indoor')).toMatchObject({ name: 'Lobby', indoor: true, sheltered: true, hours })
  })

  test('a stop off the network gets a connector and an island is dropped', () => {
    const lone = way([103.6, 1.5601], [103.6001, 1.5601])
    const { input, report } = buildGraph({ ...base, shortcuts: [], ways: [...base.ways, lone] })
    expect(report.islands).toHaveLength(1)
    const n = report.stopNode.get('S')!
    expect(input.edges.some((e) => e.from === n || e.to === n)).toBe(true)
  })
})
