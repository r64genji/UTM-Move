// Builds data/raw/ai-e2e/<run>/report.html from the results/*.json that the specs record.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Result } from './lib/run.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildReport(runDir: string): string {
  let results: Result[] = []
  try {
    results = readdirSync(join(runDir, 'results')).map((f) => JSON.parse(readFileSync(join(runDir, 'results', f), 'utf8')) as Result)
  } catch { /* no results yet */ }
  const PARTS = { A: 'A. Agentic browser flows', B: 'B. Location audit', C: 'C. Route plausibility' } as const
  const section = (part: keyof typeof PARTS) => {
    const rs = results.filter((r) => r.part === part)
    const groups = (['mobile', 'desktop', 'all'] as const).map((vp) => ({ vp, rs: rs.filter((r) => r.viewport === vp) })).filter((g) => g.rs.length)
    return `<h2>${PARTS[part]} ${rs.length ? (rs.every((r) => r.pass) ? '<span class=ok>PASS</span>' : `<span class=bad>FAIL (${rs.filter((r) => !r.pass).length}/${rs.length})</span>`) : '<span>not run</span>'}</h2>` +
      groups.map((g) => `<h3>${g.vp}: ${g.rs.filter((r) => r.pass).length}/${g.rs.length} passed</h3>` + g.rs.map((r) =>
        `<details ${r.pass ? '' : 'open'}><summary class=${r.pass ? 'ok' : 'bad'}>${r.pass ? 'PASS' : 'FAIL'} ${esc(r.name)}</summary><p>${esc(r.summary)}</p>` +
        (r.problems.length ? `<ul>${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '') +
        r.screenshots.map((s) => `<a href="${s}"><img src="${s}" loading=lazy height=240></a>`).join('') + '</details>').join('')).join('')
  }
  const body = (['A', 'B', 'C'] as const).map(section).join('')
  const html = `<!doctype html><meta charset=utf-8><title>UTM Move AI e2e</title><style>body{font:14px sans-serif;max-width:1200px;margin:2em auto}.ok{color:#0a7d2c}.bad{color:#c00}img{margin:4px;border:1px solid #ccc}</style><h1>UTM Move AI e2e report</h1><p>${results.filter((r) => r.pass).length}/${results.length} passed</p>${body}`
  writeFileSync(join(runDir, 'report.html'), html)
  return html
}
