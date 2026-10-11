import transitJson from '../../../public/data/transit.json?raw'
import { expect, test } from 'vitest'
import { TransitData } from '../schemas.ts'
import { departuresOn, firstServiceDay, nextDepartures } from './departures.ts'

const data = TransitData.parse(JSON.parse(transitJson))
const fmt = (ds: { routeId: string; time: string }[]) => ds.map((d) => `${d.routeId} ${d.time}`)

test('next departures at Centre Point, Tuesday 2026-03-17 07:30 (KL)', () => {
  const got = nextDepartures(data, 'CP', new Date('2026-03-17T07:30:00+08:00'), 6)
  expect(fmt(got)).toMatchInlineSnapshot(`
    [
      "F 07:31",
      "C 07:35",
      "G 07:35",
      "E 07:40",
      "A 07:45",
      "C 07:45",
    ]
  `)
})

test('2026-03-10 is in the semester break: no service, next service day is 2026-03-16', () => {
  expect(departuresOn(data, 'CP', '2026-03-10')).toEqual([])
  expect(nextDepartures(data, 'CP', new Date('2026-03-10T07:30:00+08:00'))).toEqual([])
  const next = firstServiceDay('2026-03-10', (d) => departuresOn(data, 'CP', d))
  expect(next?.date).toBe('2026-03-16')
  expect(fmt(next!.found.slice(0, 3))).toMatchInlineSnapshot(`
    [
      "E 07:10",
      "E 07:10",
      "E 07:10",
    ]
  `)
})

test('the expired timetable (after 2026-10-04) has no later service day', () => {
  expect(firstServiceDay('2026-10-04', (d) => departuresOn(data, 'CP', d))).toBeNull()
})
