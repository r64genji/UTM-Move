import { describe, expect, test } from 'vitest'
import { checklistRows, renderMarkdown } from './osm-export.ts'
import { isInOsm } from './osm.ts'

const line = (lon0: number, lat0: number, lon1: number, lat1: number) => ({ type: 'LineString', coordinates: [[lon0, lat0], [lon1, lat1]] })
const landmarks: [number, number, string][] = [[1.559, 103.6387, 'Library'], [1.57, 103.62, 'KDOJ']]
const scored = [
  { properties: { id: 'sc-a', level: 'verified', kind: 'covered-walkway', from: 'N28a', to: 'Arked' }, geometry: line(103.6387, 1.559, 103.6387, 1.5592) },
  { properties: { id: 'sc-b', level: 'likely', kind: 'footpath' }, geometry: line(103.6387, 1.559, 103.6388, 1.559) },
  { properties: { id: 'sc-c', level: 'verified', kind: 'stairs', inOsm: true }, geometry: line(103.6387, 1.559, 103.6388, 1.559) },
  { properties: { id: 'sc-d', level: 'verified', kind: 'footpath', access: 'private' }, geometry: line(103.6387, 1.559, 103.6388, 1.559) },
]

describe('checklistRows', () => {
  test('keeps only verified, public, not-in-OSM lines and gives an iD link at the midpoint', () => {
    const ev = [{ id: 'e1', shortcutId: 'sc-a', source: 'satellite' as const, summary: 'x', observedAt: '2026-10-11', imagery: 'bing' as const }]
    const rows = checklistRows(scored, [], ev, landmarks)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'sc-a',
      area: 'Library',
      kind: 'covered-walkway',
      label: 'N28a to Arked',
      editUrl: 'https://www.openstreetmap.org/edit?editor=id#map=20/1.559100/103.638700',
      tags: 'highway=footway, covered=yes',
      imagery: 'Bing Aerial',
    })
  })

  test('doors become entrance=yes rows grouped under the nearest landmark', () => {
    const doors = [{ properties: { name: 'Main door' }, geometry: { type: 'Point', coordinates: [103.6201, 1.5701] as unknown } }]
    const rows = checklistRows([], doors, [], landmarks)
    expect([rows[0].area, rows[0].kind, rows[0].tags, rows[0].label]).toEqual(['KDOJ', 'door', 'entrance=yes (add door=* and name/ref if known)', 'Main door'])
  })

  test('empty list says so', () => {
    expect(renderMarkdown([])).toContain('Nothing to add: no verified shortcut is missing from OSM right now.')
  })
})

describe('isInOsm (drop rule)', () => {
  const way = [{ lat: 1.559, lon: 103.6387 }, { lat: 1.559, lon: 103.6397 }] // about 111 m east-west
  const at = (lat: number, lonEnd: number) => [{ lat, lon: 103.6387 }, { lat, lon: lonEnd }]
  test('a line 5 m from an OSM way along its whole length is in OSM', () => {
    expect(isInOsm(at(1.559045, 103.6397), [way])).toBe(true)
  })
  test('a line 20 m from the way is not', () => {
    expect(isInOsm(at(1.55918, 103.6397), [way])).toBe(false)
  })
  test('75% of the line along the way is in OSM, 60% is not', () => {
    expect(isInOsm(at(1.559, 103.6387 + 0.001 / 0.75), [way])).toBe(true)
    expect(isInOsm(at(1.559, 103.6387 + 0.001 / 0.6), [way])).toBe(false)
  })
})
