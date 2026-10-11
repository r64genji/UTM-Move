import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { addCandidate, appendEvidence, hausdorffM, readCandidates, readEvidence } from './store.ts'

// About 1.11 m per 0.00001 degree of latitude.
const a = { lat: 1.5589, lon: 103.6387 }
const b = { lat: 1.5599, lon: 103.6387 }

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'shortcuts-'))
})

describe('hausdorffM', () => {
  test('same line is 0 m, reversed or not', () => {
    expect(hausdorffM([a, b], [b, a])).toBeCloseTo(0, 6)
  })

  test('a parallel line 5 m east is 5 m away', () => {
    const east = (p: typeof a) => ({ lat: p.lat, lon: p.lon + 5 / 111_195 / Math.cos((p.lat * Math.PI) / 180) })
    expect(hausdorffM([a, b], [east(a), east(b)])).toBeCloseTo(5, 1)
  })

  test('a line half as long is far from the full line', () => {
    const mid = { lat: 1.5594, lon: 103.6387 }
    expect(Math.round(hausdorffM([a, b], [a, mid]))).toBe(56)
  })
})

describe('candidates', () => {
  test('a new candidate is stored as GeoJSON with [lon, lat] coordinates', () => {
    const { id, merged } = addCandidate({ id: 'sc-1', kind: 'stairs', geometry: [a, b], from: 'N28a' }, root)
    expect([id, merged]).toEqual(['sc-1', false])
    const fc = JSON.parse(readFileSync(join(root, 'shortcuts', 'candidates.geojson'), 'utf8'))
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      properties: { id: 'sc-1', kind: 'stairs', from: 'N28a' },
      geometry: { type: 'LineString', coordinates: [[103.6387, 1.5589], [103.6387, 1.5599]] },
    })
  })

  test('a line within 10 m merges into the existing candidate and fills missing hints', () => {
    addCandidate({ id: 'sc-1', kind: 'footpath', geometry: [a, b], from: 'N28a' }, root)
    const near = [{ lat: 1.55995, lon: 103.63872 }, { lat: 1.55892, lon: 103.63869 }]
    expect(addCandidate({ kind: 'footpath', geometry: near, from: 'other', to: 'Arked' }, root)).toEqual({ id: 'sc-1', merged: true })
    expect(readCandidates(root)).toEqual([{ id: 'sc-1', kind: 'footpath', geometry: [a, b], from: 'N28a', to: 'Arked' }])
  })

  test('a line 20 m away is a new candidate with a generated id', () => {
    addCandidate({ id: 'sc-1', kind: 'footpath', geometry: [a, b] }, root)
    const far = [{ lat: 1.5589, lon: 103.63888 }, { lat: 1.5599, lon: 103.63888 }]
    expect(addCandidate({ kind: 'footpath', geometry: far }, root)).toEqual({ id: 'sc-125ea104f8', merged: false })
    expect(readCandidates(root).map((c) => c.id)).toEqual(['sc-1', 'sc-125ea104f8'])
  })
})

describe('evidence', () => {
  test('records go to <source>.jsonl and re-appending the same claim adds nothing', () => {
    const claim = { shortcutId: 'sc-1', source: 'gps-trace', ref: 'trace-42', summary: 'walked it', observedAt: '2026-10-11' } as const
    expect(appendEvidence(claim, root).added).toBe(true)
    expect(appendEvidence(claim, root).added).toBe(false)
    appendEvidence({ shortcutId: 'sc-1', source: 'osm', ref: 'way/1', summary: 'in OSM', observedAt: '2026-10-11' }, root)
    expect(readFileSync(join(root, 'evidence', 'gps-trace.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)
    expect(readEvidence(root).map((e) => [e.source, e.ref])).toEqual([['gps-trace', 'trace-42'], ['osm', 'way/1']])
  })

  test('a bad record is rejected before it is written', () => {
    expect(() => appendEvidence({ shortcutId: 'sc-1', source: 'osm', summary: 'x', observedAt: '11/10/2026' }, root)).toThrow('date must be YYYY-MM-DD')
    expect(readEvidence(root)).toEqual([])
  })
})
