import { describe, expect, test } from 'vitest'
import { checkPlaces, checkRoute, type OptionRow } from './checks.ts'

const square = [[[103.6, 1.5], [103.7, 1.5], [103.7, 1.6], [103.6, 1.6], [103.6, 1.5]]]
const at = (lat: number, lon: number) => ({ lat, lon })

describe('checkPlaces', () => {
  test('passes clean data', () => {
    const places = [
      { id: 'a', name: 'Library', location: at(1.55, 103.65) },
      { id: 'b', name: 'Cafe', location: at(1.56, 103.66) },
    ]
    expect(checkPlaces(places, square)).toEqual([])
  })

  test('flags duplicate ids, empty names, outside points and same-name pairs within 25 m', () => {
    const places = [
      { id: 'a', name: 'Library', location: at(1.55, 103.65) },
      { id: 'a', name: ' ', location: at(1.55, 103.66) },
      { id: 'c', name: 'Far', location: at(1.7, 103.65) },
      { id: 'd', name: 'Surau', location: at(1.55, 103.65) },
      { id: 'e', name: 'surau ', location: at(1.55001, 103.65) },
      { id: 'f', name: 'Surau', location: at(1.56, 103.65) },
    ]
    expect(checkPlaces(places, square)).toEqual([
      'duplicate id a',
      'a: empty name',
      'c "Far": outside the campus boundary',
      'd and e: same name "Surau" within 25 m',
    ])
  })
})

const walk = (to: [number, number], mins: number): OptionRow => ({
  kind: 'walk',
  durationS: mins * 60,
  legs: [{ kind: 'walk', departAt: '2026-03-17T08:00:00+08:00', arriveAt: `2026-03-17T08:${String(mins).padStart(2, '0')}:00+08:00`, geometry: [at(1.56, 103.63), at(...to)] }],
})
// 0.009 deg lon at lat 1.56 is about 1000 m.
const FROM = at(1.56, 103.63)
const TO = at(1.56, 103.639)

describe('checkRoute', () => {
  test('a 1 km walk in 14 minutes is fine', () => {
    expect(checkRoute(FROM, TO, [walk([1.56, 103.639], 14)])).toEqual([])
  })

  test('a 1 km walk in 5 minutes is too fast, in 30 minutes too slow', () => {
    expect(checkRoute(FROM, TO, [walk([1.56, 103.639], 5)])).toEqual(['option 1 (walk) leg 1: walk speed 12.0 km/h'])
    expect(checkRoute(FROM, TO, [walk([1.56, 103.639], 30)])).toEqual(['option 1 (walk) leg 1: walk speed 2.0 km/h'])
  })

  test('requires a walk-only option', () => {
    const bus: OptionRow = {
      kind: 'bus',
      durationS: 600,
      legs: [{ kind: 'bus', departAt: '2026-03-17T08:00:00+08:00', arriveAt: '2026-03-17T08:10:00+08:00', geometry: [FROM, TO], stops: [{ id: 's1', at: '2026-03-17T08:00:00+08:00' }, { id: 's2', at: '2026-03-17T08:10:00+08:00' }] }],
    }
    expect(checkRoute(FROM, TO, [bus])).toEqual(['no walk-only option'])
  })

  test('flags a bus whose stop times run backwards and legs out of order', () => {
    const bad: OptionRow = {
      kind: 'bus',
      durationS: 600,
      legs: [
        { kind: 'bus', departAt: '2026-03-17T08:10:00+08:00', arriveAt: '2026-03-17T08:20:00+08:00', geometry: [FROM, at(1.56, 103.635)], stops: [{ id: 's1', at: '2026-03-17T08:20:00+08:00' }, { id: 's2', at: '2026-03-17T08:10:00+08:00' }] },
        { kind: 'walk', departAt: '2026-03-17T08:15:00+08:00', arriveAt: '2026-03-17T08:30:00+08:00', geometry: [at(1.56, 103.635), TO] },
      ],
    }
    expect(checkRoute(FROM, TO, [walk([1.56, 103.639], 14), bad])).toEqual([
      'option 2 (bus) leg 1: bus boards after it alights (stop times go backwards)',
      'option 2 (bus) leg 2: departs before the previous leg arrived',
      'option 2 (bus) leg 2: walk speed 1.8 km/h',
    ])
  })

  test('flags a zig-zag walk above 2x the straight line', () => {
    const zig: OptionRow = {
      kind: 'walk',
      durationS: 2400,
      legs: [{ kind: 'walk', departAt: '2026-03-17T08:00:00+08:00', arriveAt: '2026-03-17T08:40:00+08:00', geometry: [FROM, at(1.57, 103.63), at(1.57, 103.639), TO] }],
    }
    expect(checkRoute(FROM, TO, [zig])).toEqual(['option 1 (walk): detour ratio 3.22 > 2'])
  })

  test('flags a route that ends 200 m from the destination', () => {
    expect(checkRoute(FROM, TO, [walk([1.56, 103.637], 11)])).toEqual(['option 1 (walk): ends 222 m from the destination'])
  })
})
