import { describe, expect, test } from 'vitest'
import { buildAreas, findPlace, htmlToText, lineBetween, parseClaims, quoteInText, type Place } from './claims.ts'

const good = { from: 'PSZ Library', to: 'Faculty of Computing', type: 'Covered Walkway', url: 'https://example.com/a', quote: 'A covered walkway links the library and FC.', date: '2025-03-01' }

describe('parseClaims', () => {
  test('normalises type and rejects bad claims with a reason', () => {
    const { ok, rejected } = parseClaims([
      good,
      { ...good, type: 'teleporter' },
      { ...good, url: 'ftp://x.org/a' },
      { ...good, quote: 'x'.repeat(201) },
      { ...good, date: '01/03/2025' },
    ])
    expect(ok).toEqual([{ ...good, type: 'covered-walkway' }])
    expect(rejected.map((r) => r.reason)).toEqual([
      'type: unknown type "teleporter"',
      'url: url must be http(s)',
      expect.stringContaining('quote:'),
      expect.stringContaining('date:'),
    ])
  })
})

describe('quoteInText', () => {
  const page = htmlToText('<html><script>var a=1</script><p>The  covered&nbsp;walkway links <b>PSZ</b> Library to FC &amp; the cafe.</p></html>')
  test('matches ignoring case, tags and punctuation', () => {
    expect(page.includes('var a')).toBe(false)
    expect(quoteInText('Covered walkway links PSZ Library to FC & the cafe', page)).toBe(true)
  })
  test('rejects invented text and checks both halves of a gapped quote', () => {
    expect(quoteInText('a stairway links PSZ Library to the roof', page)).toBe(false)
    expect(quoteInText('The covered walkway links ... to FC and the cafe', page)).toBe(false)
    expect(quoteInText('The covered walkway links ... Library to FC & the cafe', page)).toBe(true)
  })
})

const place = (id: string, name: string, lat: number, lon: number, extra: Partial<Place> = {}): Place => ({ id, name, category: 'Faculty/Academic', location: { lat, lon }, ...extra })

describe('findPlace and lineBetween', () => {
  const lib = place('a', 'Perpustakaan Sultanah Zanariah', 1.5600, 103.6400, { aliases: ['PSZ Library'], entrances: [{ lat: 1.5601, lon: 103.6401 }] })
  const fc = place('b', 'Faculty of Computing', 1.5610, 103.6400)
  test('matches by alias, ignoring case', () => {
    expect(findPlace('psz library', [lib, fc])?.id).toBe('a')
    expect(findPlace('Nowhere', [lib, fc])).toBeUndefined()
  })
  test('line runs between entrance and centre; too close is rejected', () => {
    expect(lineBetween(lib, fc)).toEqual([{ lat: 1.5601, lon: 103.6401 }, { lat: 1.5610, lon: 103.6400 }])
    expect(lineBetween(lib, place('c', 'Next door', 1.56011, 103.64011))).toBeUndefined()
  })
})

describe('buildAreas', () => {
  test('splits two far clusters into two named areas, parking ignored', () => {
    const places = [
      place('1', 'Faculty A', 1.55, 103.63), place('2', 'Cafe A', 1.5501, 103.6301, { category: 'Food' }),
      place('3', 'Library B', 1.57, 103.65, { category: 'Library' }), place('4', 'Faculty B', 1.5701, 103.6501),
      place('5', 'Lot', 1.5702, 103.6502, { category: 'Parking' }),
    ]
    const areas = buildAreas(places, 2)
    expect(areas.map((a) => [a.id, a.name, a.places])).toEqual([
      ['area-01', 'Library B', ['Library B', 'Faculty B']],
      ['area-02', 'Faculty A', ['Faculty A', 'Cafe A']],
    ])
  })
})
