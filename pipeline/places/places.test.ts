import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadBoundary } from './geo.ts'
import { blockCode, buildingMatch, junkReason, samePoint, type Member } from './merge.ts'
import { CURATED, resolve, validatePlaces } from './build.ts'
import type { Row } from './clean.ts'

const ring = loadBoundary()
const pt = (name: string, lat: number, lon: number, src: Member['src'] = 'gosom'): Member => ({ src, id: name, name, location: { lat, lon } })

describe('block codes', () => {
  it('reads UTM block codes out of names', () => {
    expect(blockCode('N28A, School Of Computing')).toBe('N28a')
    expect(blockCode('S 47')).toBe('S47')
    expect(blockCode('Pejabat Harta Bina UTM (F53)')).toBe('F53')
    expect(blockCode('KTGB X1')).toBe('X01')
    expect(blockCode('Kolej 10')).toBeUndefined()
  })
})

describe('hard drop rules', () => {
  it('drops junk and keeps real places', () => {
    expect(junkReason('Tong sampah')).toBe('bin/waste')
    expect(junkReason('Durian Tree')).toBe('tree')
    expect(junkReason('TNB Substation')).toBe('utility')
    expect(junkReason('Unnamed building')).toBe('unnamed')
    expect(junkReason('Rumah Staff')).toBe('private home')
    expect(junkReason('Kafe X', {}, 'Permanently closed')).toBe('closed')
    expect(junkReason('Bus Stop 6', { highway: 'bus_stop' })).toBe('bus stop (comes from transit data)')
    // Small code-only "house" = staff housing; a bigger one is a hostel block.
    expect(junkReason('F41', { building: 'house' }, '', 190)).toBe('private home')
    expect(junkReason('G26', { building: 'house' }, '', 350)).toBeUndefined()
    expect(junkReason('Arked Meranti', { building: 'yes' })).toBeUndefined()
  })
})

describe('merging', () => {
  it('merges the same place, keeps different places apart', () => {
    expect(samePoint(pt('Perpustakaan Sultanah Zanariah', 1.5600, 103.6370), pt('Sultanah Zanariah Library', 1.56005, 103.6370))).toBe(true)
    expect(samePoint(pt('Cafe', 1.5600, 103.6370), pt('Cafe', 1.5604, 103.6370))).toBe(false)
    expect(samePoint(pt('M22, KTDI', 1.5600, 103.6370), pt('M23, KTDI', 1.56001, 103.6370))).toBe(false)
    expect(buildingMatch('M46', 'M46 Fakulti Kejuruteraan Awam, UTM')).toBe(1)
    expect(buildingMatch('C23', 'C23 FKM Library')).toBe(0)
  })
})

const row = (id: string, over: Partial<Row['clean']> = {}, flags: string[] = []): Row => ({
  id, members: [pt(`raw ${id}`, 1.559, 103.637)], location: { lat: 1.559, lon: 103.637 }, tag: 'google-only', inV1: false,
  buildingDistM: 0, flags,
  clean: { id, name: `Place ${id}`, aliases: [], category: 'Food', merge_with: null, confidence: 0.9, should_drop: false, reason: '', ...over },
})

describe('resolve', () => {
  it('applies Gemini merges and drops, holds back flagged rows, and obeys overrides', () => {
    const rows = [
      row('a'),
      row('b', { merge_with: 'a', name: 'Kafe A' }),
      row('c', { should_drop: true, reason: 'private home' }),
      row('d', {}, ['confidence 0.5']),
      row('e', {}, ['confidence 0.4']),
    ]
    const r = resolve(rows, { e: { action: 'fix', name: 'Fixed E', by: 'user' } })
    expect(r.places.map((p) => [p.id, p.name, p.aliases])).toEqual([
      ['a', 'Place a', ['Kafe A', 'raw b']],
      ['e', 'Fixed E', []],
    ])
    expect(r.dropped).toEqual([{ id: 'c', name: 'raw c', reason: 'private home' }])
    expect(r.pending.map((p) => p.id)).toEqual(['d'])
  })
})

describe('validatePlaces', () => {
  it('catches unnamed, outside and duplicate ids', () => {
    const ok = { id: 'x', name: 'Arked Meranti', aliases: [], category: 'Food', location: { lat: 1.559, lon: 103.637 } }
    expect(validatePlaces([ok], ring)).toEqual([])
    expect(validatePlaces([ok, { ...ok, name: 'Unnamed cafe' }, { ...ok, id: 'y', location: { lat: 1.5, lon: 103.5 } }], ring)).toEqual([
      'duplicate id x', 'unnamed: x "Unnamed cafe"', 'outside boundary: y Arked Meranti',
    ])
  })

  it.runIf(existsSync(CURATED))('the committed curated places are valid', () => {
    const places = JSON.parse(readFileSync(CURATED, 'utf8'))
    expect(validatePlaces(places, ring)).toEqual([])
    expect(places.length).toBeGreaterThan(300)
  })
})
