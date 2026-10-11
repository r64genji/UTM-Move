import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { feedbackUrl, reportUrl } from '../../src/features/feedback/shortcutReport.ts'
import { importForm } from './import_form.ts'
import { scoreShortcut } from './score.ts'
import { addCandidate, readCandidates, readEvidence, readNegatives } from './store.ts'

const csv = readFileSync(join(import.meta.dirname, 'fixtures', 'form-responses.csv'), 'utf8')
const a = { lat: 1.5589, lon: 103.6387 }
const b = { lat: 1.5599, lon: 103.6387 }

test('form responses become a candidate, a confirmation and a negative', () => {
  const root = mkdtempSync(join(tmpdir(), 'form-'))
  addCandidate({ id: 'sc-known', kind: 'footpath', geometry: [{ lat: 1.57, lon: 103.64 }, { lat: 1.571, lon: 103.64 }] }, root)

  expect(importForm(csv, root)).toEqual({ candidates: 1, evidence: 2, negatives: 1, skipped: 0 })

  const created = readCandidates(root).find((c) => c.id !== 'sc-known')!
  expect(created).toEqual({ id: created.id, kind: 'stairs', geometry: [a, b], note: 'Behind N28a, "saves 3 min"' })
  const ev = readEvidence(root)
  expect(ev.map((e) => ({ shortcutId: e.shortcutId, source: e.source, summary: e.summary, observedAt: e.observedAt }))).toEqual([
    { shortcutId: created.id, source: 'user-report', summary: 'User reported a shortcut: Behind N28a, "saves 3 min"', observedAt: '2026-10-11' },
    { shortcutId: 'sc-known', source: 'user-report', summary: 'User confirmed this shortcut works', observedAt: '2026-10-12' },
  ])
  expect(readNegatives(root).map((n) => [n.shortcutId, n.summary, n.observedAt])).toEqual([
    ['sc-known', 'User said this shortcut did not work', '2026-10-13'],
  ])
  // Re-importing adds nothing.
  expect(importForm(csv, root)).toEqual({ candidates: 0, evidence: 0, negatives: 0, skipped: 0 })
})

test('as many "does not work" as supporting records demotes to guess', () => {
  const root = mkdtempSync(join(tmpdir(), 'form-'))
  addCandidate({ id: 'sc-known', kind: 'footpath', geometry: [a, b] }, root)
  importForm(csv, root)
  const yes = readEvidence(root).filter((e) => e.shortcutId === 'sc-known')
  const osm = [{ ...yes[0], id: 'o', source: 'osm' as const, ref: 'way/1' }]
  expect(scoreShortcut(osm).level).toBe('verified')
  expect(scoreShortcut(osm, readNegatives(root))).toEqual({
    level: 'guess',
    reasons: ['1 users said it does not work, 1 evidence records support it'],
  })
})

test('report and feedback links prefill the form', () => {
  const url = 'https://docs.google.com/forms/d/e/1FAIpQLSfwLOnLvRxB2sJnAHIDMqcKtaVTYy8OR3KrJ_beSJKOIYxj0Q/viewform'
  expect(reportUrl({ kind: 'stairs', geometry: [a, b], note: 'Behind N28a', shortcutId: 'sc-1' })).toBe(
    `${url}?usp=pp_url&entry.1000000001=Stairs&entry.1000000002=1.558900%2C103.638700%3B1.559900%2C103.638700&entry.1000000003=Behind+N28a&entry.1000000004=sc-1`,
  )
  expect(feedbackUrl({ worked: false, shortcutId: 'sc-1' })).toBe(`${url}?usp=pp_url&entry.1000000004=sc-1&entry.1000000005=No`)
})
