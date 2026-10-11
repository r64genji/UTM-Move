// Turns the evidence for one shortcut into a level. Pure: no I/O.
import type { Evidence, ShortcutLevel } from '../../src/domain/schemas.ts'

export interface Score {
  level: ShortcutLevel
  reasons: string[]
}

/** Distinct observations of one source. Records with the same `ref` count once. */
function count(evidence: Evidence[], source: Evidence['source']): number {
  return new Set(evidence.filter((e) => e.source === source).map((e) => e.ref ?? e.id)).size
}

/**
 * verified: in OSM, or 2+ GPS traces, or 3+ user confirmations.
 * likely: 2+ independent sources (different `source` kinds), or a satellite line on both Esri and Bing.
 * guess: anything else.
 * Records with confidence below 0.5 are ignored.
 */
export function scoreShortcut(evidence: Evidence[]): Score {
  const ev = evidence.filter((e) => (e.confidence ?? 1) >= 0.5)
  const verified: string[] = []
  if (count(ev, 'osm') > 0) verified.push('in OSM')
  const traces = count(ev, 'gps-trace')
  if (traces >= 2) verified.push(`${traces} GPS traces`)
  const users = count(ev, 'user-report')
  if (users >= 3) verified.push(`${users} user confirmations`)
  if (verified.length) return { level: 'verified', reasons: verified }

  const likely: string[] = []
  const sources = [...new Set(ev.map((e) => e.source))].sort()
  if (sources.length >= 2) likely.push(`${sources.length} independent sources: ${sources.join(', ')}`)
  const imagery = new Set(ev.filter((e) => e.source === 'satellite').map((e) => e.imagery))
  if (imagery.has('esri') && imagery.has('bing')) likely.push('seen on Esri and Bing imagery')
  if (likely.length) return { level: 'likely', reasons: likely }

  return { level: 'guess', reasons: ev.length ? [`only ${sources[0]}`] : ['no evidence'] }
}
