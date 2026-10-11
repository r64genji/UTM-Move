// npm run research:shortcuts [-- --limit N] [-- --areas 50]
// One Hermes one-shot research job per campus area (researcher profile, Gemini via OmniRoute), max 4 at once.
// Resumable: Hermes replies and fetched pages are cached under data/raw/cache/research/.
// Writes data/research/{areas,claims,floorplans}.jsonl, and evidence + candidates through pipeline/shortcuts/store.ts.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseJsonReply } from '../places/llm.ts'
import { addCandidate, appendEvidence } from '../shortcuts/store.ts'
import { buildAreas, findPlace, HermesReply, htmlToText, lineBetween, parseClaims, quoteInText, type Area, type Place, type RawClaim } from './claims.ts'

const CACHE = 'data/raw/cache/research'
const OUT = 'data/research'
const TODAY = new Date().toISOString().slice(0, 10)
const arg = (name: string, d: number) => Number(process.argv[process.argv.indexOf(`--${name}`) + 1]) || d
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)
const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')

function prompt(a: Area): string {
  return `You are researching the Universiti Teknologi Malaysia (UTM) main campus in Skudai, Johor Bahru.
Area: "${a.name}" (around lat ${a.center.lat.toFixed(5)}, lon ${a.center.lon.toFixed(5)}). Places in this area: ${a.places.join('; ')}.

Task: use web search and fetch real pages (UTM and faculty sites, student forums, Reddit, blogs, orientation guides, theses, YouTube descriptions, Google Maps/review snippets, Malay and English) to find statements about WALKING connections involving this area: covered walkways (laluan berbumbung), stairs, routes through a building, footpaths, footbridges, shortcuts between two named places. Search ideas: "laluan berbumbung <place>", "<place> ke <place> jalan kaki UTM", "UTM shortcut <place>", "UTM jalan pintas pelajar", "UTM freshie guide walk from <place> to <place>", "<place> UTM reddit", "UTM covered walkway map", "<faculty> pelan lokasi". Do about 8 to 12 searches and open the most promising pages, then stop.

Rules:
- Only report claims you read on a page you actually fetched. Never invent a URL or quote. The quote must be copied verbatim from the page, at most 200 characters, in the page's own language.
- "from" and "to" are place names; use the names from the list above when the page refers to those places, otherwise the name the page uses.
- "type" is one of: covered walkway, stairs, through-building, footpath, bridge.
- "date" is the page's publish date as YYYY-MM-DD, or omit it.
- Also list floor plan, evacuation map or campus map URLs (PDF or image or page) for buildings in this area.
- Only report a direct walking link between two specific places (for example "a covered walkway connects the library to the faculty", "you can cut through building X"). Do NOT report long recreational or jogging routes, bus routes, or generic facility lists.
- If you find nothing, return empty lists. That is a fine answer.

Reply with ONLY one JSON object, no other text:
{"claims":[{"from":"","to":"","type":"","url":"","quote":"","date":""}],"pagesChecked":["url"],"floorplans":[{"url":"","title":""}]}`
}

function hermes(a: Area): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('hermes', ['-p', 'researcher', '-z', prompt(a)], { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('hermes timeout 15 min')) }, 15 * 60_000)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && out.trim()) resolve(out)
      else reject(new Error(`hermes exit ${code}: ${err.slice(0, 200)}`))
    })
  })
}

async function research(a: Area): Promise<{ reply?: ReturnType<typeof HermesReply.parse>; error?: string }> {
  const file = `${CACHE}/hermes/${hash(prompt(a))}.txt`
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (!existsSync(file)) { mkdirSync(`${CACHE}/hermes`, { recursive: true }); writeFileSync(file, await hermes(a)) }
      return { reply: HermesReply.parse(parseJsonReply(readFileSync(file, 'utf8'))) }
    } catch (e) {
      console.error(`${a.id} attempt ${attempt}: ${String(e).slice(0, 160)}`)
      if (existsSync(file)) renameSync(file, `${file}.bad`)
      if (attempt === 2) return { error: String(e).slice(0, 200) }
    }
  }
  return { error: 'unreachable' }
}

/** Fetch a page (cached). Returns its text, or undefined when it cannot be fetched. `text: ''` means fetched but not readable (PDF, video). */
async function page(url: string): Promise<{ status: number; text: string } | undefined> {
  const file = `${CACHE}/pages/${hash(url)}.json`
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) UTMMoveResearch/1.0', 'Accept-Language': 'en,ms' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) })
    const type = res.headers.get('content-type') ?? ''
    const text = res.ok && /html|text|json|xml/.test(type) ? htmlToText((await res.text()).slice(0, 3_000_000)) : ''
    const out = { status: res.status, text }
    mkdirSync(`${CACHE}/pages`, { recursive: true })
    writeFileSync(file, JSON.stringify(out))
    return out
  } catch {
    return undefined
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]) }))
}

const places = (JSON.parse(readFileSync('public/data/places.json', 'utf8')) as Place[])
const areas = buildAreas(places, arg('areas', 50)).slice(0, arg('limit', 1000))
console.log(`${areas.length} areas`)
const replies = new Map<string, Awaited<ReturnType<typeof research>>>()
await pool(areas, 4, async (a) => {
  const t = Date.now()
  replies.set(a.id, await research(a))
  console.log(`${a.id} ${a.name}: ${replies.get(a.id)?.error ? 'FAILED' : `${replies.get(a.id)?.reply?.claims.length} raw claims`} (${Math.round((Date.now() - t) / 1000)}s)`)
})

type ClaimRow = RawClaim & { areaId: string; observedAt: string; fetchStatus: number; quoteVerified: boolean; shortcutId?: string }
const claims: ClaimRow[] = [], floorplans: { areaId: string; url: string; title?: string }[] = [], areaRows: unknown[] = []
let candidates = 0
for (const a of areas) {
  const r = replies.get(a.id)!
  if (!r.reply) { areaRows.push({ ...a, status: 'failed', error: r.error, researchedAt: TODAY }); continue }
  const { ok, rejected } = parseClaims(r.reply.claims)
  let unfetched = 0, kept = 0
  const seen = new Set<string>()
  for (const c of ok) {
    const key = hash([c.url, c.from, c.to, c.quote].join('|'))
    if (seen.has(key)) continue
    seen.add(key)
    const pg = await page(c.url)
    if (!pg || pg.status >= 400) { unfetched++; continue }
    const row: ClaimRow = { ...c, areaId: a.id, observedAt: c.date ?? TODAY, fetchStatus: pg.status, quoteVerified: pg.text !== '' && quoteInText(c.quote, pg.text) }
    const [pf, pt] = [findPlace(c.from, places), findPlace(c.to, places)]
    const line = pf && pt && pf.id !== pt.id ? lineBetween(pf, pt) : undefined
    if (row.quoteVerified && line) {
      const { id } = addCandidate({ kind: c.type, geometry: line, from: pf!.name, to: pt!.name, note: 'research claim, straight line between nearest entrances' })
      appendEvidence({ shortcutId: id, source: 'research', ref: c.url, summary: `${c.from} to ${c.to} (${c.type}): "${c.quote}"`, url: c.url, observedAt: row.observedAt, confidence: 0.5 })
      row.shortcutId = id
      candidates++
    }
    claims.push(row)
    kept++
  }
  for (const f of r.reply.floorplans) floorplans.push({ areaId: a.id, ...f })
  areaRows.push({ ...a, status: kept ? 'claims' : 'nothing-found', claims: kept, rejectedClaims: rejected.length, unfetchedClaims: unfetched, pagesChecked: r.reply.pagesChecked.length, researchedAt: TODAY })
}
mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/areas.jsonl`, jsonl(areaRows))
writeFileSync(`${OUT}/claims.jsonl`, jsonl(claims))
const fp = [...new Map(floorplans.map((f) => [f.url, f])).values()]
writeFileSync(`${OUT}/floorplans.jsonl`, jsonl(fp))
console.log(`areas ${areaRows.length}, claims ${claims.length} (verified quotes ${claims.filter((c) => c.quoteVerified).length}), candidates ${candidates}, floorplan urls ${fp.length}`)
