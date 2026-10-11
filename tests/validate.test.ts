// The data gate (#19): broken sample data must fail with a readable message and exit code 1.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { validate } from '../pipeline/validate.ts'

const FIX = 'tests/fixtures/validate'
const tmp = mkdtempSync(join(tmpdir(), 'validate-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

/** A copy of the good data dir with one bad-* overlay on top. */
function dirWith(bad?: string): string {
  const dir = mkdtempSync(join(tmp, 'case-'))
  cpSync(`${FIX}/good`, dir, { recursive: true })
  if (bad) cpSync(`${FIX}/bad-${bad}`, dir, { recursive: true })
  return dir
}

const cases: [string, string][] = [
  ['stop-id', '✗ transit: trip A:1 uses stop id S9, which does not exist'],
  ['outside', '✗ places: "Cafe Bahru" (id p2) is 223 m outside the campus boundary'],
  ['unnamed', '✗ places: unnamed place (id p2) has name "Unnamed"'],
  ['time', '✗ transit: trip A:1 time does not increase at stop S2 (08:05 then 08:05)'],
  ['duplicate-id', '✗ places: duplicate id p1'],
]

describe('validate()', () => {
  test('good data passes every check', () => {
    const r = validate(dirWith())
    expect(r.ok).toBe(true)
    expect(r.lines.at(-1)).toBe('validate: all 11 checks passed')
    expect(r.lines).toContain('✓ trip times: 1 checked')
  })

  test.each(cases)('%s fails with a readable message', (bad, message) => {
    const r = validate(dirWith(bad))
    expect(r.ok).toBe(false)
    expect(r.lines).toContain(message)
  })
})

describe('npm run validate (CLI)', () => {
  const cli = (dir: string) => spawnSync('npx', ['tsx', 'pipeline/validate.ts', dir], { encoding: 'utf8' })

  test('exits 1 and prints the message for broken data', () => {
    const r = cli(dirWith('outside'))
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('✗ places: "Cafe Bahru" (id p2) is 223 m outside the campus boundary')
    expect(r.stdout).toContain('validate: 1 of 11 checks failed')
  })

  test('exits 0 for good data', () => {
    const r = cli(dirWith())
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('validate: all 11 checks passed')
  })
})
