// Part B: audit public/data/places.json. Deterministic checks plus Gemini review of every place.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { checkPlaces, type PlaceRow } from './lib/checks.ts'
import { ask, hasKey, SKIP_MESSAGE } from './lib/gemini.ts'
import { outDir, record, RUN_DIR } from './lib/run.ts'
import { renderMap } from './lib/staticmap.ts'
import { CAMPUS_CONTEXT } from './lib/viewports.ts'

const PLACES = 'public/data/places.json'
const BATCH = 50

interface Place extends PlaceRow { category: string; aliases?: string[]; buildingId?: string; blockCode?: string }

const Review = z.object({
  flags: z.array(z.object({
    index: z.number().int(),
    issue: z.enum(['junk-name', 'private', 'off-campus', 'duplicate', 'vague', 'closed', 'wrong-category', 'wrong-location', 'other']),
    severity: z.enum(['low', 'medium', 'high']),
    reason: z.string(),
  })).default([]),
})

/** Split into spatial clusters of at most `n` places, so each batch fits one map image. */
function cluster(ps: Place[], n: number): Place[][] {
  if (ps.length <= n) return [ps]
  const lats = ps.map((p) => p.location.lat), lons = ps.map((p) => p.location.lon)
  const byLat = Math.max(...lats) - Math.min(...lats) > Math.max(...lons) - Math.min(...lons)
  const sorted = [...ps].sort((a, b) => (byLat ? a.location.lat - b.location.lat : a.location.lon - b.location.lon))
  const mid = sorted.length >> 1
  return [...cluster(sorted.slice(0, mid), n), ...cluster(sorted.slice(mid), n)]
}

test.skip(!hasKey(), SKIP_MESSAGE)

test('B: places audit', async () => {
  const info = test.info()
  test.skip(info.project.name !== 'desktop', 'viewport independent: runs once')
  if (!existsSync(PLACES)) {
    record({ part: 'B', viewport: 'all', name: 'places audit', pass: false, summary: 'places data is missing', problems: [`${PLACES} does not exist`], screenshots: [] })
    expect.soft(existsSync(PLACES), `places data is missing: ${PLACES} not found (build it first)`).toBe(true)
    return
  }
  const places = JSON.parse(readFileSync(PLACES, 'utf8')) as Place[]
  const boundary = JSON.parse(readFileSync('data/campus-boundary.geojson', 'utf8')).features[0].geometry.coordinates as number[][][]
  const deterministic = checkPlaces(places, boundary)

  const flagged: { id: string; name: string; category: string; issue: string; severity: string; reason: string }[] = []
  const shots: string[] = []
  const batches = cluster(places, BATCH)
  for (const [bi, batch] of batches.entries()) {
    const img = await renderMap(batch.map((p, i) => ({ ...p.location, label: String(i) })))
    writeFileSync(join(outDir('places'), `batch-${bi + 1}.png`), img)
    shots.push(`places/batch-${bi + 1}.png`)
    const rows = batch.map((p, i) => `${i}\t${p.name}\t${p.category}\t${(p.aliases ?? []).join('; ')}\t${p.location.lat.toFixed(5)},${p.location.lon.toFixed(5)}\t${p.buildingId ?? p.blockCode ?? ''}`).join('\n')
    const review = await ask(Review, {
      system: `You audit the place list of a campus navigation app. ${CAMPUS_CONTEXT}`,
      text: `Review these ${batch.length} places (index, name, category, aliases, lat/lon, building ref). The image is Esri satellite imagery with each place drawn as a dot labelled with its index.\n\n${rows}\n\n` +
        `Flag anything that should not be a location in a campus navigation app: junk or garbled names, private homes or people's names, off-campus businesses, duplicates, vague names with no context ("Unnamed", "Building", "Parking 3"), closed places, wrong category, pins clearly in the wrong place (e.g. in the middle of a lake or forest). Do not flag normal campus places. ` +
        `Reply as JSON in a \`\`\`json fence: {"flags": [{"index": 0, "issue": "junk-name|private|off-campus|duplicate|vague|closed|wrong-category|wrong-location|other", "severity": "low|medium|high", "reason": "..."}]}. Use high only when the place is clearly wrong and should be removed or fixed. An empty list is fine.`,
      images: [img],
    })
    for (const f of review.flags) {
      const p = batch[f.index]
      if (p) flagged.push({ id: p.id, name: p.name, category: p.category, issue: f.issue, severity: f.severity, reason: f.reason })
    }
  }
  const high = flagged.filter((f) => f.severity === 'high')
  writeFileSync(join(RUN_DIR, 'places-audit.json'), JSON.stringify({ total: places.length, deterministic, flagged }, null, 1))
  const md = [
    `# Places audit`, '', `${places.length} places in ${batches.length} batches.`, '',
    `## Deterministic checks`, '', ...(deterministic.length ? deterministic.map((d) => `- ${d}`) : ['All passed.']), '',
    `## Gemini flags (${flagged.length}, ${high.length} high)`, '', '| severity | id | name | category | issue | reason |', '|---|---|---|---|---|---|',
    ...flagged.sort((a, b) => b.severity.localeCompare(a.severity)).map((f) => `| ${f.severity} | ${f.id} | ${f.name} | ${f.category} | ${f.issue} | ${f.reason.replace(/\|/g, '/')} |`),
  ].join('\n')
  writeFileSync(join(RUN_DIR, 'places-audit.md'), md)

  const problems = [...deterministic, ...high.map((f) => `HIGH ${f.id} "${f.name}": ${f.issue} - ${f.reason}`)]
  record({
    part: 'B', viewport: 'all', name: 'places audit', pass: problems.length === 0,
    summary: `${places.length} places, ${deterministic.length} deterministic failures, ${flagged.length} Gemini flags (${high.length} high)`,
    problems, screenshots: shots.slice(0, 6),
  })
  expect(problems).toEqual([])
})
