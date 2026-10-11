// Pure helpers for ticket #14: areas, claim parsing/validation, place matching, quote checks.
import { z } from 'zod'
import { ISODate, type LatLon, ShortcutKind } from '../../src/domain/schemas.ts'

export interface Place { id: string; name: string; aliases?: string[]; category: string; location: LatLon; entrances?: LatLon[] }
export interface Area { id: string; name: string; center: LatLon; places: string[] }

// ---------- areas ----------

const PRIORITY = ['Library', 'Faculty/Academic', 'Prayer', 'Hall/Event', 'Admin/Office', 'Residential college', 'Sport', 'Lab/Workshop', 'Food', 'Shop/Service', 'Health', 'Bank/ATM', 'Gate/Entrance', 'Other', 'Parking']
const rank = (p: Place) => PRIORITY.indexOf(p.category) + (/^(Block|Surau|Pejabat|Balai|Zeolite)\b/.test(p.name) ? 20 : 0)
const metres = (a: LatLon, b: LatLon) => Math.hypot((a.lat - b.lat) * 111_195, (a.lon - b.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180))

/** Deterministic k-means (farthest-point init) over places; each cluster is one research area. */
export function buildAreas(places: Place[], k: number): Area[] {
  const pts = places.filter((p) => p.category !== 'Parking')
  const centers: LatLon[] = [pts[0].location]
  while (centers.length < k) {
    let best = pts[0], bestD = -1
    for (const p of pts) {
      const d = Math.min(...centers.map((c) => metres(c, p.location)))
      if (d > bestD) { bestD = d; best = p }
    }
    centers.push(best.location)
  }
  let groups: Place[][] = []
  for (let iter = 0; iter < 25; iter++) {
    groups = centers.map(() => [])
    for (const p of pts) {
      let bi = 0, bd = Infinity
      centers.forEach((c, i) => { const d = metres(c, p.location); if (d < bd) { bd = d; bi = i } })
      groups[bi].push(p)
    }
    groups.forEach((g, i) => {
      if (g.length) centers[i] = { lat: g.reduce((s, p) => s + p.location.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.location.lon, 0) / g.length }
    })
  }
  const areas = groups
    .map((g, i) => ({ g, c: centers[i] }))
    .filter(({ g }) => g.length)
    .map(({ g, c }) => {
      const sorted = [...g].sort((a, b) => rank(a) - rank(b) || metres(c, a.location) - metres(c, b.location) || a.name.localeCompare(b.name))
      return { name: sorted[0].name, center: c, places: sorted.slice(0, 14).map((p) => p.name) }
    })
    .sort((a, b) => b.center.lat - a.center.lat || a.center.lon - b.center.lon)
  const seen = new Map<string, number>()
  return areas.map((a, i) => {
    const n = (seen.get(a.name) ?? 0) + 1
    seen.set(a.name, n)
    return { id: `area-${String(i + 1).padStart(2, '0')}`, ...a, name: n > 1 ? `${a.name} (${n})` : a.name }
  })
}

// ---------- claims ----------

const TYPES: Record<string, z.infer<typeof ShortcutKind>> = {
  'covered walkway': 'covered-walkway', 'covered-walkway': 'covered-walkway', walkway: 'covered-walkway', 'laluan berbumbung': 'covered-walkway',
  stairs: 'stairs', stair: 'stairs', staircase: 'stairs', tangga: 'stairs',
  'through-building': 'through-building', 'through building': 'through-building', 'through the building': 'through-building',
  footpath: 'footpath', path: 'footpath', pedestrian: 'footpath', 'pedestrian path': 'footpath', trail: 'footpath',
  bridge: 'bridge', 'foot bridge': 'bridge', footbridge: 'bridge', 'pedestrian bridge': 'bridge',
}

export const RawClaim = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  type: z.string().transform((t, ctx) => {
    const kind = TYPES[t.trim().toLowerCase()]
    if (!kind) ctx.addIssue({ code: 'custom', message: `unknown type "${t}"` })
    return kind as z.infer<typeof ShortcutKind>
  }),
  url: z.url().refine((u) => /^https?:/.test(u), 'url must be http(s)'),
  quote: z.string().trim().min(1).max(200),
  date: ISODate.optional(),
})
export type RawClaim = z.infer<typeof RawClaim>

export const HermesReply = z.object({
  claims: z.array(z.unknown()).default([]),
  pagesChecked: z.array(z.string()).default([]),
  floorplans: z.array(z.object({ url: z.url(), title: z.string().optional() })).default([]),
})

/** Validate each claim on its own; bad ones are returned with the reason instead of throwing. */
export function parseClaims(raw: unknown[]): { ok: RawClaim[]; rejected: { reason: string; raw: unknown }[] } {
  const ok: RawClaim[] = [], rejected: { reason: string; raw: unknown }[] = []
  for (const r of raw) {
    const p = RawClaim.safeParse(r)
    if (p.success) ok.push(p.data)
    else rejected.push({ reason: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), raw: r })
  }
  return { ok, rejected }
}

/** Plain text of an HTML page: drop scripts and tags, decode a few entities. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’`]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** True when the quote (ignoring case, punctuation, whitespace; "..." splits it into pieces that must all appear) is in the page text. */
export function quoteInText(quote: string, text: string): boolean {
  const hay = norm(text)
  const pieces = quote.split(/\.\.\.|…/).map(norm).filter((s) => s.length >= 12)
  return pieces.length > 0 && pieces.every((p) => hay.includes(p))
}

/** Find a place by exact (normalised) name or alias. */
export function findPlace(name: string, places: Place[]): Place | undefined {
  const n = norm(name)
  return places.find((p) => norm(p.name) === n) ?? places.find((p) => (p.aliases ?? []).some((a) => norm(a) === n))
}

export const MIN_LINE_M = 15
export const MAX_LINE_M = 700

/** Straight line between the two closest entrances (or centres) of the places. Undefined when too close or too far to be a shortcut. */
export function lineBetween(a: Place, b: Place): LatLon[] | undefined {
  const pa = a.entrances?.length ? a.entrances : [a.location]
  const pb = b.entrances?.length ? b.entrances : [b.location]
  let best: LatLon[] | undefined, bd = Infinity
  for (const x of pa) for (const y of pb) { const d = metres(x, y); if (d < bd) { bd = d; best = [x, y] } }
  return bd >= MIN_LINE_M && bd <= MAX_LINE_M ? best : undefined
}
