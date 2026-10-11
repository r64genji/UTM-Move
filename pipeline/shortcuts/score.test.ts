import { describe, expect, test } from 'vitest'
import type { Evidence } from '../../src/domain/schemas.ts'
import { scoreShortcut } from './score.ts'

let n = 0
function ev(source: Evidence['source'], extra: Partial<Evidence> = {}): Evidence {
  n += 1
  return { id: `e${n}`, shortcutId: 's1', source, summary: 'x', observedAt: '2026-10-11', ...extra }
}

describe('scoreShortcut', () => {
  test('no evidence is a guess', () => {
    expect(scoreShortcut([])).toEqual({ level: 'guess', reasons: ['no evidence'] })
  })

  test('one source is a guess', () => {
    expect(scoreShortcut([ev('research'), ev('research', { ref: 'reddit' })])).toEqual({
      level: 'guess',
      reasons: ['only research'],
    })
  })

  test('already in OSM is verified', () => {
    expect(scoreShortcut([ev('osm', { ref: 'way/123' })])).toEqual({ level: 'verified', reasons: ['in OSM'] })
  })

  test('2 GPS traces are verified', () => {
    expect(scoreShortcut([ev('gps-trace', { ref: 't1' }), ev('gps-trace', { ref: 't2' })])).toEqual({
      level: 'verified',
      reasons: ['2 GPS traces'],
    })
  })

  test('1 GPS trace counted twice (same ref) is not verified', () => {
    expect(scoreShortcut([ev('gps-trace', { ref: 't1' }), ev('gps-trace', { ref: 't1' })])).toEqual({
      level: 'guess',
      reasons: ['only gps-trace'],
    })
  })

  test('3 user confirmations are verified', () => {
    const users = ['u1', 'u2', 'u3'].map((ref) => ev('user-report', { ref }))
    expect(scoreShortcut(users)).toEqual({ level: 'verified', reasons: ['3 user confirmations'] })
  })

  test('2 user confirmations are only a guess', () => {
    const users = ['u1', 'u2'].map((ref) => ev('user-report', { ref }))
    expect(scoreShortcut(users)).toEqual({ level: 'guess', reasons: ['only user-report'] })
  })

  test('2 independent sources are likely', () => {
    expect(scoreShortcut([ev('research'), ev('floor-plan')])).toEqual({
      level: 'likely',
      reasons: ['2 independent sources: floor-plan, research'],
    })
  })

  test('a satellite line on both Esri and Bing is likely', () => {
    expect(scoreShortcut([ev('satellite', { imagery: 'esri' }), ev('satellite', { imagery: 'bing' })])).toEqual({
      level: 'likely',
      reasons: ['seen on Esri and Bing imagery'],
    })
  })

  test('a satellite line on Esri only is a guess', () => {
    expect(scoreShortcut([ev('satellite', { imagery: 'esri' }), ev('satellite', { imagery: 'esri' })])).toEqual({
      level: 'guess',
      reasons: ['only satellite'],
    })
  })

  test('records below 0.5 confidence do not count', () => {
    expect(scoreShortcut([ev('osm', { confidence: 0.4 }), ev('research', { confidence: 0.5 })])).toEqual({
      level: 'guess',
      reasons: ['only research'],
    })
  })

  test('verified wins over likely and lists every reason', () => {
    const all = [ev('osm'), ev('gps-trace', { ref: 'a' }), ev('gps-trace', { ref: 'b' }), ev('research')]
    expect(scoreShortcut(all)).toEqual({ level: 'verified', reasons: ['in OSM', '2 GPS traces'] })
  })
})
