// Walk routing on graph.bin: profiles, Dijkstra (one-to-one and one-to-many), and path -> leg.
import type { LatLon } from '../schemas.ts'
import {
  EDGE_KINDS,
  FLAG_INDOOR,
  FLAG_LIKELY,
  FLAG_SHELTERED,
  FLAG_STEP_FREE,
  NONE,
  edgeCoords,
  type Graph,
} from './graph.ts'
import { slice } from './geo.ts'
import { openUntil } from './hours.ts'
import type { EdgeSnap } from './snap.ts'
import { buildSteps, type Step, type StepEdge } from './steps.ts'

export type Profile = 'fastest' | 'sheltered' | 'no-stairs'

export interface WalkOptions {
  profile: Profile
  /** Trip time. Edges with opening hours are skipped when closed (Asia/Kuala_Lumpur). */
  at: Date
  /** Flat-ground walking speed. Default 1.4 m/s (5 km/h). */
  speedMps?: number
}

/** A place to start or end: a graph node, or a point projected onto an edge. */
export type Endpoint = number | EdgeSnap

/** Part of one edge. f0 -> f1 are fractions of the edge measured from edgeFrom (f0 > f1 walks it backwards). */
export interface Piece {
  edge: number
  dir: 0 | 1
  f0: number
  f1: number
}

export interface WalkPath {
  /** Graph nodes passed, in order (snapped end points are not nodes). */
  nodes: number[]
  pieces: Piece[]
  costS: number
  timeS: number
  distanceM: number
}

export const LIKELY_FACTOR = 1.2
export const OPEN_AIR_FACTOR = 3
const KIND_STEPS = EDGE_KINDS.indexOf('steps')
const KIND_DOOR = EDGE_KINDS.indexOf('door')

/** Tobler's hiking function, scaled so flat ground walks at v0. */
const tobler = (grade: number, v0: number) => v0 * Math.exp(-3.5 * Math.abs(grade + 0.05) + 3.5 * 0.05)

/** Seconds to walk `len` metres that climb `up` and descend `down`, assuming one steady grade. */
export function walkTimeS(len: number, up: number, down: number, v0: number): number {
  const climb = up + down
  if (len <= 0) return 0
  if (climb <= 0) return len / v0
  const grade = climb / len
  const lenUp = (len * up) / climb
  return lenUp / tobler(grade, v0) + (len - lenUp) / tobler(-grade, v0)
}

interface Weights {
  /** Indexed by adjacency entry `edge * 2 + dir`. */
  cost: Float64Array
  time: Float64Array
}

function weights(g: Graph, o: WalkOptions): Weights {
  const v0 = o.speedMps ?? 1.4
  const open = g.hours.map((h) => openUntil(h, o.at) !== null)
  const cost = new Float64Array(g.edgeCount * 2)
  const time = new Float64Array(g.edgeCount * 2)
  for (let e = 0; e < g.edgeCount; e++) {
    const len = g.edgeLength[e]
    const up = g.edgeClimbUp[e]
    const down = g.edgeClimbDown[e]
    const flags = g.edgeFlags[e]
    const kind = g.edgeKind[e]
    time[2 * e] = walkTimeS(len, up, down, v0)
    time[2 * e + 1] = walkTimeS(len, down, up, v0)
    let factor = flags & FLAG_LIKELY ? LIKELY_FACTOR : 1
    if (o.profile === 'sheltered' && !(flags & (FLAG_SHELTERED | FLAG_INDOOR))) factor *= OPEN_AIR_FACTOR
    const closed = g.edgeHours[e] !== NONE && !open[g.edgeHours[e]]
    const stairs = o.profile === 'no-stairs' && (kind === KIND_STEPS || (kind === KIND_DOOR && !(flags & FLAG_STEP_FREE)))
    if (closed || stairs) factor = Infinity
    cost[2 * e] = time[2 * e] * factor
    cost[2 * e + 1] = time[2 * e + 1] * factor
  }
  return { cost, time }
}

class MinHeap {
  keys = new Float64Array(64)
  vals = new Int32Array(64)
  size = 0
  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2); k.set(this.keys); this.keys = k
      const v = new Int32Array(this.size * 2); v.set(this.vals); this.vals = v
    }
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= key) break
      this.keys[i] = this.keys[p]; this.vals[i] = this.vals[p]; i = p
    }
    this.keys[i] = key; this.vals[i] = val
  }
  /** Removes the smallest item and returns its value; its key is in `lastKey`. */
  lastKey = 0
  pop(): number {
    const top = this.vals[0]
    this.lastKey = this.keys[0]
    const key = this.keys[--this.size]
    const val = this.vals[this.size]
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++
      if (this.keys[c] >= key) break
      this.keys[i] = this.keys[c]; this.vals[i] = this.vals[c]; i = c
    }
    this.keys[i] = key; this.vals[i] = val
    return top
  }
}

interface Seed { node: number; cost: number; time: number }

interface Tree {
  cost: Float64Array
  time: Float64Array
  /** Adjacency entry used to reach each node (-1: a seed or unreached). */
  via: Int32Array
}

/**
 * Dijkstra from the seeds. `reverse` searches toward the seeds (costs of walking each edge the other way).
 * Nodes whose walk time passes maxTimeS are not expanded. `stop(node, cost)` ends the search early.
 */
function dijkstra(
  g: Graph, w: Weights, seeds: Seed[],
  opt: { reverse?: boolean; maxTimeS?: number; stop?: (node: number, cost: number) => boolean } = {},
): Tree {
  const cost = new Float64Array(g.nodeCount).fill(Infinity)
  const time = new Float64Array(g.nodeCount).fill(Infinity)
  const via = new Int32Array(g.nodeCount).fill(-1)
  const done = new Uint8Array(g.nodeCount)
  const heap = new MinHeap()
  const flip = opt.reverse ? 1 : 0
  const maxTime = opt.maxTimeS ?? Infinity
  for (const s of seeds) {
    if (s.cost < cost[s.node] && s.time <= maxTime) {
      cost[s.node] = s.cost; time[s.node] = s.time; via[s.node] = -1
      heap.push(s.cost, s.node)
    }
  }
  while (heap.size) {
    const u = heap.pop()
    if (done[u]) continue
    done[u] = 1
    if (opt.stop?.(u, heap.lastKey)) break
    for (let i = g.adjStart[u]; i < g.adjStart[u + 1]; i++) {
      const a = g.adj[i] ^ flip
      const c = cost[u] + w.cost[a]
      const e = g.adj[i] >> 1
      const v = g.adj[i] & 1 ? g.edgeFrom[e] : g.edgeTo[e]
      if (c < cost[v]) {
        const t = time[u] + w.time[a]
        if (t > maxTime) continue
        cost[v] = c; time[v] = t; via[v] = g.adj[i]
        heap.push(c, v)
      }
    }
  }
  return { cost, time, via }
}

/** Seeds for leaving an endpoint, or (asTarget) the extra cost from each node to reach it. */
function seeds(g: Graph, w: Weights, p: Endpoint, asTarget: boolean): Seed[] {
  if (typeof p === 'number') return [{ node: p, cost: 0, time: 0 }]
  const fwd = 2 * p.edge
  const back = fwd + 1
  // Leaving the point: toward edgeFrom walks backwards for t, toward edgeTo walks forwards for 1 - t.
  // Arriving at it: from edgeFrom walks forwards for t, from edgeTo walks backwards for 1 - t.
  const toFrom = asTarget ? fwd : back
  const toTo = asTarget ? back : fwd
  return [
    { node: g.edgeFrom[p.edge], cost: p.t * w.cost[toFrom], time: p.t * w.time[toFrom] },
    { node: g.edgeTo[p.edge], cost: (1 - p.t) * w.cost[toTo], time: (1 - p.t) * w.time[toTo] },
  ].filter((s) => Number.isFinite(s.cost))
}

const pieceTime = (w: Weights, p: Piece) => Math.abs(p.f1 - p.f0) * w.time[2 * p.edge + p.dir]
const pieceCost = (w: Weights, p: Piece) => (p.f1 === p.f0 ? 0 : Math.abs(p.f1 - p.f0) * w.cost[2 * p.edge + p.dir])

function finish(g: Graph, w: Weights, pieces: Piece[], nodes: number[]): WalkPath {
  pieces = pieces.filter((p) => p.f0 !== p.f1)
  let costS = 0, timeS = 0, distanceM = 0
  for (const p of pieces) {
    costS += pieceCost(w, p)
    timeS += pieceTime(w, p)
    distanceM += Math.abs(p.f1 - p.f0) * g.edgeLength[p.edge]
  }
  return { nodes, pieces, costS, timeS, distanceM }
}

/** Best path for the profile, or null if none (all routes closed or removed). */
export function route(g: Graph, from: Endpoint, to: Endpoint, o: WalkOptions): WalkPath | null {
  const w = weights(g, o)
  const ends = seeds(g, w, to, true)
  let best = Infinity
  let bestEnd = -1
  const tree = dijkstra(g, w, seeds(g, w, from, false), {
    stop: (u, c) => {
      if (c >= best) return true
      ends.forEach((s, i) => {
        if (s.node === u && c + s.cost < best) [best, bestEnd] = [c + s.cost, i]
      })
      return false
    },
  })

  // Both points on the same edge: walking straight along it may win.
  if (typeof from !== 'number' && typeof to !== 'number' && from.edge === to.edge && from.t !== to.t) {
    const direct: Piece = { edge: from.edge, dir: to.t > from.t ? 0 : 1, f0: from.t, f1: to.t }
    if (pieceCost(w, direct) <= best) return finish(g, w, [direct], [])
  }
  if (bestEnd < 0) return null

  const end = ends[bestEnd].node
  const nodes = [end]
  const pieces: Piece[] = []
  for (let v = end; tree.via[v] >= 0; ) {
    const a = tree.via[v]
    const e = a >> 1
    const dir = (a & 1) as 0 | 1
    pieces.unshift({ edge: e, dir, f0: dir ? 1 : 0, f1: dir ? 0 : 1 })
    v = dir ? g.edgeTo[e] : g.edgeFrom[e]
    nodes.unshift(v)
  }
  if (typeof from !== 'number') {
    const start = nodes[0]
    const f1 = start === g.edgeFrom[from.edge] ? 0 : 1
    pieces.unshift({ edge: from.edge, dir: f1 === 0 ? 1 : 0, f0: from.t, f1 })
  }
  if (typeof to !== 'number') {
    const f0 = end === g.edgeFrom[to.edge] ? 0 : 1
    pieces.push({ edge: to.edge, dir: f0 === 0 ? 0 : 1, f0, f1: to.t })
  }
  return finish(g, w, pieces, nodes)
}

/**
 * Walk time (seconds) from `source` to each target node, or Infinity past maxTimeS.
 * With `reverse`, it is the time from each target to `source` (egress to a destination).
 */
export function walkTimes(
  g: Graph, source: Endpoint, targets: ArrayLike<number>,
  o: WalkOptions & { maxTimeS: number; reverse?: boolean },
): Float64Array {
  const w = weights(g, o)
  const tree = dijkstra(g, w, seeds(g, w, source, !!o.reverse), { reverse: o.reverse, maxTimeS: o.maxTimeS })
  return Float64Array.from(targets, (n) => tree.time[n])
}

export interface WalkLeg {
  nodes: number[]
  coords: LatLon[]
  distanceM: number
  timeS: number
  /** Runs of the line that need a note. from/to index into coords. */
  labels: { text: string; from: number; to: number }[]
  steps: Step[]
}

/** Note for one edge: indoor and open hours, covered, unverified shortcut. Null when nothing to say. */
export function edgeLabel(g: Graph, e: number, at: Date): string | null {
  const parts: string[] = []
  const flags = g.edgeFlags[e]
  const name = g.edgeName[e] === NONE ? undefined : g.strings[g.edgeName[e]]
  const until = g.edgeHours[e] === NONE ? null : openUntil(g.hours[g.edgeHours[e]], at)
  if (until) parts.push(name ? `Through ${name}, open until ${until}` : `Open until ${until}`)
  else if (flags & FLAG_INDOOR && name) parts.push(`Through ${name}`)
  else if (flags & FLAG_SHELTERED || EDGE_KINDS[g.edgeKind[e]] === 'covered') parts.push('Covered walkway')
  if (flags & FLAG_LIKELY) parts.push('Shortcut, unverified')
  return parts.length ? parts.join('; ') : null
}

/** Geometry, notes and turn-by-turn steps for a path. */
export function pathToLeg(g: Graph, path: WalkPath, at: Date, destination?: string): WalkLeg {
  const coords: LatLon[] = []
  const labels: WalkLeg['labels'] = []
  const stepEdges: StepEdge[] = []
  for (const p of path.pieces) {
    const line = slice(edgeCoords(g, p.edge, 0), p.f0, p.f1)
    const start = coords.length ? coords.length - 1 : 0
    coords.push(...(coords.length ? line.slice(1) : line))
    const text = edgeLabel(g, p.edge, at)
    const last = labels[labels.length - 1]
    if (text && last?.text === text && last.to === start) last.to = coords.length - 1
    else if (text) labels.push({ text, from: start, to: coords.length - 1 })
    const endNode = p.f1 === 0 ? g.edgeFrom[p.edge] : p.f1 === 1 ? g.edgeTo[p.edge] : -1
    stepEdges.push({
      coords: line,
      lengthM: Math.abs(p.f1 - p.f0) * g.edgeLength[p.edge],
      kind: EDGE_KINDS[g.edgeKind[p.edge]],
      name: g.edgeName[p.edge] === NONE ? undefined : g.strings[g.edgeName[p.edge]],
      endName: endNode >= 0 && g.nodeName[endNode] !== NONE ? g.strings[g.nodeName[endNode]] : undefined,
    })
  }
  return {
    nodes: path.nodes,
    coords,
    distanceM: path.distanceM,
    timeS: path.timeS,
    labels,
    steps: buildSteps(stepEdges, destination),
  }
}
