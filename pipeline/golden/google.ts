// Google walking time and distance for each golden trip, from the public Maps directions page in a
// headless browser. One request per ~5 s. Caches the page text under data/raw/google/ (gitignored).
// Only our parsed numbers go to tests/golden/google.json; no Google geometry is kept.
// Run: npx tsx pipeline/golden/google.ts   (GOOGLE_CHROME=/path/to/chrome overrides the browser)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext } from '@playwright/test'
import { loadTrips } from './lib.ts'

export interface GoogleWalk { duration_s: number | null; distance_m: number | null; note?: string }

/** "1 h 5 min \n 3.2 km \n via X" -> seconds, metres. Google rounds time to whole minutes. */
export function parseWalk(text: string): GoogleWalk {
  const m = /\n(?:(\d+) hr )?(\d+) min\n([\d.,]+) (km|m)\nvia /.exec(text)
  if (!m) return { duration_s: null, distance_m: null, note: 'could not parse the first route' }
  const dist = parseFloat(m[3].replace(/,/g, '')) * (m[4] === 'km' ? 1000 : 1)
  return { duration_s: (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60, distance_m: Math.round(dist) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync('data/raw/google', { recursive: true })
  // Launched on the first cache miss, so re-parsing cached pages needs no browser.
  let browser: Browser | undefined
  let ctx: BrowserContext | undefined
  const out: Record<string, GoogleWalk> = {}
  for (const t of loadTrips()) {
    const file = `data/raw/google/${t.id}.txt`
    if (!existsSync(file)) {
      browser ??= await chromium.launch({ executablePath: process.env.GOOGLE_CHROME })
      ctx ??= await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' })
      const page = await ctx.newPage()
      const url = `https://www.google.com/maps/dir/?api=1&origin=${t.from.lat},${t.from.lon}&destination=${t.to.lat},${t.to.lon}&travelmode=walking`
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(8000)
        writeFileSync(file, await page.innerText('body'))
      } catch (e) {
        console.error(t.id, String(e))
      }
      await page.close()
      await new Promise((r) => setTimeout(r, 5000))
    }
    out[t.id] = existsSync(file) ? parseWalk(readFileSync(file, 'utf8')) : { duration_s: null, distance_m: null, note: 'request failed' }
    console.log(t.id, out[t.id])
  }
  await browser?.close()
  writeFileSync('tests/golden/google.json', JSON.stringify(out, null, 1) + '\n')
}
