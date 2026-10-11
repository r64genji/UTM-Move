// Per-run output folder and result records, read back by report.ts.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RUN = process.env.AI_E2E_RUN ?? 'adhoc'
export const RUN_DIR = join('data/raw/ai-e2e', RUN)

export interface Result {
  part: 'A' | 'B' | 'C'
  viewport: 'mobile' | 'desktop' | 'all'
  name: string
  pass: boolean
  summary: string
  problems: string[]
  /** Paths relative to RUN_DIR. */
  screenshots: string[]
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export function outDir(...parts: string[]): string {
  const dir = join(RUN_DIR, ...parts)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function record(r: Result) {
  writeFileSync(join(outDir('results'), `${r.part}-${r.viewport}-${slug(r.name)}.json`), JSON.stringify(r, null, 1))
}
