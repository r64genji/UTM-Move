// Gemini through OmniRoute (OpenAI chat format). Every call is cached by input hash
// under data/raw/cache/gemini/, so a re-run costs nothing.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import type { z } from 'zod'

export const MODEL = 'agy/gemini-3.8-flash-medium'
const CACHE = 'data/raw/cache/gemini'

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  // Fall back to ~/.hermes/.env without sourcing it (it is not valid shell everywhere).
  const file = `${homedir()}/.hermes/.env`
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`))
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '')
}

/** Strip ```json fences and parse the first complete JSON value (models sometimes add text after it). */
export function parseJsonReply(text: string): unknown {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const s = (m ? m[1] : text).trim()
  const start = s.search(/[[{]/)
  let depth = 0, inStr = false
  for (let i = Math.max(start, 0); i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '[' || c === '{') depth++
    else if ((c === ']' || c === '}') && --depth === 0) return JSON.parse(s.slice(start, i + 1))
  }
  return JSON.parse(s)
}

/** Ask the model for JSON matching `schema`. Cached by (model, prompt). Retries on bad JSON. */
export async function askJson<T>(prompt: string, schema: z.ZodType<T>, check?: (v: T) => string | undefined): Promise<T> {
  const key = createHash('sha256').update(`${MODEL}\n${prompt}`).digest('hex').slice(0, 24)
  const file = `${CACHE}/${key}.json`
  if (existsSync(file)) {
    const cached = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    if (cached.success) return cached.data
  }
  const base = env('OMNIROUTE_BASE_URL'), apiKey = env('OMNIROUTE_API_KEY')
  if (!base || !apiKey) throw new Error('OMNIROUTE_BASE_URL / OMNIROUTE_API_KEY not set (source ~/.hermes/.env)')
  let lastErr = ''
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: attempt === 1 ? prompt : `${prompt}\n\nReply with exactly one JSON array and nothing else.` }], temperature: attempt === 1 ? 0 : 0.3 }),
        signal: AbortSignal.timeout(600_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const text = body.choices?.[0]?.message?.content ?? ''
      const parsed = schema.safeParse(parseJsonReply(text))
      if (!parsed.success) throw new Error(`schema: ${parsed.error.message.slice(0, 500)}`)
      const problem = check?.(parsed.data)
      if (problem) throw new Error(problem)
      mkdirSync(CACHE, { recursive: true })
      writeFileSync(file, JSON.stringify(parsed.data, null, 1))
      return parsed.data
    } catch (e) {
      lastErr = String(e)
      console.error(`  llm attempt ${attempt} failed: ${lastErr.slice(0, 200)}`)
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
  throw new Error(`llm failed after retries: ${lastErr}`)
}
