// Reads the Google Form's response sheet (CSV) into candidates and evidence.
//   FORM_SHEET_CSV_URL=<published-to-web CSV link> npx tsx pipeline/shortcuts/import_form.ts
//   npx tsx pipeline/shortcuts/import_form.ts responses.csv
// Columns are the form question titles: Timestamp, Kind, Geometry, Note, Shortcut ID, Worked.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { KIND_LABELS, decodeGeometry } from '../../src/features/feedback/shortcutReport.ts'
import { addCandidate, appendEvidence, appendNegative, readCandidates } from './store.ts'

/** Minimal CSV parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [[]]
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      rows.at(-1)!.push(field)
      field = ''
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      rows.at(-1)!.push(field)
      field = ''
      rows.push([])
    } else field += c
  }
  rows.at(-1)!.push(field)
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()))
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/** ISO, or Google Sheets `M/D/YYYY H:MM:SS` (D/M/YYYY when the first number is above 12). */
function dateOf(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(ts)) return ts.slice(0, 10)
  const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) throw new Error(`bad timestamp: ${ts}`)
  const [a, b] = [Number(m[1]), Number(m[2])]
  const [month, day] = a > 12 ? [b, a] : [a, b]
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function importForm(csv: string, root = 'data') {
  const known = new Set(readCandidates(root).map((c) => c.id))
  const kinds = Object.fromEntries(Object.entries(KIND_LABELS).map(([k, label]) => [label.toLowerCase(), k])) as Record<string, keyof typeof KIND_LABELS>
  const stats = { candidates: 0, evidence: 0, negatives: 0, skipped: 0 }
  for (const row of parseCsv(csv)) {
    const geometry = decodeGeometry(row['Geometry'] ?? '')
    const worked = (row['Worked'] ?? '').toLowerCase()
    const note = row['Note'] || undefined
    let shortcutId = row['Shortcut ID'] || undefined
    if (shortcutId && !known.has(shortcutId)) shortcutId = undefined
    if (!shortcutId && geometry.length >= 2) {
      const kind = kinds[(row['Kind'] ?? '').toLowerCase()] ?? 'footpath'
      const added = addCandidate({ kind, geometry, note }, root)
      shortcutId = added.id
      known.add(added.id)
      if (!added.merged) stats.candidates++
    }
    if (!shortcutId) {
      stats.skipped++
      continue
    }
    // Reporter-ish fields only: no name or email ever reaches the repo.
    const ref = createHash('sha1').update([row['Timestamp'], row['Geometry'], row['Shortcut ID'], note].join('|')).digest('hex').slice(0, 12)
    const base = { shortcutId, source: 'user-report' as const, ref, observedAt: dateOf(row['Timestamp'] ?? '') }
    if (worked === 'no') {
      stats.negatives += appendNegative({ ...base, summary: 'User said this shortcut did not work' }, root).added ? 1 : 0
    } else {
      const summary = worked === 'yes' ? 'User confirmed this shortcut works' : `User reported a shortcut${note ? `: ${note}` : ''}`
      stats.evidence += appendEvidence({ ...base, summary }, root).added ? 1 : 0
    }
  }
  return stats
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ?? process.env.FORM_SHEET_CSV_URL
  if (!src) throw new Error('Pass a CSV path or set FORM_SHEET_CSV_URL (published-to-web CSV link of the response sheet).')
  const csv = /^https?:/.test(src) ? await (await fetch(src)).text() : readFileSync(src, 'utf8')
  console.log(importForm(csv))
}
