// Satellite vision pass: Esri + Bing z19 tiles -> 3x3 mosaics -> Gemini -> missing-path candidates + evidence.
// Usage: tsx pipeline/vision/run.ts [--trial] [--source esri|bing] [--limit N]   (run from repo root)
// Gemini goes through OmniRoute only (OMNIROUTE_BASE_URL / OMNIROUTE_API_KEY from ~/.hermes/.env).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'
import { ShortcutKind, type LatLon } from '../../src/domain/schemas.ts'
import { addCandidate, appendEvidence } from '../shortcuts/store.ts'
import { lonLatToTile, pixelToLatLon, quadkey, TILE } from './geo.ts'

const Z = 19
const N = 3 // mosaic is N x N tiles
const MODEL = 'agy/gemini-3.8-flash-medium'
const UA = 'UTM-Move-research/1.0 (student project; abrahamtan99@gmail.com)'
type Source = 'esri' | 'bing'
const args = process.argv.slice(2)
const trial = args.includes('--trial')
const arg = (k: string) => args[args.indexOf(k) + 1]
const sources: Source[] = args.includes('--source') ? [arg('--source') as Source] : ['esri', 'bing']
const limit = args.includes('--limit') ? Number(arg('--limit')) : Infinity

// ---------- boundary -> mosaics ----------
const ring: number[][] = JSON.parse(readFileSync('data/campus-boundary.geojson', 'utf8')).features[0].geometry.coordinates[0]
function inside(lon: number, lat: number): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function tileInBoundary(x: number, y: number): boolean {
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const p = pixelToLatLon((i * TILE) / 4, (j * TILE) / 4, x, y, Z)
    if (inside(p.lon, p.lat)) return true
  }
  return false
}
function mosaics(): { x0: number; y0: number; full: boolean }[] {
  const xs = ring.map((p) => lonLatToTile({ lat: p[1], lon: p[0] }, Z))
  const [minX, maxX] = [Math.min(...xs.map((t) => t.x)), Math.max(...xs.map((t) => t.x))].map(Math.floor)
  const [minY, maxY] = [Math.min(...xs.map((t) => t.y)), Math.max(...xs.map((t) => t.y))].map(Math.floor)
  const out = []
  for (let y0 = minY - (minY % N); y0 <= maxY; y0 += N) for (let x0 = minX - (minX % N); x0 <= maxX; x0 += N) {
    let n = 0
    for (let dy = 0; dy < N; dy++) for (let dx = 0; dx < N; dx++) if (tileInBoundary(x0 + dx, y0 + dy)) n++
    if (n) out.push({ x0, y0, full: n === N * N })
  }
  return out
}

// ---------- tiles ----------
const tileUrl = (s: Source, x: number, y: number) =>
  s === 'esri'
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`
    : `https://ecn.t${(x + y) % 4}.tiles.virtualearth.net/tiles/a${quadkey(x, y, Z)}.jpeg?g=1`
const tilePath = (s: Source, x: number, y: number) => `data/raw/tiles/${s}/${Z}/${x}/${y}.jpg`
async function tile(s: Source, x: number, y: number): Promise<Buffer> {
  const p = tilePath(s, x, y)
  if (existsSync(p)) return readFileSync(p)
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(tileUrl(s, x, y), { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, buf)
      return buf
    } catch (e) {
      if (attempt >= 3) throw new Error(`tile ${s} ${x}/${y}: ${e}`, { cause: e })
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]) }))
}

// ---------- OSM overlay (optional) ----------
function osmLines(): number[][][] {
  const p = 'data/raw/osm/walkable.geojson'
  if (!existsSync(p)) return []
  return JSON.parse(readFileSync(p, 'utf8')).features.filter((f: { geometry: { type: string } }) => f.geometry.type === 'LineString').map((f: { geometry: { coordinates: number[][] } }) => f.geometry.coordinates)
}
const OSM = osmLines()
const toPx = (c: number[], x0: number, y0: number) => {
  const t = lonLatToTile({ lat: c[1], lon: c[0] }, Z)
  return [(t.x - x0) * TILE, (t.y - y0) * TILE]
}
const polyline = (pts: number[][], stroke: string, w: number, op = 1) =>
  `<polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>`
const SIZE = N * TILE
const GRID = 1000 // coordinate grid the model is asked to use
const px = (v: number) => (Math.min(GRID, Math.max(0, v)) * SIZE) / GRID

async function mosaicImage(s: Source, x0: number, y0: number, withOsm: boolean): Promise<Buffer> {
  const comps = []
  for (let dy = 0; dy < N; dy++) for (let dx = 0; dx < N; dx++)
    comps.push({ input: await tile(s, x0 + dx, y0 + dy), left: dx * TILE, top: dy * TILE })
  let img = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: '#000' } }).composite(comps).png().toBuffer()
  if (withOsm && OSM.length) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${OSM.map((l) => polyline(l.map((c) => toPx(c, x0, y0)), '#00e5ff', 1.5, 0.5)).join('')}</svg>`
    img = await sharp(img).composite([{ input: Buffer.from(svg) }]).png().toBuffer()
  }
  return img
}

// ---------- Gemini ----------
const Reply = z.object({
  paths: z.array(z.object({
    type: ShortcutKind,
    confidence: z.number().min(0).max(1),
    points: z.array(z.tuple([z.number(), z.number()])).min(2),
  })),
})
const PROMPT = `You are mapping a university campus (Universiti Teknologi Malaysia) from a square satellite image (north is up).
${OSM.length ? 'Thin cyan lines are walkways ALREADY mapped; do NOT report them.' : ''}
Report pedestrian paths that are clearly visible in the image: footpaths and desire-line dirt tracks cutting across grass or between buildings, covered walkways (roofed corridors with a visible roof), roof links or bridges between buildings, and outdoor stairs. Ignore vehicle roads (tarmac wider than about 4 m, lane markings, zebra crossings, cars), car parks, sports pitches, and anything you cannot see. Pedestrian paths are narrow (1-3 m), often paved pink/grey/orange or bare brown earth. Use covered-walkway only when you can see a roof over the path. Each polyline is open and goes from one end to the other without looping back; do not report the same path twice.
${OSM.length ? 'Report only paths that are MISSING from the cyan lines.' : ''}
Trace each path as a polyline of 2-12 points lying exactly on the visible path centreline, in normalized image coordinates [x, y]: x from the left edge (0-1000), y from the top edge (0-1000), so the image is a 1000x1000 grid whatever its pixel size. Paths shorter than about 15 m (65 units) are not useful.
Types: footpath, covered-walkway, stairs, through-building (only a roofed passage under or through a building), bridge (roofed or open link above ground).
Reply with JSON only: {"paths":[{"type":"footpath","confidence":0.8,"points":[[x,y],[x,y]]}]}. Use {"paths":[]} if none.`

async function ask(img: Buffer): Promise<z.infer<typeof Reply>> {
  const key = createHash('sha256').update(MODEL).update(PROMPT).update(img).digest('hex').slice(0, 24)
  const cache = `data/raw/cache/vision-${key}.json`
  if (existsSync(cache)) return Reply.parse(JSON.parse(readFileSync(cache, 'utf8')))
  const base = process.env.OMNIROUTE_BASE_URL, token = process.env.OMNIROUTE_API_KEY
  if (!base || !token) throw new Error("source ~/.hermes/.env first (set -a; source ~/.hermes/.env; set +a)")
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${img.toString('base64')}` } },
        ] }] }),
      })
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
      const text: string = ((await r.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content
      const reply = Reply.parse(JSON.parse(text.replace(/^[\s\S]*?```(?:json)?\s*|\s*```[\s\S]*$/g, '').trim() || text))
      mkdirSync(dirname(cache), { recursive: true })
      writeFileSync(cache, JSON.stringify(reply))
      return reply
    } catch (e) {
      if (attempt >= 2) throw e
    }
  }
}

// ---------- main ----------
const COLOR: Record<string, string> = { footpath: '#ff3b30', 'covered-walkway': '#ffd60a', stairs: '#ff2dff', 'through-building': '#30d158', bridge: '#0a84ff' }
const root = trial ? 'data/raw/trial' : 'data'
const today = new Date().toISOString().slice(0, 10)
const URL_FOR: Record<Source, string> = { esri: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9', bing: 'https://www.bing.com/maps' }

let list = mosaics()
if (trial) {
  // 6 full mosaics (54 tiles) nearest the academic core
  const c = lonLatToTile({ lat: 1.5586, lon: 103.637 }, Z)
  const d = (m: { x0: number; y0: number }) => Math.hypot(m.x0 + 1 - c.x, m.y0 + 1 - c.y)
  list = list.filter((m) => m.full).sort((a, b) => d(a) - d(b)).slice(0, 6)
}
list = list.slice(0, limit)
console.log(`${list.length} mosaics x ${sources.join('+')} (${list.length * N * N} tiles each)`)

const report: { s: Source; x0: number; y0: number; file: string; n: number }[] = []
let lines = 0
for (const s of sources) {
  await pool(list, 4, async ({ x0, y0 }) => {
    const img = await mosaicImage(s, x0, y0, true)
    const { paths } = await ask(img)
    const kept = paths.filter((p) => p.confidence >= 0.5)
    const svg: string[] = []
    for (const p of kept) {
      const geometry: LatLon[] = p.points.map(([x, y]) => pixelToLatLon(px(x), px(y), x0, y0, Z))
      const { id } = addCandidate({ kind: p.type, geometry }, root)
      appendEvidence({
        shortcutId: id, source: 'satellite', imagery: s, confidence: p.confidence,
        ref: `${s}:${s === 'esri' ? `${Z}/${x0}/${y0}` : quadkey(x0, y0, Z)}`,
        summary: `${s} z${Z} 3x3 mosaic at ${x0}/${y0}: Gemini sees a ${p.type}`,
        url: URL_FOR[s], observedAt: today,
      }, root)
      svg.push(polyline(p.points.map(([x, y]) => [px(x), px(y)]), COLOR[p.type], 3))
      lines++
    }
    if (trial) {
      const file = `vision/${s}-${x0}-${y0}.png`
      mkdirSync('data/raw/reports/vision', { recursive: true })
      await sharp(img).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${svg.join('')}</svg>`) }]).png().toFile(`data/raw/reports/${file}`)
      report.push({ s, x0, y0, file, n: kept.length })
    }
  })
}
if (trial) {
  report.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0 || a.s.localeCompare(b.s))
  const html = `<!doctype html><meta charset=utf-8><title>vision trial</title><style>body{font:14px sans-serif;background:#111;color:#eee}figure{display:inline-block;margin:6px}img{width:512px}</style>
<h1>Vision trial: ${list.length} mosaics x ${N * N} tiles, ${lines} lines</h1><p>${Object.entries(COLOR).map(([k, c]) => `<b style="color:${c}">${k}</b>`).join(' ')}</p>
${report.map((r) => `<figure><figcaption>${r.s} ${Z}/${r.x0}/${r.y0} - ${r.n} lines</figcaption><img src="${r.file}"></figure>`).join('\n')}`
  writeFileSync('data/raw/reports/vision-trial.html', html)
}
console.log(`${lines} lines with confidence >= 0.5 written to ${root}`)
