// Gemini drives the browser: goal + ARIA snapshot + screenshot in, one JSON action out.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { z } from 'zod'
import { ask } from './gemini.ts'
import { CAMPUS_CONTEXT } from './viewports.ts'

export const Action = z.object({
  action: z.enum(['click', 'type', 'press', 'scroll', 'wait', 'done', 'fail']),
  target: z.object({ role: z.string().optional(), name: z.string().optional(), text: z.string().optional() }).nullish(),
  value: z.string().nullish(),
  reason: z.string().default(''),
})
export type Action = z.infer<typeof Action>

export const Verdict = z.object({
  success: z.boolean(),
  usable: z.boolean(),
  problems: z.array(z.object({ severity: z.enum(['low', 'medium', 'high']), text: z.string() })).default([]),
  notes: z.string().default(''),
})
export type Verdict = z.infer<typeof Verdict>

const SYSTEM = `You operate a web app in a browser to reach a goal. ${CAMPUS_CONTEXT}
Each turn you get the goal, your previous actions, an ARIA snapshot of the page and a screenshot. Reply with exactly ONE action as JSON in a \`\`\`json fence:
{"action": "click|type|press|scroll|wait|done|fail", "target": {"role": "button", "name": "Search"} or {"text": "visible text"}, "value": "text to type, key to press, or up/down for scroll", "reason": "why"}
- click: click the target. type: fill the target (a textbox/searchbox) with value. press: press the key in value (e.g. Enter). scroll: scroll the page up or down. wait: wait for the page to load.
- role and name come from the ARIA snapshot (role "button", name "Search"). name matches as a substring, case-insensitive.
- done: the goal is reached and visible on screen. fail: the goal cannot be reached (e.g. the page is an empty placeholder or an error). Do not keep trying when nothing works.`

async function perform(page: Page, a: Action): Promise<void> {
  const t = a.target
  const loc = t?.role
    ? page.getByRole(t.role as Parameters<Page['getByRole']>[0], { name: t.name })
    : t?.text
      ? page.getByText(t.text)
      : null
  switch (a.action) {
    case 'click':
      await loc!.first().click({ timeout: 4000 })
      break
    case 'type':
      await (loc ?? page.getByRole('searchbox').or(page.getByRole('textbox'))).first().fill(a.value ?? '', { timeout: 4000 })
      break
    case 'press':
      await page.keyboard.press(a.value ?? 'Enter')
      break
    case 'scroll':
      await page.mouse.wheel(0, a.value === 'up' ? -500 : 500)
      break
    default:
      await page.waitForTimeout(1500)
  }
  await page.waitForTimeout(700)
}

export interface AgentRun { finished: 'done' | 'fail' | 'max-steps'; steps: number; reason: string; log: string[] }

export async function runAgent(page: Page, goal: string, dir: string, maxSteps = 25): Promise<AgentRun> {
  const log: string[] = []
  for (let step = 1; step <= maxSteps; step++) {
    const shot = await page.screenshot()
    writeFileSync(join(dir, `step-${String(step).padStart(2, '0')}.png`), shot)
    const snapshot = await page.locator('body').ariaSnapshot().catch(() => '(no snapshot)')
    const a = await ask(Action, {
      system: SYSTEM,
      text: `GOAL: ${goal}\n\nPrevious actions:\n${log.slice(-8).join('\n') || '(none)'}\n\nPage URL: ${page.url()}\nARIA snapshot:\n${snapshot.slice(0, 12000)}`,
      images: [shot],
    })
    log.push(`${step}. ${a.action} ${JSON.stringify(a.target ?? {})} ${a.value ?? ''} - ${a.reason}`)
    if (a.action === 'done' || a.action === 'fail') {
      writeFileSync(join(dir, 'steps.txt'), log.join('\n'))
      return { finished: a.action, steps: step, reason: a.reason, log }
    }
    try {
      await perform(page, a)
    } catch (e) {
      log[log.length - 1] += `  [FAILED: ${String(e).split('\n')[0].slice(0, 160)}]`
    }
  }
  writeFileSync(join(dir, 'steps.txt'), log.join('\n'))
  return { finished: 'max-steps', steps: maxSteps, reason: 'step limit reached', log }
}

export async function judge(page: Page, goal: string, viewport: string, dir: string): Promise<Verdict> {
  const shot = await page.screenshot()
  writeFileSync(join(dir, 'final.png'), shot)
  const snapshot = await page.locator('body').ariaSnapshot().catch(() => '(no snapshot)')
  return ask(Verdict, {
    system: `You are a strict QA reviewer of a mobile-first campus navigation web app. ${CAMPUS_CONTEXT}`,
    text: `Goal the tester tried: ${goal}\nViewport: ${viewport}\nFinal URL: ${page.url()}\nARIA snapshot:\n${snapshot.slice(0, 12000)}\n\n` +
      `Judge from the final screenshot and snapshot. Reply as JSON in a \`\`\`json fence: {"success": boolean (was the goal achieved, with real content, not a placeholder?), "usable": boolean (is the UI usable at this size: nothing cut off, overlapping or unreadable), "problems": [{"severity": "low|medium|high", "text": "..."}], "notes": "one sentence"}. ` +
      `Use severity high only for broken or unusable things (content cut off, overlapping controls, unreadable text, an empty placeholder page, errors).`,
    images: [shot],
  })
}
