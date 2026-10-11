import { describe, expect, test } from 'vitest'
import type { z } from 'zod'
import {
  Building,
  Calendar,
  Door,
  Evidence,
  OpeningHours,
  Place,
  Route,
  Shortcut,
  Stop,
  Trip,
  WalkEdge,
} from './schemas.ts'

const at = { lat: 1.5589, lon: 103.6387 }
const near = { lat: 1.559, lon: 103.6388 }

function errors(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input)
  if (result.success) return []
  return result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('valid samples pass', () => {
  test('Place fills defaults', () => {
    expect(
      Place.parse({ id: 'p1', name: 'Perpustakaan Sultanah Zanariah', category: 'Library', location: at }),
    ).toEqual({
      id: 'p1',
      name: 'Perpustakaan Sultanah Zanariah',
      aliases: [],
      category: 'Library',
      location: { lat: 1.5589, lon: 103.6387 },
    })
  })

  test('Door defaults access to public and level to 0', () => {
    expect(Door.parse({ id: 'd1', buildingId: 'b1', location: at })).toEqual({
      id: 'd1',
      buildingId: 'b1',
      location: { lat: 1.5589, lon: 103.6387 },
      level: 0,
      access: 'public',
    })
  })

  test('WalkEdge defaults', () => {
    const edge = WalkEdge.parse({ id: 'e1', from: 'n1', to: 'n2', kind: 'indoor', geometry: [at, near], lengthM: 15 })
    expect([edge.access, edge.covered, edge.climbM]).toEqual(['public', false, 0])
  })

  test('Shortcut defaults', () => {
    const s = Shortcut.parse({ id: 's1', geometry: [at, near], level: 'likely' })
    expect([s.access, s.indoor, s.covered, s.evidenceIds]).toEqual(['public', false, false, []])
  })

  test.each([
    ['Building', Building, { id: 'b1', name: 'N28a', outline: [at, near, { lat: 1.5591, lon: 103.6386 }, at] }],
    ['Evidence', Evidence, { id: 'v1', shortcutId: 's1', source: 'gps-trace', summary: '12 traces', url: 'https://www.openstreetmap.org/traces', observedAt: '2026-10-11' }],
    ['Stop', Stop, { id: 'CP', name: 'Centre Point', location: at }],
    ['Route', Route, { id: 'A', name: 'Route A', color: '#e11d48' }],
    ['Trip', Trip, { id: 't1', routeId: 'A', calendarId: 'weekday', stopTimes: [{ stopId: 'CP', time: '07:30' }, { stopId: 'K9', time: '07:42' }] }],
    ['Calendar', Calendar, { id: 'weekday', days: ['mon', 'tue'], startDate: '2025-10-05', endDate: '2026-02-20', exceptions: [{ date: '2025-12-25', type: 'removed' }] }],
    ['OpeningHours', OpeningHours, [{ days: ['mon', 'fri'], open: '08:00', close: '17:00' }]],
  ])('%s', (_name, schema, sample) => {
    expect(errors(schema, sample)).toEqual([])
  })
})

describe('bad samples fail with a clear message', () => {
  test.each([
    ['Place with lng', Place, { id: 'p1', name: 'X', category: 'Library', location: { lat: 1.5, lng: 103.6 } }, [
      'location.lon: Invalid input: expected number, received undefined',
      'location: Unrecognized key: "lng"',
    ]],
    ['Place with unknown category', Place, { id: 'p1', name: 'X', category: 'Cafe', location: at }, [
      'category: Invalid option: expected one of "Faculty/Academic"|"Lab/Workshop"|"Library"|"Residential college"|"Food"|"Prayer"|"Sport"|"Admin/Office"|"Health"|"Bank/ATM"|"Shop/Service"|"Hall/Event"|"Parking"|"Bus stop"|"Gate/Entrance"|"Other"',
    ]],
    ['Building with 2-point outline', Building, { id: 'b1', outline: [at, near] }, [
      'outline: a building outline needs at least 4 points',
    ]],
    ['Door with unknown access', Door, { id: 'd1', buildingId: 'b1', location: at, access: 'staff' }, [
      'access: Invalid option: expected one of "public"|"restricted"|"private"',
    ]],
    ['WalkEdge with 1 point', WalkEdge, { id: 'e1', from: 'n1', to: 'n2', kind: 'footway', geometry: [at], lengthM: 15 }, [
      'geometry: a line needs at least 2 points',
    ]],
    ['Shortcut with unknown level', Shortcut, { id: 's1', geometry: [at, near], level: 'maybe' }, [
      'level: Invalid option: expected one of "verified"|"likely"|"guess"',
    ]],
    ['Evidence with bad date', Evidence, { id: 'v1', shortcutId: 's1', source: 'osm', summary: 'x', observedAt: '11/10/2026' }, [
      'observedAt: date must be YYYY-MM-DD',
    ]],
    ['Stop with empty id', Stop, { id: '', name: 'Centre Point', location: at }, ['id: id must not be empty']],
    ['Route with bad color', Route, { id: 'A', name: 'Route A', color: 'red' }, ['color: color must be #RRGGBB']],
    ['Trip with bad time', Trip, { id: 't1', routeId: 'A', calendarId: 'c', stopTimes: [{ stopId: 'CP', time: '7:30' }, { stopId: 'K9', time: '07:42' }] }, [
      'stopTimes.0.time: time must be HH:MM',
    ]],
    ['Calendar with no days', Calendar, { id: 'c', days: [], startDate: '2025-10-05', endDate: '2026-02-20' }, [
      'days: Too small: expected array to have >=1 items',
    ]],
    ['OpeningHours with bad close', OpeningHours, [{ days: ['mon'], open: '08:00', close: '17:60' }], [
      '0.close: time must be HH:MM',
    ]],
  ])('%s', (_name, schema, sample, expected) => {
    expect(errors(schema, sample)).toEqual(expected)
  })
})
