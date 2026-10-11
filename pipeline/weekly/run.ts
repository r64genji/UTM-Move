// npm run data:weekly  (same thing the weekly-data GitHub Action runs; never deploys, never pushes)
// form reports -> fresh OSM GPS traces -> re-score -> OSM checklist -> rebuild -> validate + test -> diff report.
// Report: data/raw/reports/weekly.md (the workflow uses it as the PR body).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { decodeGraph } from '../../src/domain/walk/graph.ts'
import { loadRouterData, loadTrips, planTrip } from '../golden/lib.ts'

const REPORT = 'data/raw/reports/weekly.md'
const SCORED = 'data/shortcuts/scored.geojson'
const failures: string[] = []

function run(label: string, cmd: string[], opts: { fatal?: boolean } = {}): boolean {
  console.log(`\n== ${label}`)
  const ok = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' }).status === 0
  if (!ok) {
    failures.push(label)
    if (opts.fatal !== false) {
      console.error(`${label} failed`)
      process.exit(1)
    }
  }
  return ok
}
const npm = (script: string) => ['npm', 'run', script]

interface Snap { levels: Record<string, number>; ids: Map<string, string>; evidence: number }
function snapshot(): Snap {
  const levels: Record<string, number> = { verified: 0, likely: 0, guess: 0 }
  const ids = new Map<string, string>()
  if (existsSync(SCORED)) {
    for (const f of JSON.parse(readFileSync(SCORED, 'utf8')).features as { properties: { id: string; level: string; inOsm?: boolean } }[]) {
      levels[f.properties.level]++
      ids.set(f.properties.id, f.properties.level + (f.properties.inOsm ? ' (in OSM)' : ''))
    }
  }
  const evidence = readdirLines('data/evidence')
  return { levels, ids, evidence }
}
function readdirLines(dir: string): number {
  const r = spawnSync('sh', ['-c', `cat ${dir}/*.jsonl 2>/dev/null | grep -c .`], { encoding: 'utf8' })
  return Number(r.stdout.trim() || 0)
}
function graphStats() {
  const buf = readFileSync('public/data/graph.bin')
  const g = decodeGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  return { bytes: buf.length, nodes: g.nodeCount, edges: g.edgeCount }
}
const bestS = (o: { durationS: number }[]) => Math.min(...o.map((x) => x.durationS))

// 0. Baseline build from the committed data, so the report can compare graph size.
run('baseline build', ['sh', '-c', 'npm run build:transit && npm run build:graph'])
const before = snapshot()
const graphBefore = graphStats()

// 1. Form reports.
const csv = process.env.FORM_SHEET_CSV_URL
let formNote = 'skipped (FORM_SHEET_CSV_URL not set)'
if (csv) {
  run('import form reports', ['npx', 'tsx', 'pipeline/shortcuts/import_form.ts'])
  formNote = 'imported'
} else console.log('\n== import form reports: FORM_SHEET_CSV_URL not set, skipping')

// 2. Fresh OSM public GPS traces (cache removed first so nothing is stale; the fetcher does 1 request/s with a User-Agent).
rmSync('data/raw/gpx-osm', { recursive: true, force: true })
run('refresh OSM GPS traces', npm('gps:shortcuts'))

// 3. Re-score (drops candidates OSM now has), OSM checklist, rebuild.
run('re-score evidence', npm('score:shortcuts'))
run('OSM checklist', npm('export:osm'))
run('build transit', npm('build:transit'))
run('build graph', npm('build:graph'))
run('build places', ['npm', 'run', 'build:places', '--if-present'])

// 4. Checks. Failures go in the report; the PR still opens so a human sees them.
run('validate', npm('validate'), { fatal: false })
run('tests', npm('test'), { fatal: false })

// 5. Report.
const after = snapshot()
const graphAfter = graphStats()
const added = [...after.ids].filter(([id]) => !before.ids.has(id))
const removed = [...before.ids].filter(([id]) => !after.ids.has(id))
const moved = [...after.ids].filter(([id, l]) => before.ids.has(id) && before.ids.get(id) !== l)
const data = loadRouterData()
const baseline = JSON.parse(readFileSync('tests/golden/baseline.json', 'utf8')) as Record<string, { options: { durationS: number }[] }>
const goldenChanges = loadTrips().flatMap((t) => {
  const now = bestS(planTrip(data, t))
  const was = baseline[t.id] ? bestS(baseline[t.id].options) : undefined
  return was === undefined || now === was ? [] : [`| ${t.id} | ${(was / 60).toFixed(1)} | ${(now / 60).toFixed(1)} | ${now > was ? '+' : ''}${now - was} s |`]
})
const list = (rows: [string, string][]) => (rows.length ? rows.map(([id, l]) => `- \`${id}\` ${l}`).join('\n') : 'none')
const md = `# Weekly data rebuild

| | before | after |
|---|---|---|
| candidates verified | ${before.levels.verified} | ${after.levels.verified} |
| candidates likely | ${before.levels.likely} | ${after.levels.likely} |
| candidates guess | ${before.levels.guess} | ${after.levels.guess} |
| evidence records | ${before.evidence} | ${after.evidence} |
| graph nodes | ${graphBefore.nodes} | ${graphAfter.nodes} |
| graph edges | ${graphBefore.edges} | ${graphAfter.edges} |
| graph.bin bytes | ${graphBefore.bytes} | ${graphAfter.bytes} |

Form import: ${formNote}.

## New shortcuts (${added.length})
${list(added)}

## Removed shortcuts (${removed.length})
${list(removed)}

## Level changes (${moved.length})
${list(moved.map(([id, l]) => [id, `${before.ids.get(id)} -> ${l}`]))}

## Golden trips: best time vs tests/golden/baseline.json (${goldenChanges.length} changed)
${goldenChanges.length ? `| trip | was min | now min | change |\n|---|---|---|---|\n${goldenChanges.join('\n')}` : 'no change'}

## Checks
${failures.length ? `FAILED: ${failures.join(', ')}` : 'validate and tests passed'}

Review the data diff before merging. This PR is never deployed by the workflow.
`
mkdirSync('data/raw/reports', { recursive: true })
writeFileSync(REPORT, md)
console.log(`\n${md}\nreport: ${REPORT}`)
