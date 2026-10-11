// Shared read/write helpers for the shortcut candidate store and the evidence store.
// Every source agent (research, vision, floor plans, GPS, user reports) writes through here.
// Formats: docs/v2/evidence.md
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Evidence, ShortcutCandidate, type LatLon } from '../../src/domain/schemas.ts'

/** Candidates whose lines are this close (Hausdorff, metres) are the same shortcut. */
export const MERGE_DISTANCE_M = 10

const candidatesPath = (root: string) => join(root, 'shortcuts', 'candidates.geojson')
const evidenceDir = (root: string) => join(root, 'evidence')
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 10)

/** Hold a lock file while `fn` runs, so parallel scripts do not lose writes. */
function withLock<T>(path: string, fn: () => T): T {
  mkdirSync(dirname(path), { recursive: true })
  const lock = `${path}.lock`
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { force: true })
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${lock}`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
  try {
    return fn()
  } finally {
    rmSync(lock, { force: true })
  }
}

// ---------- geometry ----------

/** Project to local metres around `origin` (equirectangular, fine at campus scale). */
function toXY(p: LatLon, origin: LatLon): [number, number] {
  const k = (Math.PI / 180) * 6_371_000
  return [(p.lon - origin.lon) * k * Math.cos((origin.lat * Math.PI) / 180), (p.lat - origin.lat) * k]
}

function pointToSegment([px, py]: number[], [ax, ay]: number[], [bx, by]: number[]): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Points along the line, at most `step` metres apart. */
function densify(line: number[][], step = 2): number[][] {
  const out = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step))
    for (let j = 1; j <= n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n])
  }
  return out
}

function directed(a: number[][], b: number[][]): number {
  let worst = 0
  for (const p of densify(a)) {
    let best = Infinity
    for (let i = 1; i < b.length; i++) best = Math.min(best, pointToSegment(p, b[i - 1], b[i]))
    worst = Math.max(worst, best)
  }
  return worst
}

/** Hausdorff distance between two polylines, in metres. Direction does not matter. */
export function hausdorffM(a: LatLon[], b: LatLon[]): number {
  const xa = a.map((p) => toXY(p, a[0]))
  const xb = b.map((p) => toXY(p, a[0]))
  return Math.max(directed(xa, xb), directed(xb, xa))
}

// ---------- candidates: data/shortcuts/candidates.geojson ----------

interface Feature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

export function toFeature({ geometry, ...properties }: { geometry: LatLon[] } & Record<string, unknown>): Feature {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates: geometry.map((p) => [p.lon, p.lat]) } }
}

/** GeoJSON with one feature per line, so git diffs and merges stay readable. */
export function featureCollection(features: unknown[]): string {
  return `{"type":"FeatureCollection","features":[\n${features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`
}

export function readCandidates(root = 'data'): ShortcutCandidate[] {
  const path = candidatesPath(root)
  if (!existsSync(path)) return []
  const fc = JSON.parse(readFileSync(path, 'utf8')) as { features: Feature[] }
  return fc.features.map((f) =>
    ShortcutCandidate.parse({ ...f.properties, geometry: f.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })) }),
  )
}

export type NewCandidate = Omit<ShortcutCandidate, 'id'> & { id?: string }

/**
 * Add a candidate, or merge it into an existing one within MERGE_DISTANCE_M.
 * Returns the id to attach evidence to. Missing from/to/note on the existing candidate are filled in.
 */
export function addCandidate(input: NewCandidate, root = 'data'): { id: string; merged: boolean } {
  const path = candidatesPath(root)
  return withLock(path, () => {
    const all = readCandidates(root)
    const id = input.id ?? `sc-${hash(input.kind + JSON.stringify(input.geometry.map((p) => [p.lat.toFixed(6), p.lon.toFixed(6)])))}`
    const candidate = ShortcutCandidate.parse({ ...input, id })
    const same = all.find((c) => c.id === id || hausdorffM(c.geometry, candidate.geometry) <= MERGE_DISTANCE_M)
    if (same) {
      same.from ??= candidate.from
      same.to ??= candidate.to
      same.note ??= candidate.note
    } else {
      all.push(candidate)
    }
    writeFileSync(`${path}.tmp`, featureCollection(all.map(toFeature)))
    renameSync(`${path}.tmp`, path)
    return { id: same?.id ?? id, merged: Boolean(same) }
  })
}

// ---------- evidence: data/evidence/<source>.jsonl ----------

export function readEvidence(root = 'data'): Evidence[] {
  const dir = evidenceDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .flatMap((f) =>
      readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => Evidence.parse(JSON.parse(line))),
    )
}

export type NewEvidence = Omit<Evidence, 'id'> & { id?: string }

/**
 * Append one evidence record to data/evidence/<source>.jsonl.
 * The id defaults to a hash of (shortcutId, source, ref or summary, imagery), so re-running a script adds nothing new.
 */
export function appendEvidence(input: NewEvidence, root = 'data'): { record: Evidence; added: boolean } {
  const id = input.id ?? `ev-${hash([input.shortcutId, input.source, input.ref ?? input.summary, input.imagery ?? ''].join('|'))}`
  const record = Evidence.parse({ ...input, id })
  const path = join(evidenceDir(root), `${record.source}.jsonl`)
  return withLock(path, () => {
    const seen = existsSync(path) && readFileSync(path, 'utf8').split('\n').some((l) => l && JSON.parse(l).id === id)
    if (!seen) appendFileSync(path, JSON.stringify(record) + '\n')
    return { record, added: !seen }
  })
}
