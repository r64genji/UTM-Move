// Part A: Gemini drives the app in a real browser, mobile and desktop.
import { test, expect } from '@playwright/test'
import { judge, runAgent } from './lib/agent.ts'
import { hasKey, SKIP_MESSAGE } from './lib/gemini.ts'
import { outDir, record, slug } from './lib/run.ts'
import { FIXED_TIME } from './lib/viewports.ts'

const GOALS: { name: string; goal: string; now?: boolean }[] = [
  { name: 'search KTDI', goal: 'Search for "KTDI" and open directions to the matching residential college (Kolej Tun Dr Ismail). The directions screen must name that college as the destination.' },
  { name: 'plan to N28', goal: 'Plan a trip from my current location to "N28 Faculty of Computing" and read the trip options (durations and whether there is a bus option).' },
  { name: 'plan Kolej 9/10 to Centre Point', goal: 'Plan a trip from Kolej 9/10 to Centre Point, leaving at 08:00 (on 17 March 2026). Then pick a bus option and open its details.' },
  { name: 'bus stop departures', goal: 'Open the departures for a bus stop (for example Centre Point) and read the next buses (route and time).' },
  { name: 'start navigation', goal: 'Plan any trip between two campus places, then start turn-by-turn navigation on one option and check that a navigation screen appears.' },
  { name: 'now: plan to N28', goal: 'Plan a trip from my current location to "N28 Faculty of Computing" for leaving now and read the options.', now: true },
]

test.skip(!hasKey(), SKIP_MESSAGE)

for (const g of GOALS) {
  test(`A: ${g.name}`, async ({ page }, info) => {
    const viewport = info.project.name as 'mobile' | 'desktop'
    const dir = outDir('agent', viewport, slug(g.name))
    if (!g.now) await page.clock.setFixedTime(FIXED_TIME)
    await page.goto('/')
    await page.waitForTimeout(1500)
    const run = await runAgent(page, g.goal, dir)
    const verdict = await judge(page, g.goal, `${viewport} ${page.viewportSize()!.width}x${page.viewportSize()!.height}`, dir)
    const severe = verdict.problems.filter((p) => p.severity === 'high').map((p) => p.text)
    const pass = run.finished === 'done' && verdict.success && verdict.usable && severe.length === 0
    const problems = [...(run.finished === 'done' ? [] : [`agent ended: ${run.finished} (${run.reason})`]), ...(verdict.success ? [] : ['judge: goal not achieved']), ...verdict.problems.map((p) => `${p.severity}: ${p.text}`)]
    record({
      part: 'A', viewport, name: g.name, pass, summary: `${run.finished} in ${run.steps} steps. ${verdict.notes}`, problems,
      screenshots: [`agent/${viewport}/${slug(g.name)}/final.png`],
    })
    expect(problems.filter((p) => !p.startsWith('low') && !p.startsWith('medium')), run.log.join('\n')).toEqual([])
    expect(pass).toBe(true)
  })
}
