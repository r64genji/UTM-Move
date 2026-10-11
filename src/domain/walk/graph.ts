// graph.bin: the walk graph as one little-endian binary file. Spec: docs/v2/graph-format.md.
// The pipeline (#18) builds a GraphInput and calls encodeGraph. The app calls decodeGraph.
import type { LatLon, OpeningHours } from '../schemas.ts'

export const GRAPH_MAGIC = 0x574d5455 // bytes 'UTMW'
export const GRAPH_VERSION = 1
const HEADER_BYTES = 32
const SCALE = 1e7 // degrees -> int32 fixed point (about 1 cm)
export const NONE = 0xffff // "no hours" / "no name" in Uint16 index columns

/** Order is part of the file format. Only append. */
export const EDGE_KINDS = [
  'road',
  'footway',
  'path',
  'steps',
  'covered',
  'indoor',
  'shortcut',
  'door',
  'crossing',
  'ramp',
] as const
export type EdgeKind = (typeof EDGE_KINDS)[number]

export const FLAG_SHELTERED = 1
export const FLAG_STEP_FREE = 2
export const FLAG_LIKELY = 4
export const FLAG_INDOOR = 8

export interface GraphInputNode {
  lat: number
  lon: number
  /** Landmark used by turn instructions ('Turn left after FKE P05'). */
  name?: string
}

export interface GraphInputEdge {
  from: number
  to: number
  lengthM: number
  /** Metres climbed going from -> to. Going to -> from, up and down swap. */
  climbUpM?: number
  climbDownM?: number
  kind: EdgeKind
  sheltered?: boolean
  stepFree?: boolean
  /** Shortcut tier 'likely' (verified edges leave this false; guess edges are never emitted). */
  likely?: boolean
  indoor?: boolean
  /** Edge is closed outside these hours (Asia/Kuala_Lumpur). */
  hours?: OpeningHours
  /** Building or landmark name, e.g. the building an indoor edge goes through. */
  name?: string
  /** Points between `from` and `to`, in from -> to order. Endpoints are not repeated. */
  geometry?: LatLon[]
}

export interface GraphInput {
  nodes: GraphInputNode[]
  edges: GraphInputEdge[]
}

export interface Graph {
  nodeCount: number
  edgeCount: number
  nodeLat: Int32Array
  nodeLon: Int32Array
  nodeName: Uint16Array
  /** CSR: entries of node n are adj[adjStart[n] .. adjStart[n+1]). */
  adjStart: Uint32Array
  /** Each entry is `edge * 2 + dir`; dir 0 walks from -> to, dir 1 walks to -> from. */
  adj: Uint32Array
  edgeFrom: Uint32Array
  edgeTo: Uint32Array
  edgeLength: Float32Array
  edgeClimbUp: Float32Array
  edgeClimbDown: Float32Array
  edgeKind: Uint8Array
  edgeFlags: Uint8Array
  edgeHours: Uint16Array
  edgeName: Uint16Array
  /** Intermediate points of edge e are geomLat/geomLon[geomStart[e] .. geomStart[e+1]). */
  geomStart: Uint32Array
  geomLat: Int32Array
  geomLon: Int32Array
  strings: string[]
  hours: OpeningHours[]
}

export const toDeg = (fixed: number) => fixed / SCALE
const toFixed = (deg: number) => Math.round(deg * SCALE)

export function nodeLatLon(g: Graph, n: number): LatLon {
  return { lat: toDeg(g.nodeLat[n]), lon: toDeg(g.nodeLon[n]) }
}

/** Full polyline of edge e in walking direction dir (0: from -> to). */
export function edgeCoords(g: Graph, e: number, dir: number): LatLon[] {
  const pts = [nodeLatLon(g, g.edgeFrom[e])]
  for (let i = g.geomStart[e]; i < g.geomStart[e + 1]; i++) {
    pts.push({ lat: toDeg(g.geomLat[i]), lon: toDeg(g.geomLon[i]) })
  }
  pts.push(nodeLatLon(g, g.edgeTo[e]))
  return dir === 0 ? pts : pts.reverse()
}

// Section layout, in file order. Each section starts on a 4-byte boundary.
type Column = Int32Array | Uint32Array | Float32Array | Uint16Array | Uint8Array
type Section = [key: keyof Graph, ctor: { new (n: number): Column; new (b: ArrayBuffer, off: number, n: number): Column }, length: (c: Counts) => number]
interface Counts { nodes: number; edges: number; geom: number }
const SECTIONS: Section[] = [
  ['nodeLat', Int32Array, (c) => c.nodes],
  ['nodeLon', Int32Array, (c) => c.nodes],
  ['adjStart', Uint32Array, (c) => c.nodes + 1],
  ['adj', Uint32Array, (c) => c.edges * 2],
  ['edgeFrom', Uint32Array, (c) => c.edges],
  ['edgeTo', Uint32Array, (c) => c.edges],
  ['edgeLength', Float32Array, (c) => c.edges],
  ['edgeClimbUp', Float32Array, (c) => c.edges],
  ['edgeClimbDown', Float32Array, (c) => c.edges],
  ['geomStart', Uint32Array, (c) => c.edges + 1],
  ['geomLat', Int32Array, (c) => c.geom],
  ['geomLon', Int32Array, (c) => c.geom],
  ['nodeName', Uint16Array, (c) => c.nodes],
  ['edgeHours', Uint16Array, (c) => c.edges],
  ['edgeName', Uint16Array, (c) => c.edges],
  ['edgeKind', Uint8Array, (c) => c.edges],
  ['edgeFlags', Uint8Array, (c) => c.edges],
]
const pad4 = (n: number) => (n + 3) & ~3

export function encodeGraph(input: GraphInput): ArrayBuffer {
  const { nodes, edges } = input
  const strings: string[] = []
  const stringIndex = new Map<string, number>()
  const intern = (s: string | undefined) => {
    if (s === undefined) return NONE
    let i = stringIndex.get(s)
    if (i === undefined) stringIndex.set(s, (i = strings.push(s) - 1))
    return i
  }
  const hours: OpeningHours[] = []
  const hoursIndex = new Map<string, number>()
  const internHours = (h: OpeningHours | undefined) => {
    if (h === undefined) return NONE
    const key = JSON.stringify(h)
    let i = hoursIndex.get(key)
    if (i === undefined) hoursIndex.set(key, (i = hours.push(h) - 1))
    return i
  }

  const c: Counts = { nodes: nodes.length, edges: edges.length, geom: 0 }
  for (const e of edges) c.geom += e.geometry?.length ?? 0
  const g = {} as Record<string, Column>
  for (const [key, Ctor, len] of SECTIONS) g[key] = new Ctor(len(c))

  nodes.forEach((n, i) => {
    g.nodeLat[i] = toFixed(n.lat)
    g.nodeLon[i] = toFixed(n.lon)
    g.nodeName[i] = intern(n.name)
  })
  const degree = new Uint32Array(c.nodes)
  let geom = 0
  edges.forEach((e, i) => {
    if (!(e.from < c.nodes && e.to < c.nodes)) throw new Error(`edge ${i} points to a missing node`)
    const kind = EDGE_KINDS.indexOf(e.kind)
    if (kind < 0) throw new Error(`edge ${i} has unknown kind ${e.kind}`)
    g.edgeFrom[i] = e.from
    g.edgeTo[i] = e.to
    g.edgeLength[i] = e.lengthM
    g.edgeClimbUp[i] = e.climbUpM ?? 0
    g.edgeClimbDown[i] = e.climbDownM ?? 0
    g.edgeKind[i] = kind
    g.edgeFlags[i] =
      (e.sheltered ? FLAG_SHELTERED : 0) | (e.stepFree ? FLAG_STEP_FREE : 0) | (e.likely ? FLAG_LIKELY : 0) | (e.indoor ? FLAG_INDOOR : 0)
    g.edgeHours[i] = internHours(e.hours)
    g.edgeName[i] = intern(e.name)
    g.geomStart[i] = geom
    for (const p of e.geometry ?? []) {
      g.geomLat[geom] = toFixed(p.lat)
      g.geomLon[geom++] = toFixed(p.lon)
    }
    degree[e.from]++
    degree[e.to]++
  })
  g.geomStart[c.edges] = geom
  if (strings.length >= NONE || hours.length >= NONE) throw new Error('too many names or hours for a Uint16 index')

  for (let n = 0; n < c.nodes; n++) g.adjStart[n + 1] = g.adjStart[n] + degree[n]
  const fill = g.adjStart.slice(0, c.nodes)
  edges.forEach((e, i) => {
    g.adj[fill[e.from]++] = i * 2
    g.adj[fill[e.to]++] = i * 2 + 1
  })

  const meta = new TextEncoder().encode(JSON.stringify({ strings, hours }))
  let size = HEADER_BYTES
  for (const [key] of SECTIONS) size += pad4(g[key].byteLength)
  size += meta.byteLength

  const buf = new ArrayBuffer(size)
  const head = new DataView(buf)
  head.setUint32(0, GRAPH_MAGIC, true)
  head.setUint16(4, GRAPH_VERSION, true)
  head.setUint32(8, c.nodes, true)
  head.setUint32(12, c.edges, true)
  head.setUint32(16, c.geom, true)
  head.setUint32(20, meta.byteLength, true)
  let off = HEADER_BYTES
  for (const [key] of SECTIONS) {
    const view = g[key]
    new Uint8Array(buf, off, view.byteLength).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    off += pad4(view.byteLength)
  }
  new Uint8Array(buf, off).set(meta)
  return buf
}

export function decodeGraph(buf: ArrayBuffer): Graph {
  const head = new DataView(buf)
  if (buf.byteLength < HEADER_BYTES || head.getUint32(0, true) !== GRAPH_MAGIC) throw new Error('not a graph.bin file')
  const version = head.getUint16(4, true)
  if (version !== GRAPH_VERSION) throw new Error(`graph.bin version ${version}, expected ${GRAPH_VERSION}`)
  const c: Counts = { nodes: head.getUint32(8, true), edges: head.getUint32(12, true), geom: head.getUint32(16, true) }
  const metaBytes = head.getUint32(20, true)
  const g = { nodeCount: c.nodes, edgeCount: c.edges } as Record<string, unknown>
  let off = HEADER_BYTES
  for (const [key, Ctor, len] of SECTIONS) {
    const arr = new Ctor(buf, off, len(c))
    g[key] = arr
    off += pad4(arr.byteLength)
  }
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off, metaBytes)))
  g.strings = meta.strings
  g.hours = meta.hours
  return g as unknown as Graph
}

export async function loadGraph(url: string): Promise<Graph> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`graph.bin: HTTP ${res.status}`)
  return decodeGraph(await res.arrayBuffer())
}
