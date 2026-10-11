/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { TransitData } from '../domain/schemas.ts'
import { decodeGraph } from '../domain/walk/graph.ts'
import { planQuery, type RouterData, type TripQuery } from './routerApi.ts'

// Real built data (npm run build:transit && npm run build:graph).
const buf = readFileSync('public/data/graph.bin')
const data: RouterData = {
  graph: decodeGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  transit: TransitData.parse(JSON.parse(readFileSync('public/data/transit.json', 'utf8'))),
  places: [],
}

const cpToUi: TripQuery = {
  from: { stopId: 'CP' },
  to: { stopId: 'UI' },
  when: { type: 'depart', at: '2026-03-17T08:00:00+08:00' },
  profile: 'fastest',
}

describe('planQuery on the real data', () => {
  test('Centre Point to UTM International, Tue 2026-03-17 08:00: walk, or route C at 08:05', () => {
    const plan = structuredClone(planQuery(data, cpToUi)) // must survive postMessage
    expect(plan.options.map((o) => [o.kind, o.durationS])).toEqual([['walk', 843], ['bus', 241]])
    const ride = plan.options[1].legs.find((l) => l.kind === 'bus')!
    expect(ride.route?.id).toBe('C')
    expect(ride.headsign).toBe('To Kolej 9/10')
    expect(ride.departAt.toISOString()).toBe('2026-03-17T00:05:00.000Z') // 08:05 in KL
    expect(ride.arriveAt.toISOString()).toBe('2026-03-17T00:09:00.000Z')
  })

  test('a slower walkSpeed lengthens the walk-only option', () => {
    const walk = (walkSpeed: number) => planQuery(data, { ...cpToUi, walkSpeed }).options[0].durationS
    expect(walk(1.4)).toBe(843)
    expect(walk(1.0)).toBeGreaterThan(1100)
  })

  test('an unknown stop is an error', () => {
    expect(() => planQuery(data, { ...cpToUi, to: { stopId: 'NOPE' } })).toThrow('Unknown stop: NOPE')
  })
})
