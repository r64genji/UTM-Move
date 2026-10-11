// Data gate: `npm run validate`. Checks the built public/data/* and the committed inputs; exit 1 on any failure.
// validate(root) reads <root>/data/** and <root>/public/data/**. The CLI uses the repo root.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { z } from 'zod'
import { Access, Place, ShortcutKind, ShortcutLevel, TransitData, type LatLon } from '../src/domain/schemas.ts'
import { decodeGraph, edgeCoords, FLAG_LIKELY, EDGE_KINDS, type Graph } from '../src/domain/walk/graph.ts'
import { snapToEdge } from '../src/domain/walk/snap.ts'
import { CalendarFile, RouteFile, StopsFile } from './transit/build.ts'
import { Overrides } from './places/overrides.ts'
import { distanceM, distanceToRingM, inRing } from './places/geo.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const OFF_CAMPUS_MAX_M = 3000
const SNAP_MAX_M = 30
const MAX_TRIP_MIN = 180
const DUP_NAME_M = 25
/** Fields a place may carry. Anything else (phone, rating, review, place_id URL) is scraped data we must not ship. */
const PLACE_FIELDS = new Set(['id', 'name', 'aliases', 'category', 'location', 'buildingId', 'blockCode', 'openingHours', 'entrances'])
const SCRAPED = /place_id|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|ChIJ[\w-]{10,}/i
const UNNAMED = /^(|unnamed|unknown|null|undefined)$/i

const ShortcutProps = z.object({ id: z.string().min(1), kind: ShortcutKind.optional(), level: ShortcutLevel.optional(), access: Access.optional() })
const ShortcutFile = z.object({
  features: z.array(z.object({ properties: ShortcutProps, geometry: z.object({ type: z.string(), coordinates: z.array(z.any()) }) })),
})

export interface Check { name: string; count: number; errors: string[] }
export interface Result { ok: boolean; checks: Check[]; lines: string[] }

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const dupes = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
const m = (x: number) => `${Math.round(x)} m`
const q = (p: { id: string; name: string }) => `"${p.name}" (id ${p.id})`

export function validate(root: string = REPO): Result {
  const checks: Check[] = []
  const check = (name: string, run: (err: (msg: string) => void) => number) => {
    const errors: string[] = []
    let count = 0
    try { count = run((msg) => errors.push(msg)) } catch (e) { errors.push(`${name}: ${(e as Error).message}`) }
    checks.push({ name, count, errors })
  }
  const pub = (f: string) => join(root, 'public/data', f)
  const src = (f: string) => join(root, 'data', f)
  const load = (path: string): unknown => {
    const text = readFileSync(path, 'utf8')
    return path.endsWith('.yaml') ? parse(text) : JSON.parse(text)
  }
  /** Load a file, or report why not and return undefined. */
  const tryLoad = (label: string, path: string, err: (msg: string) => void) => {
    try { return load(path) } catch (e) { err(`${label}: cannot read ${path}: ${(e as Error).message}`); return undefined }
  }

  // Everything is loaded once; read problems surface in the "files" check.
  const loadErrors: string[] = []
  const rawTransit = tryLoad('transit.json', pub('transit.json'), (e) => loadErrors.push(e))
  const rawPlaces = tryLoad('places.json', pub('places.json'), (e) => loadErrors.push(e))
  const rawBoundary = tryLoad('boundary', src('campus-boundary.geojson'), (e) => loadErrors.push(e)) as { features: { geometry: { coordinates: number[][][] } }[] } | undefined
  let graph: Graph | undefined
  try {
    const bytes = readFileSync(pub('graph.bin'))
    graph = decodeGraph(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  } catch (e) {
    loadErrors.push(`graph.bin: ${(e as Error).message}`)
  }

  const transitParsed = TransitData.safeParse(rawTransit)
  const transit = transitParsed.success ? transitParsed.data : undefined
  const rawList = Array.isArray(rawPlaces) ? (rawPlaces as Record<string, unknown>[]) : []
  const places = rawList.flatMap((p) => { const r = Place.safeParse(p); return r.success ? [r.data] : [] })
  const stops = transit?.stops ?? []
  const ring: LatLon[] = rawBoundary?.features?.[0]?.geometry?.coordinates?.[0]?.map(([lon, lat]) => ({ lat, lon })) ?? []
  const outsideM = (p: LatLon) => (inRing(p, ring) ? 0 : distanceToRingM(p, ring))

  // Committed inputs, each with its schema.
  const inputs: { label: string; path: string; schema: z.ZodType }[] = [
    { label: 'stops.yaml', path: src('transit/stops.yaml'), schema: StopsFile },
    { label: 'calendar.yaml', path: src('transit/calendar.yaml'), schema: CalendarFile },
    { label: 'overrides/places.yaml', path: src('overrides/places.yaml'), schema: Overrides },
    { label: 'places.curated.json', path: src('places.curated.json'), schema: z.array(Place) },
  ]
  if (existsSync(src('transit'))) {
    for (const f of readdirSync(src('transit')).filter((f) => /^route-.*\.yaml$/.test(f)).sort()) inputs.push({ label: f, path: src(`transit/${f}`), schema: RouteFile })
  }
  const shortcutFiles = existsSync(src('shortcuts')) ? readdirSync(src('shortcuts')).filter((f) => f.endsWith('.geojson')).sort() : []
  for (const f of shortcutFiles) inputs.push({ label: `shortcuts/${f}`, path: src(`shortcuts/${f}`), schema: ShortcutFile })
  const loaded = new Map<string, unknown>()

  check('files and schemas', (err) => {
    loadErrors.forEach(err)
    if (!transitParsed.success) for (const i of transitParsed.error.issues.slice(0, 5)) err(`transit.json: ${i.path.join('.')}: ${i.message}`)
    if (rawPlaces !== undefined && !Array.isArray(rawPlaces)) err('places.json: expected an array')
    rawList.forEach((p, i) => {
      const r = Place.safeParse(p)
      if (!r.success) err(`places: entry ${i} (id ${String(p.id)}) is invalid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`)
    })
    if (graph) {
      if (graph.nodeCount === 0 || graph.edgeCount === 0) err('graph.bin: has no nodes or edges')
      else if (Array.from(graph.edgeKind).some((k) => k >= EDGE_KINDS.length)) err('graph.bin: contains an unknown edge kind')
    }
    for (const inp of inputs) {
      if (!existsSync(inp.path)) continue
      const raw = tryLoad(inp.label, inp.path, err)
      if (raw === undefined) continue
      loaded.set(inp.label, raw)
      const r = inp.schema.safeParse(raw)
      if (!r.success) err(`${inp.label}: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`)
    }
    return 3 + loaded.size
  })

  check('trip stops exist', (err) => {
    const known = new Set(stops.map((s) => s.id))
    let n = 0
    for (const t of transit?.trips ?? []) for (const st of t.stopTimes) {
      n++
      if (!known.has(st.stopId)) err(`transit: trip ${t.id} uses stop id ${st.stopId}, which does not exist`)
    }
    return n
  })

  check('no unused stops', (err) => {
    const used = new Set((transit?.trips ?? []).flatMap((t) => t.stopTimes.map((st) => st.stopId)))
    for (const s of stops) if (!used.has(s.id)) err(`transit: stop ${q(s)} is not used by any trip`)
    return stops.length
  })

  check('stops inside campus', (err) => {
    for (const s of stops) {
      const d = outsideM(s.location)
      if (s.offCampus) {
        if (d > OFF_CAMPUS_MAX_M) err(`stops: ${q(s)} is offCampus but ${m(d)} from the campus boundary (max ${OFF_CAMPUS_MAX_M} m)`)
      } else if (d > 0) {
        err(`stops: ${q(s)} is ${m(d)} outside the campus boundary`)
      }
    }
    return stops.length
  })

  check('places inside campus', (err) => {
    for (const p of places) {
      const d = outsideM(p.location)
      if (d > 0) err(`places: ${q(p)} is ${m(d)} outside the campus boundary`)
    }
    return places.length
  })

  check('walk graph connectivity', (err) => {
    if (!graph) return 0
    const parent = Array.from({ length: graph.nodeCount }, (_, i) => i)
    const find = (x: number): number => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x }
    for (let e = 0; e < graph.edgeCount; e++) parent[find(graph.edgeFrom[e])] = find(graph.edgeTo[e])
    const size = new Map<number, number>()
    for (let n = 0; n < graph.nodeCount; n++) size.set(find(n), (size.get(find(n)) ?? 0) + 1)
    const main = [...size.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const test = (what: string, p: LatLon) => {
      const s = snapToEdge(graph, p)
      if (!s) return err(`${what} cannot snap: the graph has no edges`)
      if (s.distanceM > SNAP_MAX_M) return err(`${what} is ${m(s.distanceM)} from the nearest walkway (max ${SNAP_MAX_M} m)`)
      if (find(graph.edgeFrom[s.edge]) !== main) err(`${what} snaps to a walkway that is cut off from the main walk network`)
    }
    let n = 0
    for (const s of stops) { n++; test(`stops: ${q(s)}`, s.location) }
    for (const p of places) for (const [i, e] of (p.entrances ?? []).entries()) { n++; test(`places: ${q(p)} entrance ${i + 1}`, e) }
    return n
  })

  check('trip times', (err) => {
    for (const t of transit?.trips ?? []) {
      const times = t.stopTimes.map((s) => s.time)
      for (let i = 1; i < times.length; i++) {
        if (minutes(times[i]) <= minutes(times[i - 1])) {
          err(`transit: trip ${t.id} time does not increase at stop ${t.stopTimes[i].stopId} (${times[i - 1]} then ${times[i]})`)
          break
        }
      }
      const total = minutes(times[times.length - 1]) - minutes(times[0])
      if (total > MAX_TRIP_MIN) err(`transit: trip ${t.id} takes ${total} min (${times[0]} to ${times[times.length - 1]}), more than ${MAX_TRIP_MIN / 60} h`)
    }
    return transit?.trips.length ?? 0
  })

  check('place names', (err) => {
    for (const p of rawList) {
      const name = typeof p.name === 'string' ? p.name.trim() : ''
      if (UNNAMED.test(name)) err(`places: unnamed place (id ${String(p.id)}) has name ${JSON.stringify(p.name)}`)
    }
    const seen = places.filter((p) => !UNNAMED.test(p.name.trim())).map((p) => ({ p, key: norm(p.name) }))
    for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
      if (seen[i].key !== seen[j].key) continue
      const d = distanceM(seen[i].p.location, seen[j].p.location)
      if (d <= DUP_NAME_M) err(`places: ${q(seen[i].p)} and (id ${seen[j].p.id}) have the same name ${m(d)} apart`)
    }
    return rawList.length
  })

  check('unique ids', (err) => {
    const report = (kind: string, ids: string[]) => dupes(ids).forEach((id) => err(`${kind}: duplicate id ${id}`))
    report('places', rawList.map((p) => String(p.id)))
    report('stops', stops.map((s) => s.id))
    report('routes', (transit?.routes ?? []).map((r) => r.id))
    for (const f of shortcutFiles) {
      const r = ShortcutFile.safeParse(loaded.get(`shortcuts/${f}`))
      if (r.success) report(`shortcuts/${f}`, r.data.features.map((x) => x.properties.id))
    }
    return rawList.length + stops.length + (transit?.routes.length ?? 0)
  })

  check('places carry only our fields', (err) => {
    for (const p of rawList) {
      for (const k of Object.keys(p)) if (!PLACE_FIELDS.has(k)) err(`places: ${q({ id: String(p.id), name: String(p.name) })} has field "${k}" that we do not ship`)
      if (SCRAPED.test(JSON.stringify(p))) err(`places: ${q({ id: String(p.id), name: String(p.name) })} contains a scraped Google link or place id`)
    }
    return rawList.length
  })

  check('graph shortcuts are verified or likely', (err) => {
    if (!graph) return 0
    const used = (kind: string) => Array.from(graph.edgeKind).filter((k) => EDGE_KINDS[k] === kind).length
    type Feat = { properties: { id: string; level?: string; access?: string; inOsm?: boolean }; geometry: { type: string; coordinates: number[][] } }
    const feats = ((loaded.get('shortcuts/scored.geojson') as { features?: Feat[] } | undefined)?.features ?? [])
    const eligible = feats.filter((f) => (f.properties.level === 'verified' || f.properties.level === 'likely') && f.properties.access !== 'private' && !f.properties.inOsm)
    const likely = eligible.filter((f) => f.properties.level === 'likely').length
    const shortcutEdges = used('shortcut')
    const likelyEdges = Array.from(graph.edgeFlags).filter((f) => f & FLAG_LIKELY).length
    if (shortcutEdges + used('steps') < Math.min(1, eligible.length)) err('graph: no shortcut edges although verified/likely shortcuts exist')
    if (likelyEdges > likely) err(`graph: ${likelyEdges} likely-tier edges but only ${likely} likely shortcuts in data/shortcuts/scored.geojson`)
    // A guess/private shortcut must not appear as a graph edge: same interior points, endpoints at the edge's nodes.
    const near = (a: LatLon, b: LatLon) => distanceM(a, b) < 0.5
    for (const f of feats) {
      if (eligible.includes(f) || f.geometry.type !== 'LineString' || f.geometry.coordinates.length < 3) continue
      const mid = f.geometry.coordinates.slice(1, -1).map(([lon, lat]) => ({ lat, lon }))
      for (let e = 0; e < graph.edgeCount; e++) {
        const kind = EDGE_KINDS[graph.edgeKind[e]]
        if (kind !== 'shortcut' && kind !== 'steps') continue
        const pts = edgeCoords(graph, e, 0).slice(1, -1)
        if (pts.length === mid.length && pts.every((p, i) => near(p, mid[i]))) {
          err(`graph: edge ${e} is shortcut ${f.properties.id}, which is ${f.properties.access === 'private' ? 'private' : `level ${f.properties.level}`} and must not be routed`)
        }
      }
    }
    return shortcutEdges
  })

  const lines = checks.flatMap((c) => c.errors.map((e) => `✗ ${e}`))
  const failed = checks.filter((c) => c.errors.length).length
  for (const c of checks) lines.push(`${c.errors.length ? '✗' : '✓'} ${c.name}: ${c.errors.length ? `${c.errors.length} problem${c.errors.length === 1 ? '' : 's'}` : `${c.count} checked`}`)
  lines.push(failed ? `validate: ${failed} of ${checks.length} checks failed` : `validate: all ${checks.length} checks passed`)
  return { ok: failed === 0, checks, lines }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validate(process.argv[2] ?? REPO)
  console.log(result.lines.join('\n'))
  process.exit(result.ok ? 0 : 1)
}
