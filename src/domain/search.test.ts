import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { loadIndex, search } from './search.ts'

// Built by `npm run build:search` (part of prebuild) from the real places and stops.
const index = loadIndex(readFileSync('public/data/search-index.json', 'utf8'))
const first = (q: string, category?: Parameters<typeof search>[2]) => {
  const h = search(index, q, category)[0]
  return `${h?.id} ${h?.name}`
}

test('ktdi finds the college before its blocks', () => {
  expect(first('ktdi')).toBe('place:g-5fdb8cbc39 Kolej Tun Dr Ismail')
})

test('a block code finds that block first', () => {
  expect(first('n28')).toBe('place:osm-w840401384 Block N28, Faculty of Computing')
  expect(first('N28A')).toBe('place:osm-w446796239 Block N28A, Faculty of Computing')
})

test('Malay and English category words find the same places', () => {
  expect(first('perpus')).toBe('place:osm-w207409194 Perpustakaan Sultanah Zanariah')
  expect(first('library')).toBe('place:osm-w207409194 Perpustakaan Sultanah Zanariah')
  expect(search(index, 'library').map((h) => h.id)).toContain('place:osm-w207409194')
  expect(first('masjid')).toBe('place:osm-w207409192 Masjid Sultan Ismail')
})

test('a typo still finds the library', () => {
  expect(first('perpustakan')).toBe('place:osm-w207409194 Perpustakaan Sultanah Zanariah')
})

test('bus stops are searchable', () => {
  expect(first('centre point')).toBe('stop:CP Centre Point')
})

test('a category chip keeps only that category', () => {
  const hits = search(index, 'ktdi', 'Prayer')
  expect(hits[0].name).toBe('Surau MA3, KTDI')
  expect(hits.every((h) => h.category === 'Prayer')).toBe(true)
  expect(search(index, 'kafe', 'Food').every((h) => h.category === 'Food')).toBe(true)
})

test('nothing for blank or nonsense', () => {
  expect(search(index, '   ')).toEqual([])
  expect(search(index, 'zzqxj')).toEqual([])
})
