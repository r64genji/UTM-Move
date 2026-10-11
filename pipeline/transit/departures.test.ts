// The CP departure board, built from the real YAML, checked against the PDF.
import { describe, expect, test } from 'vitest'
import { nextDepartures } from '../../src/domain/transit/departures.ts'
import { buildTransit, loadSources } from './build.ts'

const data = buildTransit(loadSources())

/** "HH:MM route pattern" for each departure. */
const board = (iso: string, limit: number) =>
  nextDepartures(data, 'CP', new Date(iso), limit).map((d) => `${d.time} ${d.patternId}`)

/** Only trips that start at CP: their times come straight from the PDF "From CP" columns. */
const fromCp = (iso: string, limit: number) =>
  nextDepartures(data, 'CP', new Date(iso), 50)
    .filter((d) => data.patterns.find((p) => p.id === d.patternId)?.stopIds[0] === 'CP')
    .slice(0, limit)
    .map((d) => `${d.time} ${d.routeId}`)

describe('CP departure board matches the PDF', () => {
  test('Monday 13 Oct 2025, 07:40', () => {
    // PDF: A1 7:45 8:15, C1 7:45, C2 7:55, C3 8:05, D1 7:45 8:15, H 7:45 8:15
    expect(fromCp('2025-10-13T07:40:00+08:00', 9)).toEqual([
      '07:45 A',
      '07:45 C',
      '07:45 D',
      '07:45 H',
      '07:55 C',
      '08:05 C',
      '08:15 A',
      '08:15 C',
      '08:15 D',
    ])
    // Trips passing through CP get a time from the measured segment times.
    expect(board('2025-10-13T07:40:00+08:00', 6)).toEqual([
      '07:40 E:to-t02-via-n24',
      '07:45 A:to-kp',
      '07:45 C:to-k910',
      '07:45 D:to-fkt',
      '07:45 H:to-v01',
      '07:50 G:to-ktr',
    ])
  })

  test('Tuesday 14 Oct 2025, 14:25 (route J Tuesday-only trip)', () => {
    // PDF: J "Every Tuesday only" 14:30 15:00, C1 14:35, C2 14:45, A1 15:00, C3 15:00
    expect(fromCp('2025-10-14T14:25:00+08:00', 6)).toEqual([
      '14:30 J',
      '14:35 C',
      '14:45 C',
      '15:00 A',
      '15:00 C',
      '15:00 J',
    ])
  })

  test('Wednesday 15 Oct 2025, 19:50 (night service)', () => {
    // PDF: A1, C2 and E6 (from CP/FABU) at 20:00, 22:00, 23:00
    expect(fromCp('2025-10-15T19:50:00+08:00', 9)).toEqual([
      '20:00 A',
      '20:00 C',
      '20:00 E',
      '22:00 A',
      '22:00 C',
      '22:00 E',
      '23:00 A',
      '23:00 C',
      '23:00 E',
    ])
  })
})

describe('service days', () => {
  test('Friday 13:00 has no bus at CP in the prayer gap; the next one is 14:00', () => {
    const next = nextDepartures(data, 'CP', new Date('2025-10-17T13:00:00+08:00'), 3)
    expect(next.map((d) => `${d.time} ${d.patternId}`)).toEqual(['14:00 H:to-v01', '14:05 C:to-k910', '14:05 G:to-ktr'])
  })

  test('the same 13:00 on a Thursday has buses', () => {
    expect(board('2025-10-16T13:00:00+08:00', 2)).toEqual(['13:00 A:to-kp', '13:00 C:to-k910'])
  })

  test('no buses on Deepavali (Monday 20 Oct 2025) or in the final break', () => {
    expect(board('2025-10-20T08:00:00+08:00', 5)).toEqual([])
    expect(board('2026-02-10T08:00:00+08:00', 5)).toEqual([])
  })

  test('Saturday has only the weekend route E service', () => {
    expect(board('2025-10-18T07:00:00+08:00', 2)).toEqual(['07:40 E:to-k910', '08:10 E:to-k910'])
  })

  test('the time zone is Kuala Lumpur, not the device: 23:40 UTC Sunday is 07:40 Monday', () => {
    expect(board('2025-10-12T23:40:00Z', 1)).toEqual(['07:40 E:to-t02-via-n24'])
  })
})
