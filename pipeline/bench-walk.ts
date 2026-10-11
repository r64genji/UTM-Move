// Walk router micro-benchmark. Run: npm run bench:walk
// Synthetic 100 x 100 grid: 10k nodes, ~20k edges, 10 m apart, random climb, kinds and hours.
import { gzipSync } from 'node:zlib'
import { EDGE_KINDS, decodeGraph, encodeGraph, type GraphInputEdge } from '../src/domain/walk/graph.ts'
import { route, walkTimes } from '../src/domain/walk/router.ts'
import { snapToEdge } from '../src/domain/walk/snap.ts'

const N = 100
let seed = 1
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const nodes = Array.from({ length: N * N }, (_, i) => ({ lat: 1.55 + Math.floor(i / N) * 9e-5, lon: 103.62 + (i % N) * 9e-5 }))
const edges: GraphInputEdge[] = []
for (let i = 0; i < N * N; i++) {
  for (const j of [i % N < N - 1 ? i + 1 : -1, i + N < N * N ? i + N : -1]) {
    if (j < 0) continue
    const r = rand()
    edges.push({
      from: i, to: j, lengthM: 10, climbUpM: rand() * 1.5, climbDownM: rand() * 1.5,
      kind: EDGE_KINDS[Math.floor(r * 8)], sheltered: r < 0.3, stepFree: r < 0.9, likely: r > 0.97,
      hours: r < 0.05 ? [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '08:00', close: '18:00' }] : undefined,
      name: r < 0.05 ? `Block ${i % 50}` : undefined,
    })
  }
}

function time(label: string, runs: number, fn: () => unknown) {
  fn() // warm up
  const t0 = performance.now()
  for (let i = 0; i < runs; i++) fn()
  console.log(`${label.padEnd(44)} ${((performance.now() - t0) / runs).toFixed(3)} ms`)
}

let buf = new ArrayBuffer(0)
time('encodeGraph', 5, () => (buf = encodeGraph({ nodes, edges })))
const g = decodeGraph(buf)
console.log(`graph: ${g.nodeCount} nodes, ${g.edgeCount} edges, ${buf.byteLength} bytes, ${gzipSync(new Uint8Array(buf)).byteLength} gzip`)
const at = new Date('2026-10-12T02:00:00Z') // Monday 10:00 in KL
const stops = Array.from({ length: 60 }, (_, k) => (k * 163) % (N * N))

time('decodeGraph', 50, () => decodeGraph(buf))
time('snap index build (first snap on a new graph)', 1, () => snapToEdge(decodeGraph(buf), { lat: 1.553, lon: 103.623 }))
for (const profile of ['fastest', 'sheltered', 'no-stairs'] as const) {
  time(`route corner to corner (${profile})`, 20, () => route(g, 0, N * N - 1, { profile, at }))
}
time('walkTimes to 60 stops, 15 min cap', 20, () => walkTimes(g, 5050, stops, { profile: 'fastest', at, maxTimeS: 900 }))
time('snapToEdge', 1000, () => snapToEdge(g, { lat: 1.55 + rand() * 0.009, lon: 103.62 + rand() * 0.009 }))
