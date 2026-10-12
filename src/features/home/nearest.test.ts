import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { TransitData } from '../../domain/schemas.ts'
import { dayOfKind, summarize } from '../routes/RoutesPage.tsx'
import { greeting, nearestStop, nextPerRoute } from './nearest.ts'

const data = TransitData.parse(JSON.parse(readFileSync('public/data/transit.json', 'utf8')))
const tuesday8am = new Date('2026-10-13T08:00:00+08:00')

test('the nearest stop to a spot on campus, with its distance', () => {
  const near = nearestStop(data.stops, { lat: 1.5594, lon: 103.637 })!
  expect(near.stop.name).toBe('Jalan Amal 1')
  expect(Math.round(near.distanceM)).toBe(213)
})

test('next bus of each route from a stop, one row per route, soonest first', () => {
  const etas = nextPerRoute(data, 'CP', tuesday8am)
  expect(etas.map((e) => [e.routeId, e.time, e.minutes])).toEqual([
    ['F', '08:01', 1],
    ['C', '08:05', 5],
    ['G', '08:05', 5],
  ])
})

test('greeting follows the Kuala Lumpur hour, whatever the device zone', () => {
  expect(greeting(new Date('2026-10-13T08:00:00+08:00'))).toBe('Good Morning')
  expect(greeting(new Date('2026-10-13T12:00:00+08:00'))).toBe('Good Afternoon')
  expect(greeting(new Date('2026-10-13T17:30:00+08:00'))).toBe('Good Evening')
  expect(greeting(new Date('2026-10-12T20:00:00Z'))).toBe('Good Morning') // 04:00 next day in KL
})

test('weekday and weekend tabs point at the next day of that kind', () => {
  expect(dayOfKind('2026-10-13', 'weekday')).toBe('2026-10-13')
  expect(dayOfKind('2026-10-13', 'weekend')).toBe('2026-10-17')
  expect(dayOfKind('2026-10-17', 'weekday')).toBe('2026-10-19')
})

test('route card: next bus time and where it goes, or that the route is done today', () => {
  const route = data.routes.find((r) => r.id === 'F')!
  const morning = summarize(data, route, '2026-10-13', { date: '2026-10-13', time: '08:00' })
  expect(morning.status).toBe('Active')
  expect(morning.next?.stopTimes[0].time).toBe('08:00')
  expect(morning.headsign).toBe('To KTR (K01)')
  expect(summarize(data, route, '2026-10-13', { date: '2026-10-13', time: '23:59' }).status).toBe('Service Ended')
  expect(summarize(data, route, '2026-10-17', { date: '2026-10-13', time: '08:00' }).status).toBeNull()
})
