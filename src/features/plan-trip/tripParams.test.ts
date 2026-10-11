import { expect, test } from 'vitest'
import { parseTrip, tripSearch } from './tripParams.ts'

test('a shared trip link reads back into the same trip', () => {
  const trip = parseTrip(new URLSearchParams('from=me&to=place:N28a&when=arrive&at=2026-10-12T08:00&profile=sheltered'))
  expect(trip).toEqual({
    from: { kind: 'me' },
    to: { kind: 'place', id: 'N28a' },
    when: { type: 'arrive', time: '2026-10-12T08:00' },
    profile: 'sheltered',
  })
  expect(tripSearch(trip)).toBe('?from=me&to=place%3AN28a&when=arrive&at=2026-10-12T08%3A00&profile=sheltered')
})

test('a map point and defaults', () => {
  const trip = parseTrip(new URLSearchParams('from=pt:1.559,103.638&to=stop:CP&profile=bogus'))
  expect(trip).toEqual({
    from: { kind: 'point', lat: 1.559, lon: 103.638 },
    to: { kind: 'stop', id: 'CP' },
    when: { type: 'now' },
    profile: 'fastest',
  })
  expect(tripSearch(trip)).toBe('?from=pt%3A1.559000%2C103.638000&to=stop%3ACP')
})

test('junk endpoints are dropped', () => {
  expect(parseTrip(new URLSearchParams('from=pt:abc&to=nope')).from).toBeNull()
  expect(parseTrip(new URLSearchParams('to=nope')).to).toBeNull()
})
