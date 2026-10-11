// Grid scrape of campus places with the self-hosted gosom Google Maps scraper.
// Usage: npm run scrape:places   (GOSOM_URL defaults to http://localhost:8085)
//
// One gosom job per grid point (~300 m apart, inside the UTM polygon). Raw CSV
// per point goes to data/raw/gosom/<lat>_<lon>.csv. Re-running skips points that
// already have a CSV and resumes polling jobs that were submitted but not
// downloaded (data/raw/gosom/<lat>_<lon>.job).
//
// The running image is the unpatched gosom: fast mode drops `category` and
// `place_id`, so we use normal mode (depth 1, 20 results per keyword).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import type { LatLon } from '../../src/domain/schemas.ts'
import { inRing, loadBoundary } from './geo.ts'

const BASE = (process.env.GOSOM_URL || 'http://localhost:8085').replace(/\/$/, '')
const OUT = 'data/raw/gosom'
const STEP_M = 300
const CONCURRENCY = Number(process.env.GOSOM_CONCURRENCY || 2)

export const KEYWORDS = [
  'fakulti', 'faculty', 'kolej', 'college', 'blok', 'dewan', 'hall', 'makmal', 'laboratory',
  'perpustakaan', 'library', 'surau', 'masjid', 'kafe', 'kafeteria', 'restoran', 'ATM', 'bank',
  'klinik', 'pejabat', 'office', 'stadium', 'gelanggang', 'sports', 'parking', 'hostel',
  'kedai', 'pusat', 'auditorium', 'bus stop', 'pintu masuk', 'school', 'UTM',
]

// RFC4180-ish CSV parser (quoted fields, embedded commas/newlines, "" escapes).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let started = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') { inQuotes = true; started = true }
    else if (c === ',') { row.push(field); field = ''; started = true }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      if (started || field !== '' || row.length) { row.push(field); rows.push(row) }
      row = []; field = ''; started = false
    } else { field += c; started = true }
  }
  if (started || field !== '' || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const header = rows[0]
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

/** Grid points about every STEP_M metres inside the polygon, coarse points first. */
export function gridPoints(ring: LatLon[], stepM = STEP_M): LatLon[] {
  const lats = ring.map((p) => p.lat), lons = ring.map((p) => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const dLat = stepM / 110574
  const dLon = stepM / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180))
  const pts: { p: LatLon; coarse: boolean }[] = []
  for (let i = 0, lat = minLat + dLat / 2; lat < maxLat; i++, lat += dLat) {
    for (let j = 0, lon = minLon + dLon / 2; lon < maxLon; j++, lon += dLon) {
      const p = { lat: +lat.toFixed(5), lon: +lon.toFixed(5) }
      if (inRing(p, ring)) pts.push({ p, coarse: i % 2 === 0 && j % 2 === 0 })
    }
  }
  return [...pts.filter((x) => x.coarse), ...pts.filter((x) => !x.coarse)].map((x) => x.p)
}

const key = (p: LatLon) => `${p.lat.toFixed(5)}_${p.lon.toFixed(5)}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function submit(p: LatLon): Promise<string> {
  const body = {
    name: `utm-move-${key(p)}`, keywords: KEYWORDS, lang: 'en', zoom: 18,
    lat: String(p.lat), lon: String(p.lon), radius: 400, fast_mode: false, depth: 1, max_time: 3600,
  }
  const res = await fetch(`${BASE}/api/v1/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`gosom submit failed: ${res.status} ${await res.text()}`)
  const { id } = (await res.json()) as { id?: string }
  if (!id) throw new Error('gosom submit returned no job id')
  return id
}

async function waitAndDownload(id: string): Promise<string> {
  for (;;) {
    await sleep(20_000)
    const st = await fetch(`${BASE}/api/v1/jobs/${id}`)
    if (st.status === 404) throw new Error(`gosom job ${id} vanished`)
    if (!st.ok) continue
    const status = String(((await st.json()) as { Status?: string }).Status || '').toLowerCase()
    if (status === 'ok') break
    if (status === 'failed' || status === 'error') throw new Error(`gosom job ${id} failed`)
  }
  const dl = await fetch(`${BASE}/api/v1/jobs/${id}/download`)
  if (!dl.ok) throw new Error(`gosom download failed: ${dl.status}`)
  return dl.text()
}

async function scrapePoint(p: LatLon, n: number, total: number): Promise<void> {
  const csv = `${OUT}/${key(p)}.csv`, job = `${OUT}/${key(p)}.job`
  if (existsSync(csv)) return
  const id = existsSync(job) ? readFileSync(job, 'utf8').trim() : await submit(p)
  writeFileSync(job, id)
  const t0 = Date.now()
  try {
    writeFileSync(csv, await waitAndDownload(id))
    unlinkSync(job)
  } catch (e) {
    if (String(e).includes('vanished')) unlinkSync(job)
    throw e
  }
  console.log(`[${n}/${total}] ${key(p)} done in ${Math.round((Date.now() - t0) / 1000)} s`)
}

/** All scraped rows, deduped by place_id (first seen wins). */
export function readScraped(dir = OUT): Record<string, string>[] {
  const byId = new Map<string, Record<string, string>>()
  if (!existsSync(dir)) return []
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.csv')).sort()) {
    for (const r of parseCsv(readFileSync(`${dir}/${f}`, 'utf8'))) {
      const id = r.place_id || r.data_id
      if (id && !byId.has(id)) byId.set(id, r)
    }
  }
  return [...byId.values()]
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const ring = loadBoundary()
  const points = gridPoints(ring)
  const todo = points.filter((p) => !existsSync(`${OUT}/${key(p)}.csv`))
  console.log(`grid points: ${points.length}, cached: ${points.length - todo.length}, to run: ${todo.length}, keywords/job: ${KEYWORDS.length}`)
  let next = 0, failed = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const i = next++
      try { await scrapePoint(todo[i], points.length - todo.length + i + 1, points.length) }
      catch (e) { failed++; console.error(`point ${key(todo[i])}: ${e}`) }
    }
  }))
  const rows = readScraped()
  const inside = rows.filter((r) => inRing({ lat: Number(r.latitude), lon: Number(r.longitude) }, ring))
  console.log(`points: ${points.length}  jobs: ${points.length - failed}  failed: ${failed}  places found: ${rows.length}  inside boundary: ${inside.length}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
