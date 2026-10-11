// Router benchmark in Node. Run: npm run bench:router  (needs npm run build:transit && build:graph)
import { readFileSync } from 'node:fs'
import { TransitData } from '../src/domain/schemas.ts'
import { decodeGraph } from '../src/domain/walk/graph.ts'
import { planQuery } from '../src/workers/routerApi.ts'
import { makeQueries, percentiles } from './bench/queries.ts'

const buf = readFileSync('public/data/graph.bin')
const graph = decodeGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const transit = TransitData.parse(JSON.parse(readFileSync('public/data/transit.json', 'utf8')))
const data = { graph, transit, places: [] }
const queries = makeQueries(graph, transit)

// First-load: one query per profile builds the snap index and stop caches.
const t0 = performance.now()
for (const profile of ['fastest', 'sheltered', 'no-stairs'] as const) planQuery(data, { ...queries[0], profile })
console.log(`warm-up (3 profiles): ${(performance.now() - t0).toFixed(0)} ms`)

const ms = queries.map((q) => {
  const t = performance.now()
  planQuery(data, q)
  return performance.now() - t
})
const { p50, p95, max } = percentiles(ms)
console.log(`node, ${ms.length} trips: p50 ${p50.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms  max ${max.toFixed(1)} ms`)
