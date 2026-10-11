// Gemini through the OmniRoute gateway (OpenAI chat format). Plain fetch, replies cached by input hash.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { z } from 'zod'

export const MODEL = 'agy/gemini-3.8-flash-medium'
const CACHE_DIR = 'data/raw/cache/ai-e2e'

export const hasKey = () => !!process.env.OMNIROUTE_API_KEY
export const SKIP_MESSAGE =
  'ai-e2e skipped: OMNIROUTE_API_KEY is not set. Run `set -a; source ~/.hermes/.env; set +a` first (OmniRoute gateway).'

export interface Prompt {
  system?: string
  text: string
  /** PNG or JPEG bytes. */
  images?: Buffer[]
}

const sniff = (b: Buffer) => (b[0] === 0xff ? 'image/jpeg' : 'image/png')

export function buildMessages(p: Prompt) {
  const content: unknown[] = [{ type: 'text', text: p.text }]
  for (const img of p.images ?? []) content.push({ type: 'image_url', image_url: { url: `data:${sniff(img)};base64,${img.toString('base64')}` } })
  return [...(p.system ? [{ role: 'system', content: p.system }] : []), { role: 'user', content }]
}

/** Take the JSON out of a ```json fence (or bare JSON) and parse it. */
export function parseJsonReply(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply)
  return JSON.parse((fenced ? fenced[1] : reply).trim())
}

async function chat(messages: unknown[]): Promise<string> {
  const base = process.env.OMNIROUTE_BASE_URL ?? 'http://127.0.0.1:20128/v1'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0 }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`OmniRoute ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('OmniRoute returned no content')
  return content
}

/** Ask Gemini for JSON matching `schema`. Cached under data/raw/cache/ai-e2e/; AI_E2E_FRESH=1 skips reads. */
export async function ask<T>(schema: z.ZodType<T>, prompt: Prompt): Promise<T> {
  const messages = buildMessages(prompt)
  const key = createHash('sha256').update(MODEL).update(JSON.stringify(messages)).digest('hex')
  const file = join(CACHE_DIR, `${key}.json`)
  if (process.env.AI_E2E_FRESH !== '1' && existsSync(file)) {
    const hit = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    if (hit.success) return hit.data
  }
  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const msgs = attempt === 0 ? messages : [...messages, { role: 'user', content: `Your last reply was invalid (${lastError}). Reply with only valid JSON in a \`\`\`json fence.` }]
    try {
      const parsed = schema.safeParse(parseJsonReply(await chat(msgs)))
      if (parsed.success) {
        mkdirSync(CACHE_DIR, { recursive: true })
        writeFileSync(file, JSON.stringify(parsed.data))
        return parsed.data
      }
      lastError = parsed.error.message.slice(0, 300)
    } catch (e) {
      lastError = String(e).slice(0, 300)
      if (String(e).includes('OmniRoute')) throw e
    }
  }
  throw new Error(`Gemini gave no valid JSON after 3 tries: ${lastError}`)
}
