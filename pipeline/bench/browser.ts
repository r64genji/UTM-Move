// Router benchmark in Chrome through the real worker, CPU throttled 4x (mid-range phone).
// Run: npm run bench:router:browser
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { TransitData } from '../../src/domain/schemas.ts'
import { decodeGraph } from '../../src/domain/walk/graph.ts'
import { makeQueries, percentiles } from './queries.ts'

const buf = readFileSync('public/data/graph.bin')
const graph = decodeGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const transit = TransitData.parse(JSON.parse(readFileSync('public/data/transit.json', 'utf8')))
const queries = makeQueries(graph, transit)

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:5199/pipeline/bench/router.html')
  await page.waitForFunction('window.ready')
  const cdp = await page.context().newCDPSession(page)
  type Win = { runQuery(q: unknown): Promise<unknown>; runDirect(q: unknown): Promise<unknown> }
  const timeWith = (fn: 'runQuery' | 'runDirect', q: unknown) => page.evaluate(async ([fn, q]) => {
    const t = performance.now()
    await (globalThis as unknown as Win)[fn as 'runQuery'](q)
    return performance.now() - t
  }, [fn, q] as const)
  // CDP cannot throttle a dedicated worker ("only supported for pages"), so the 4x figure comes from
  // running the same planQuery on the throttled main thread. The worker run is unthrottled, for the
  // postMessage round trip.
  for (const [label, fn] of [['worker, unthrottled', 'runQuery'], ['main thread, 4x CPU throttle', 'runDirect']] as const) {
    if (fn === 'runDirect') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const t0 = Date.now()
    for (const profile of ['fastest', 'sheltered', 'no-stairs'] as const) await timeWith(fn, { ...queries[0], profile })
    const warm = Date.now() - t0
    const ms: number[] = []
    for (const q of queries) ms.push(await timeWith(fn, q))
    const { p50, p95, max } = percentiles(ms)
    console.log(`${label}: ${ms.length} trips, p50 ${p50.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms  max ${max.toFixed(1)} ms (first-load + warm-up ${warm} ms, excluded)`)
  }
} finally {
  await browser.close()
  await server.close()
}
