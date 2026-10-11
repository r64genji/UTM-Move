// `npm run test:ai [-- --fresh] [-- <playwright args>]`. Skips with a message when there is no OmniRoute key.
import { spawnSync } from 'node:child_process'
import { SKIP_MESSAGE, hasKey } from './lib/gemini.ts'
import { buildReport } from './report.ts'

if (!hasKey()) {
  console.log(SKIP_MESSAGE)
  process.exit(0)
}
const args = process.argv.slice(2)
const fresh = args.includes('--fresh')
const run = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const env = { ...process.env, AI_E2E_RUN: run, ...(fresh ? { AI_E2E_FRESH: '1' } : {}) }
const pw = spawnSync('npx', ['playwright', 'test', '-c', 'tests/ai-e2e/playwright.config.ts', ...args.filter((a) => a !== '--fresh')], { stdio: 'inherit', env })
buildReport(`data/raw/ai-e2e/${run}`)
console.log(`\nreport: data/raw/ai-e2e/${run}/report.html`)
process.exit(pw.status ?? 1)
