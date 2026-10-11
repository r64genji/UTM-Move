import { describe, expect, test } from 'vitest'
import type { TransitData } from '../schemas.ts'
import { raptor } from './raptor.ts'

const at = (hhmm: string) => (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60
const stop = (id: string) => ({ id, name: id, location: { lat: 1.56, lon: 103.64 } })
const trip = (id: string, routeId: string, stops: [string, string][]) => ({
  id, routeId, calendarId: 'wk', stopTimes: stops.map(([stopId, time]) => ({ stopId, time })),
})

// R1: A 08:00 -> B 08:10. R2: C 08:15 -> D 08:25. B and C are 120 s apart on foot.
const data: TransitData = {
  stops: ['A', 'B', 'C', 'D'].map(stop),
  routes: [{ id: 'R1', name: 'R1' }, { id: 'R2', name: 'R2' }],
  patterns: [],
  calendars: [{ id: 'wk', days: ['mon', 'tue', 'wed', 'thu', 'fri'], startDate: '2026-01-01', endDate: '2026-12-31', exceptions: [{ date: '2026-03-11', type: 'removed' }] }],
  trips: [trip('r1', 'R1', [['A', '08:00'], ['B', '08:10']]), trip('r2', 'R2', [['C', '08:15'], ['D', '08:25']])],
}
const transfers = new Map([['B', [{ to: 'C', secs: 120 }]], ['C', [{ to: 'B', secs: 120 }]]])

describe('raptor', () => {
  test('forward: one ride, a footpath, a second ride', () => {
    const r = raptor(data, { date: '2026-03-10', sources: new Map([['A', at('07:55')]]), transfers })
    expect(r.journeysTo('B').map((j) => j.rides)).toEqual([1])
    expect(r.journeysTo('D')).toEqual([{
      rides: 2,
      legs: [
        { kind: 'ride', tripId: 'r1', from: 'A', to: 'B', boardPos: 0, alightPos: 1, depart: at('08:00'), arrive: at('08:10') },
        { kind: 'walk', from: 'B', to: 'C', depart: at('08:10'), arrive: at('08:12') },
        { kind: 'ride', tripId: 'r2', from: 'C', to: 'D', boardPos: 0, alightPos: 1, depart: at('08:15'), arrive: at('08:25') },
      ],
    }])
  })

  test('reverse: latest departure that still arrives by the deadline', () => {
    const r = raptor(data, { date: '2026-03-10', direction: 'reverse', sources: new Map([['D', at('08:30')]]), transfers })
    const j = r.journeysTo('A')
    expect(j).toHaveLength(1)
    expect(j[0].legs.map((l) => [l.kind, l.from, l.to, l.depart, l.arrive])).toEqual([
      ['ride', 'A', 'B', at('08:00'), at('08:10')],
      ['walk', 'B', 'C', at('08:13'), at('08:15')],
      ['ride', 'C', 'D', at('08:15'), at('08:25')],
    ])
  })

  test('a missed connection is not offered, and max transfers is respected', () => {
    const slow = raptor(data, { date: '2026-03-10', sources: new Map([['A', at('07:55')]]), transfers: new Map([['B', [{ to: 'C', secs: 600 }]]]) })
    expect(slow.journeysTo('D')).toEqual([])
    const none = raptor(data, { date: '2026-03-10', sources: new Map([['A', at('07:55')]]), transfers, maxTransfers: 0 })
    expect(none.journeysTo('D')).toEqual([])
  })

  test('calendar: no service on a weekend or a removed date', () => {
    for (const date of ['2026-03-14', '2026-03-11']) {
      expect(raptor(data, { date, sources: new Map([['A', at('07:55')]]), transfers }).journeysTo('B')).toEqual([])
    }
  })
})
