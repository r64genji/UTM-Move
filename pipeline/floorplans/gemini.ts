// Gemini vision through OmniRoute (OpenAI-compatible). Calls are cached by input hash under data/raw/cache/.
// Needs OMNIROUTE_BASE_URL / OMNIROUTE_API_KEY (set -a; source ~/.hermes/.env; set +a).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { z } from 'zod'

const MODEL = 'agy/gemini-3.8-flash-medium'

export async function askImage<T extends z.ZodType>(prompt: string, img: Buffer, mime: string, schema: T): Promise<z.infer<T>> {
  const key = createHash('sha256').update(MODEL).update(prompt).update(img).digest('hex').slice(0, 24)
  const cache = `data/raw/cache/floorplan-${key}.json`
  if (existsSync(cache)) return schema.parse(JSON.parse(readFileSync(cache, 'utf8')))
  const base = process.env.OMNIROUTE_BASE_URL
  const token = process.env.OMNIROUTE_API_KEY
  if (!base || !token) throw new Error('source ~/.hermes/.env first (set -a; source ~/.hermes/.env; set +a)')
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${img.toString('base64')}` } },
          ] }],
        }),
      })
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
      const text = ((await r.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content
      const reply = schema.parse(JSON.parse(text.replace(/^[\s\S]*?```(?:json)?\s*|\s*```[\s\S]*$/g, '').trim() || text))
      mkdirSync('data/raw/cache', { recursive: true })
      writeFileSync(cache, JSON.stringify(reply))
      return reply
    } catch (e) {
      if (attempt >= 2) throw e
    }
  }
}

export async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]) }))
}
