import { describe, expect, test } from 'vitest'
import { buildTransit, loadSources } from './build.ts'

const sources = loadSources()
const data = buildTransit(sources)

describe('transit YAML', () => {
  test('loads through the zod schemas', () => {
    expect([sources.stops.stops.length, sources.routes.map((r) => r.id)]).toEqual([
      51,
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'],
    ])
  })

  test('has 559 departures: v1 554 + B1 18:00 (missing in v1) + 4 same-time E departures v1 merged', () => {
    expect(data.trips.length).toBe(559)
  })

  test('every stop is used by a trip', () => {
    const used = new Set(data.trips.flatMap((t) => t.stopTimes.map((s) => s.stopId)))
    expect(data.stops.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([])
  })

  test('V01 is the only off-campus stop', () => {
    expect(data.stops.filter((s) => s.offCampus).map((s) => s.name)).toEqual(['V01 (Taman Universiti)'])
  })
})

describe('stop times', () => {
  test('route A 07:30 from KP has a time at every stop', () => {
    expect(data.trips.find((t) => t.id === 'A:A1:weekday:to-cp:0730')?.stopTimes).toEqual([
      { stopId: 'KP1', time: '07:30' },
      { stopId: 'KTC_A', time: '07:32' },
      { stopId: 'P19A', time: '07:34' },
      { stopId: 'CP', time: '07:35' },
    ])
  })

  test('times never go down along a trip', () => {
    const bad = data.trips.filter((t) => t.stopTimes.some((s, i) => i > 0 && s.time < t.stopTimes[i - 1].time))
    expect(bad.map((t) => t.id)).toEqual([])
  })

  test('each bus reaches the end of a trip before its next PDF departure', () => {
    const late: string[] = []
    for (const r of sources.routes) {
      for (const bus of r.buses) {
        const legs = data.trips
          .filter((t) => t.id.startsWith(`${r.id}:${bus.id}:${bus.service}:`))
          .sort((a, b) => a.stopTimes[0].time.localeCompare(b.stopTimes[0].time))
        legs.forEach((t, i) => {
          const next = legs[i + 1]
          if (next && t.stopTimes.at(-1)!.time > next.stopTimes[0].time) late.push(`${t.id} -> ${next.id}`)
        })
      }
    }
    expect(late).toEqual([])
  })
})

describe('calendars', () => {
  test('Friday prayer gap trips run Monday to Thursday only', () => {
    const gap = data.trips.filter((t) => t.calendarId === 'weekday-except-friday-prayer')
    expect(gap.length).toBe(61)
    expect(gap.filter((t) => t.routeId === 'A').map((t) => t.stopTimes[0].time)).toEqual(['12:40', '13:20', '13:00', '13:40'])
    expect(data.calendars.find((c) => c.id === 'weekday-except-friday-prayer')?.days).toEqual(['mon', 'tue', 'wed', 'thu'])
  })

  test('public holidays and final breaks are removed, mid-semester breaks are not', () => {
    const removed = data.calendars.find((c) => c.id === 'weekday')!.exceptions.map((e) => e.date)
    expect(['2025-10-20', '2026-02-09', '2026-03-15', '2026-07-20', '2026-10-04'].every((d) => removed.includes(d))).toBe(true)
    expect(removed.includes('2025-11-25')).toBe(false)
  })
})
