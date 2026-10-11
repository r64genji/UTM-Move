// Build public/data/graph.bin from committed inputs. Run: npm run build:graph
// Inputs: data/osm/{walk-ways.geojson,landmarks.json,dem-grid.json}, data/transit/stops.yaml,
// data/shortcuts/scored.geojson (verified + likely), data/overrides/indoor/*.geojson (doors, indoor links),
// public/data/places.json (place entrances; skipped with a warning when missing). Docs: docs/v2/graph-pipeline.md
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { parse } from 'yaml'
import type { LatLon, OpeningHours } from '../../src/domain/schemas.ts'
import { encodeGraph, type EdgeKind, type GraphInput } from '../../src/domain/walk/graph.ts'
import { decodeDem, type DemGrid } from './dem.ts'
import { graphReport } from './report.ts'
import type { WayProps } from './ways.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const M = 111_320
const KX = M * Math.cos((1.56 * Math.PI) / 180)
/** A snap closer than this to an existing junction reuses the junction. */
const NODE_SNAP_M = 2
/** A dangling way end (a node only one edge uses) this close to another way is a mapping gap and gets a connector. */
const GAP_M = 12
/** Two dangling ends facing each other may be this far apart. */
const GAP_ENDS_M = 18
/** ...unless the other way is already within this many metres of walking from the end. */
const GAP_LOCAL_M = 60
const SAMPLE_M = 10
const JITTER_M = 0.5
const SIMPLIFY_M = 0.7
const r1 = (n: number) => Math.round(n * 10) / 10
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

interface Feature { geometry: { type: string; coordinates: number[] | number[][] }; properties: Record<string, unknown> }

export interface BuildInputs {
  ways: Feature[]
  dem: DemGrid
  landmarks: [lat: number, lon: number, name: string][]
  stops: { id: string; location: LatLon }[]
  /** Place entrances, id is only for reports. */
  entrances: { id: string; location: LatLon }[]
  shortcuts: Feature[]
  /** Doors (Point) and indoor links (LineString). */
  indoor: Feature[]
  /** Building and water outlines (LineString rings): a gap connector never crosses one. */
  obstacles?: Feature[]
}

interface E {
  a: number
  b: number
  /** Full line including both end nodes. */
  pts: LatLon[]
  kind: EdgeKind
  sheltered?: boolean
  stepFree?: boolean
  likely?: boolean
  indoor?: boolean
  grade?: boolean
  hours?: OpeningHours
  name?: string
}

export interface BuildReport {
  warnings: string[]
  islands: { nodes: number; km: number; at: LatLon }[]
  droppedEdges: { pts: LatLon[] }[]
  /** Node index in the output graph for each stop id / entrance id. */
  stopNode: Map<string, number>
  doorNode: Map<string, number>
  shortcuts: { verified: number; likely: number; skipped: number }
  indoorEdges: number
  doors: number
  /** Connector edges that closed a gap between two ways. */
  gaps: { from: LatLon; to: LatLon; lengthM: number }[]
}

const dist = (p: LatLon, q: LatLon) => Math.hypot((p.lat - q.lat) * M, (p.lon - q.lon) * KX)
const lineLen = (pts: LatLon[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0)
const ll = (c: number[]): LatLon => ({ lat: c[1], lon: c[0] })

/** Point at distance s (metres) along a polyline. */
function along(pts: LatLon[], s: number): LatLon {
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    if (s <= d || i === pts.length - 1) {
      const t = d ? Math.min(1, s / d) : 0
      return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lon: pts[i - 1].lon + (pts[i].lon - pts[i - 1].lon) * t }
    }
    s -= d
  }
  return pts[0]
}

/** Metres climbed and descended walking pts[0] -> pts[last]. Net height change is always kept; jitter under 0.5 m is not counted. */
export function climbOf(pts: LatLon[], height: (lat: number, lon: number) => number, grade: boolean): [up: number, down: number] {
  const len = lineLen(pts)
  const n = Math.max(1, Math.round(len / SAMPLE_M))
  const raw: number[] = []
  const z0 = height(pts[0].lat, pts[0].lon)
  const z1 = height(pts[pts.length - 1].lat, pts[pts.length - 1].lon)
  for (let i = 0; i <= n; i++) {
    if (grade) raw.push(z0 + ((z1 - z0) * i) / n) // bridge or tunnel: the ground below says nothing
    else {
      const p = along(pts, (len * i) / n)
      raw.push(height(p.lat, p.lon))
    }
  }
  const z = raw.map((v, i) => (i === 0 || i === n ? v : (raw[i - 1] + v + raw[i + 1]) / 3))
  let up = 0
  let down = 0
  let anchor = z[0]
  for (const v of z) {
    if (Math.abs(v - anchor) >= JITTER_M) {
      if (v > anchor) up += v - anchor
      else down += anchor - v
      anchor = v
    }
  }
  const rest = z[n] - anchor // keeps up - down equal to the real height difference
  if (rest > 0) up += rest
  else down -= rest
  return [r1(up), r1(down)]
}

function simplify(pts: LatLon[], tol: number): LatLon[] {
  if (pts.length <= 2) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let worst = -1
  let wi = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSeg(pts[i], a, b).d
    if (d > worst) [worst, wi] = [d, i]
  }
  if (worst <= tol) return [a, b]
  return [...simplify(pts.slice(0, wi + 1), tol).slice(0, -1), ...simplify(pts.slice(wi), tol)]
}

function distToSeg(p: LatLon, a: LatLon, b: LatLon): { d: number; t: number; q: LatLon } {
  const ax = a.lon * KX, ay = a.lat * M
  const dx = b.lon * KX - ax, dy = b.lat * M - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.lon * KX - ax) * dx + (p.lat * M - ay) * dy) / l2)) : 0
  const q = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }
  return { d: dist(p, q), t, q }
}

export function buildGraph(inp: BuildInputs): { input: GraphInput; report: BuildReport } {
  const warnings: string[] = []
  const warn = (s: string) => warnings.push(s)
  const nodes: LatLon[] = []
  let edges: E[] = []
  const height = decodeDem(inp.dem)

  // 1. OSM ways -> edges between junctions (a vertex shared by two ways, an end of a way, or a loop closure).
  const key = (p: LatLon) => `${p.lat},${p.lon}`
  const uses = new Map<string, number>()
  const ways = inp.ways.filter((w) => w.geometry.type === 'LineString')
  for (const w of ways) {
    const pts = (w.geometry.coordinates as number[][]).map(ll)
    pts.forEach((p, i) => uses.set(key(p), (uses.get(key(p)) ?? 0) + (i === 0 || i === pts.length - 1 ? 2 : 1)))
  }
  const nodeAt = new Map<string, number>()
  const nodeFor = (p: LatLon) => {
    let i = nodeAt.get(key(p))
    if (i === undefined) nodeAt.set(key(p), (i = nodes.push(p) - 1))
    return i
  }
  for (const w of ways) {
    const props = w.properties as unknown as WayProps
    const pts = (w.geometry.coordinates as number[][]).map(ll)
    let start = 0
    for (let i = 1; i < pts.length; i++) {
      if (i < pts.length - 1 && (uses.get(key(pts[i])) ?? 0) < 2) continue
      const seg = pts.slice(start, i + 1)
      start = i
      if (key(seg[0]) === key(seg[seg.length - 1]) && seg.length < 3) continue
      edges.push({ a: nodeFor(seg[0]), b: nodeFor(seg[seg.length - 1]), pts: seg, ...props })
    }
  }

  // Cross-product test: do segments ab and cd cross at a point interior to both?
  const crosses = (a: LatLon, b: LatLon, c: LatLon, d: LatLon) => {
    const o = (p: LatLon, q: LatLon, r: LatLon) => (q.lon - p.lon) * KX * ((r.lat - p.lat) * M) - (q.lat - p.lat) * M * ((r.lon - p.lon) * KX)
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
  }
  const obstacles = (inp.obstacles ?? []).filter((f) => f.geometry.type === 'LineString').map((f) => (f.geometry.coordinates as number[][]).map(ll))

  // Snap p to the network: an existing junction within NODE_SNAP_M, else split the nearest edge there.
  const snap = (p: LatLon, maxM: number, pool: E[] = edges): { node: number; d: number } | null => {
    let best: { d: number; e: E; i: number; q: LatLon } | null = null
    for (const e of pool) {
      for (let i = 1; i < e.pts.length; i++) {
        const { d, q } = distToSeg(p, e.pts[i - 1], e.pts[i])
        if (!best || d < best.d) best = { d, e, i, q }
      }
    }
    if (!best || best.d > maxM) return null
    const { e, i, q } = best
    const head = [...e.pts.slice(0, i), q]
    const tail = [q, ...e.pts.slice(i)]
    if (lineLen(head) <= NODE_SNAP_M) return { node: e.a, d: best.d }
    if (lineLen(tail) <= NODE_SNAP_M) return { node: e.b, d: best.d }
    const node = nodes.push(q) - 1
    const copy = { ...e, a: node, pts: tail }
    e.b = node
    e.pts = head
    edges.push(copy)
    return { node, d: best.d }
  }

  // 1b. Mapping gaps: a way that ends within GAP_M of another way without being joined to it.
  const gaps: BuildReport['gaps'] = []
  const degree1 = new Map<number, number>()
  for (const e of edges) for (const n of [e.a, e.b]) degree1.set(n, (degree1.get(n) ?? 0) + 1)
  for (const d of [...degree1.keys()].sort((x, y) => x - y)) {
    if (degree1.get(d) !== 1) continue
    const p = nodes[d]
    let best: { dist: number; e: E; i: number; q: LatLon } | null = null
    for (const e of edges) {
      if (e.a === d || e.b === d) continue
      for (let i = 1; i < e.pts.length; i++) {
        const { d: dd, q } = distToSeg(p, e.pts[i - 1], e.pts[i])
        const endToEnd = (degree1.get(e.a) === 1 && dist(q, nodes[e.a]) < 0.5) || (degree1.get(e.b) === 1 && dist(q, nodes[e.b]) < 0.5)
        if (dd <= (endToEnd ? GAP_ENDS_M : GAP_M) && (!best || dd < best.dist)) best = { dist: dd, e, i, q }
      }
    }
    if (!best) continue
    const { e, i, q } = best
    // Already joined nearby: walking from the end reaches that way within GAP_LOCAL_M.
    const reach = new Map<number, number>([[d, 0]])
    for (let grew = true; grew; ) {
      grew = false
      for (const x of edges) {
        const len = lineLen(x.pts)
        for (const [u, v] of [[x.a, x.b], [x.b, x.a]]) {
          const du = reach.get(u)
          if (du !== undefined && du + len <= GAP_LOCAL_M && du + len < (reach.get(v) ?? Infinity)) { reach.set(v, du + len); grew = true }
        }
      }
    }
    if (reach.has(e.a) || reach.has(e.b)) continue
    // Never across a building or water. (Another way in between would be nearer, so it cannot be crossed.)
    if (obstacles.some((ring) => ring.some((y, k) => k > 0 && crosses(p, q, ring[k - 1], y)))) continue
    const head = [...e.pts.slice(0, i), q]
    const tail = [q, ...e.pts.slice(i)]
    let target: number
    if (lineLen(head) <= NODE_SNAP_M) target = e.a
    else if (lineLen(tail) <= NODE_SNAP_M) target = e.b
    else {
      target = nodes.push(q) - 1
      edges.push({ ...e, a: target, pts: tail })
      e.b = target
      e.pts = head
      degree1.set(target, 2)
    }
    const pts = [p, nodes[target]]
    edges.push({ a: d, b: target, pts, kind: 'connector', stepFree: true })
    degree1.set(d, 2)
    degree1.set(target, (degree1.get(target) ?? 0) + 1)
    gaps.push({ from: p, to: nodes[target], lengthM: r1(lineLen(pts)) })
  }

  // 2. Doors, indoor links, shortcuts.
  const rep = { doors: 0, indoorEdges: 0, shortcuts: { verified: 0, likely: 0, skipped: 0 } }
  const doorProps = (p: Record<string, unknown>) => ({
    hours: p.hours as OpeningHours | undefined,
    stepFree: p.stepFree !== false,
    ...(p.name ? { name: String(p.name) } : {}),
  })
  const attach = (pts: LatLon[], maxM: number, extra: Omit<E, 'a' | 'b' | 'pts'>, what: string) => {
    const s = snap(pts[0], maxM)
    const t = snap(pts[pts.length - 1], maxM)
    if (!s || !t) return warn(`${what}: an end is more than ${maxM} m from the network`), false
    if (s.node === t.node) return warn(`${what}: both ends snap to the same junction`), false
    edges.push({ a: s.node, b: t.node, pts: [nodes[s.node], ...pts.slice(1, -1), nodes[t.node]], ...extra })
    return true
  }
  for (const f of inp.indoor) {
    const p = f.properties
    if (f.geometry.type === 'Point') {
      const at = ll(f.geometry.coordinates as number[])
      const s = snap(at, 40)
      if (!s) { warn(`door ${String(p.name ?? p.id)}: no path within 40 m`); continue }
      const n = nodes.push(at) - 1
      edges.push({ a: s.node, b: n, pts: [nodes[s.node], at], kind: 'door', ...doorProps(p) })
      rep.doors++
    }
  }
  for (const f of inp.indoor) {
    if (f.geometry.type !== 'LineString') continue
    const p = f.properties
    const kind = (p.kind as EdgeKind | undefined) ?? 'indoor'
    if (attach((f.geometry.coordinates as number[][]).map(ll), 20, { kind, indoor: true, sheltered: true, ...doorProps(p) }, `indoor ${String(p.name ?? p.id)}`)) rep.indoorEdges++
  }
  for (const f of inp.shortcuts) {
    const p = f.properties
    const level = p.level as string
    if ((level !== 'verified' && level !== 'likely') || p.access === 'private' || p.inOsm || f.geometry.type !== 'LineString') { rep.shortcuts.skipped++; continue }
    const stairs = p.kind === 'stairs'
    const ok = attach(
      (f.geometry.coordinates as number[][]).map(ll),
      15,
      {
        kind: stairs ? 'steps' : 'shortcut',
        stepFree: !stairs,
        likely: level === 'likely',
        indoor: p.indoor === true,
        sheltered: p.covered === true || p.indoor === true,
        grade: p.kind === 'bridge',
        ...(p.note ? { name: String(p.note).slice(0, 40) } : {}),
      },
      `shortcut ${String(p.id)}`,
    )
    if (ok) rep.shortcuts[level]++
    else rep.shortcuts.skipped++
  }

  // 3. Largest connected component only.
  const parent = nodes.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  for (const e of edges) parent[find(e.a)] = find(e.b)
  const size = new Map<number, number>()
  for (const e of edges) size.set(find(e.a), (size.get(find(e.a)) ?? 0) + 1)
  const main = [...size.entries()].sort((x, y) => y[1] - x[1])[0][0]
  const groups = new Map<number, E[]>()
  for (const e of edges) groups.set(find(e.a), [...(groups.get(find(e.a)) ?? []), e])
  const islands: BuildReport['islands'] = []
  const droppedEdges: BuildReport['droppedEdges'] = []
  for (const [root, es] of groups) {
    if (root === main) continue
    const pts = es.flatMap((e) => e.pts)
    islands.push({
      nodes: new Set(es.flatMap((e) => [e.a, e.b])).size,
      km: es.reduce((s, e) => s + lineLen(e.pts), 0) / 1000,
      at: { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length },
    })
    droppedEdges.push(...es.map((e) => ({ pts: e.pts })))
  }
  edges = groups.get(main)!

  // 4. Stops and place entrances, each joined to the main network by a short connector.
  const connect = (id: string, at: LatLon, kind: string, out: Map<string, number>, limit: number) => {
    const s = snap(at, 400)
    if (!s) throw new Error(`${kind} ${id} has no walkable way within 400 m`)
    if (s.d > limit) warn(`${kind} ${id} is ${s.d.toFixed(0)} m from the nearest path`)
    if (s.d <= NODE_SNAP_M) return out.set(id, s.node)
    const n = nodes.push(at) - 1
    edges.push({ a: s.node, b: n, pts: [nodes[s.node], at], kind: 'footway', stepFree: true })
    out.set(id, n)
  }
  const stopNode = new Map<string, number>()
  for (const s of inp.stops) connect(s.id, s.location, 'stop', stopNode, 60)
  const doorNode = new Map<string, number>()
  for (const d of inp.entrances) connect(d.id, d.location, 'entrance', doorNode, 80)

  // 5. Renumber, climb, landmarks, simplify.
  const used = new Map<number, number>()
  const outNodes: GraphInput['nodes'] = []
  const idx = (n: number) => {
    let i = used.get(n)
    if (i === undefined) {
      used.set(n, (i = outNodes.length))
      outNodes.push({ lat: r6(nodes[n].lat), lon: r6(nodes[n].lon) })
    }
    return i
  }
  const outEdges: GraphInput['edges'] = edges.map((e) => {
    const [up, down] = climbOf(e.pts, height, e.grade === true)
    const inner = simplify(e.pts, SIMPLIFY_M).slice(1, -1).map((p) => ({ lat: r6(p.lat), lon: r6(p.lon) }))
    return {
      from: idx(e.a),
      to: idx(e.b),
      lengthM: r1(lineLen(e.pts)),
      ...(up ? { climbUpM: up } : {}),
      ...(down ? { climbDownM: down } : {}),
      kind: e.kind,
      ...(e.sheltered ? { sheltered: true } : {}),
      ...(e.stepFree ? { stepFree: true } : {}),
      ...(e.likely ? { likely: true } : {}),
      ...(e.indoor ? { indoor: true } : {}),
      ...(e.hours ? { hours: e.hours } : {}),
      ...(e.name ? { name: e.name } : {}),
      ...(inner.length ? { geometry: inner } : {}),
    }
  })
  for (const m of [stopNode, doorNode]) for (const [k, v] of m) m.set(k, idx(v))
  const degree = new Uint32Array(outNodes.length)
  for (const e of outEdges) { degree[e.from]++; degree[e.to]++ }
  outNodes.forEach((n, i) => {
    if (degree[i] < 3) return
    let best = 40
    for (const [lat, lon, name] of inp.landmarks) {
      const d = dist(n, { lat, lon })
      if (d < best) [best, n.name] = [d, name]
    }
  })

  const report: BuildReport = { warnings, islands, droppedEdges, stopNode, doorNode, gaps, ...rep }
  return { input: { nodes: outNodes, edges: outEdges }, report }
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as T
const readFeatures = (file: string): Feature[] => (existsSync(join(ROOT, file)) ? readJson<{ features: Feature[] }>(file).features : [])

export function loadInputs(): { inputs: BuildInputs; warnings: string[] } {
  const warnings: string[] = []
  const placesFile = 'public/data/places.json'
  let entrances: BuildInputs['entrances'] = []
  if (existsSync(join(ROOT, placesFile))) {
    const seen = new Set<string>()
    for (const p of readJson<{ id: string; entrances?: LatLon[] }[]>(placesFile))
      (p.entrances ?? []).forEach((location, i) => {
        const k = `${location.lat.toFixed(5)},${location.lon.toFixed(5)}`
        if (!seen.has(k)) entrances.push({ id: `${p.id}#${i}`, location })
        seen.add(k)
      })
  } else {
    entrances = []
    warnings.push(`${placesFile} not found: place entrances are not connected (run the places build first)`)
  }
  const indoorDir = join(ROOT, 'data/overrides/indoor')
  const indoor = existsSync(indoorDir)
    ? readdirSync(indoorDir).filter((f) => f.endsWith('.geojson')).sort().flatMap((f) => readFeatures(`data/overrides/indoor/${f}`))
    : []
  const inputs: BuildInputs = {
    ways: readFeatures('data/osm/walk-ways.geojson'),
    dem: readJson('data/osm/dem-grid.json'),
    landmarks: readJson('data/osm/landmarks.json'),
    stops: (parse(readFileSync(join(ROOT, 'data/transit/stops.yaml'), 'utf8')) as { stops: BuildInputs['stops'] }).stops,
    entrances,
    shortcuts: readFeatures('data/shortcuts/scored.geojson'),
    indoor,
    obstacles: readFeatures('data/osm/obstacles.geojson'),
  }
  return { inputs, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { inputs, warnings } = loadInputs()
  const { input, report } = buildGraph(inputs)
  const buf = encodeGraph(input)
  const out = join(ROOT, 'public/data/graph.bin')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(buf))
  const gz = gzipSync(Buffer.from(buf)).length
  const byKind: Record<string, { n: number; km: number }> = {}
  for (const e of input.edges) {
    const k = (byKind[e.kind] ??= { n: 0, km: 0 })
    k.n++
    k.km += e.lengthM / 1000
  }
  const km = Object.values(byKind).reduce((s, k) => s + k.km, 0)
  const reportFile = join(ROOT, 'data/raw/reports/graph.html')
  mkdirSync(dirname(reportFile), { recursive: true })
  writeFileSync(reportFile, graphReport(input, report, inputs.stops))
  for (const w of [...warnings, ...report.warnings]) console.warn(`warning: ${w}`)
  console.log(`wrote ${out}: ${(buf.byteLength / 1024).toFixed(1)} KB, ${(gz / 1024).toFixed(1)} KB gzip`)
  console.log(`nodes ${input.nodes.length}, edges ${input.edges.length}, ${km.toFixed(1)} km`)
  console.log('by kind:', Object.entries(byKind).map(([k, v]) => `${k} ${v.n} (${v.km.toFixed(1)} km)`).join(', '))
  console.log(`stops ${report.stopNode.size}, place entrances ${report.doorNode.size}, doors ${report.doors}, indoor links ${report.indoorEdges}, shortcuts`, report.shortcuts)
  console.log(`gaps closed: ${report.gaps.length}, lengths m`, report.gaps.map((g) => g.lengthM).sort((a, b) => a - b).join(' '))
  console.log(`islands dropped: ${report.islands.length}`, report.islands.slice(0, 5).map((i) => `${i.nodes} nodes ${i.km.toFixed(2)} km at ${i.at.lat.toFixed(4)},${i.at.lon.toFixed(4)}`))
  console.log(`report: ${reportFile}`)
  if (gz > 300 * 1024) throw new Error(`graph.bin is ${(gz / 1024).toFixed(0)} KB gzip, over the 300 KB limit`)
}
