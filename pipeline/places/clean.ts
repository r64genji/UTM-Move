// #10: Gemini cleanup of merged candidates + the check script that flags rows for review.
// `npx tsx pipeline/places/clean.ts` runs merge + clean + check and writes
// data/raw/places/cleaned.json and data/raw/review/flagged.json.
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { Category, type LatLon } from '../../src/domain/schemas.ts'
import { distanceM, inRing, loadBoundary } from './geo.ts'
import { askJson } from './llm.ts'
import { blockCode, build as mergeAll, jaccard, tokens, type Candidate } from './merge.ts'
import { loadOverrides, type Overrides } from './overrides.ts'

export const CleanRow = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  category: z.string(),
  merge_with: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
  should_drop: z.boolean(),
  reason: z.string().default(''),
})
export type CleanRow = z.infer<typeof CleanRow>

export interface Row extends Candidate {
  clean: CleanRow
  flags: string[]
}

const BATCH = 80
/** Categories that live inside a building; a Google pin far from any building is suspect. */
const WALK_IN = new Set(['Faculty/Academic', 'Lab/Workshop', 'Library', 'Food', 'Admin/Office', 'Health', 'Bank/ATM', 'Shop/Service', 'Hall/Event'])

/** What Gemini sees for one candidate. No coordinates beyond 5 decimals, no review text. */
function promptRow(c: Candidate) {
  const names = [...new Set(c.members.map((m) => m.name))]
  const gcats = [...new Set(c.members.map((m) => m.gcat).filter(Boolean))]
  const tags = Object.assign({}, ...c.members.map((m) => m.tags ?? {}))
  return {
    id: c.id,
    names,
    sources: [...new Set(c.members.map((m) => m.src))],
    ...(gcats.length ? { google_category: gcats } : {}),
    ...(Object.keys(tags).length ? { osm_tags: tags } : {}),
    ...(c.members.some((m) => m.status) ? { google_status: c.members.map((m) => m.status).filter(Boolean) } : {}),
    ...(c.buildingName && !names.includes(c.buildingName) ? { inside_building: c.buildingName } : {}),
    ...(c.blockCode ? { block_code: c.blockCode } : {}),
    ...(c.near ? { near: c.near } : {}),
    lat: +c.location.lat.toFixed(5),
    lon: +c.location.lon.toFixed(5),
  }
}

export const RULES = `You clean the place list for a campus navigation app for Universiti Teknologi Malaysia (UTM), Johor Bahru (Skudai) campus.
Students and visitors search this list to walk somewhere. The user's top priority: NO weird entries. Be strict.

A row is a REAL CAMPUS PLACE when a student or visitor would walk to it: a faculty or school, a named campus building or block
(block codes like N28a, M22, G30, S43, T05, K06, L50 are real UTM buildings; hostel blocks belong to residential colleges),
a residential college, a lecture hall or auditorium, a library, a notable named lab or research centre that has its own space,
a cafe / cafeteria / food court / restaurant / food stall that operates on campus, a surau or mosque, a sports facility (field,
court, stadium, gym, pool), an admin office that serves students or visitors (bursary, registrar, HEMA, security, a college office),
a clinic, a bank or ATM, a shop or service (photocopy, mini market, bookshop, post office, laundry), an event hall, a named parking
lot, a campus gate, a lake / park / plaza that people visit.

Set should_drop=true (with a short reason) when the row is any of:
- a private home, staff house, warden's or Vice-Chancellor's residence, or a person's own address;
- a person's name (a lecturer, a "Dr ..."'s office, a personal page) or a person's room;
- a business that only has an address at UTM but no place a visitor walks into: companies, startups, consultancies, agencies,
  online shops, home-based sellers, event organisers, clubs or societies with no own building, NGOs, tuition / training brands;
- permanently or temporarily closed (google_status says closed);
- the whole university as one row, or something not on the UTM Johor Bahru campus;
- something that cannot be found on the ground from its name alone: "Parking lot", "Cafe", "Unnamed", single rooms (a store room,
  meeting room, server room, a numbered room), floors, lifts, toilets, bins, trees, substations, tanks, shelters, benches,
  assembly points, roads, bus stops (bus stops come from separate transit data);
- a duplicate of the whole residential college when the row is just a sub-unit with no own location.
When unsure whether a business or office is a real walk-in place, keep it only if the name clearly says what it is AND it is a
campus facility; otherwise drop with lower confidence.

For kept rows:
- name: a clean display name, as people on campus say it. Title Case, but keep acronyms (UTM, FKE, KTDI, PSZ, ATM, CIMB) and Malay
  names as they are. Remove ", Universiti Teknologi Malaysia", "UTM Johor Bahru", "Skudai", addresses and postcodes. Do not invent
  facts. Prefer the official name if one of the names is clearly official. Do not put the block code in the name unless the row is
  only a block (then: "Block M22, KTDI" style, using the residential college or faculty from the names, near, inside_building, or
  neighbouring rows in this batch; if you do not know it, use "Block M22").
- A parking lot is kept only when it says whose it is or has a code ("Parking FKE", "J01 parking lot", "KDOJ Parking" ->
  "Parking, FKE", "Parking J01", "Parking, KDOJ"). Unnamed "Car Park" / "Parking lot" rows are dropped.
- A generic facility name must be made unique with where it is: "Futsal Court, KTDI", "Surau, Faculty of Computing",
  "Cafe, Kolej Perdana". If you cannot tell where it is, drop it.
- aliases: short forms people search for: acronyms (KTDI, FKE, PSZ), the block code (N28a), the Malay or English name. No
  duplicates of name, max 6.
- category: exactly one of ${Category.options.map((c) => JSON.stringify(c)).join(', ')}.
- merge_with: if this row is the same real place as ANOTHER row in this batch, the id of the row that should stay (pick the row with
  the building / best name). Otherwise null. Do not merge a shop/cafe/surau with the building it is in. Do not merge two hostel
  blocks.

confidence: 0..1, how sure you are about the whole decision (keep/drop, name, category, merge). Use < 0.7 when unsure.
reason: a few words, always in English.

Reply with only a JSON array, one object per input row, same ids, in the same order:
[{"id":"...","name":"...","aliases":["..."],"category":"...","merge_with":null,"confidence":0.9,"should_drop":false,"reason":"..."}]`

export async function cleanAll(cands: Candidate[]): Promise<Map<string, CleanRow>> {
  // Spatial batches: one or more per ~500 m cell, so neighbours and duplicates land together and a new
  // scrape row only changes (and re-sends) its own cell's batch.
  const cells = new Map<string, Candidate[]>()
  for (const c of cands.filter((c) => !c.drop)) {
    const k = `${Math.floor(c.location.lat / 0.0045)}:${Math.floor(c.location.lon / 0.0045)}`
    cells.set(k, [...(cells.get(k) ?? []), c])
  }
  const batches: Candidate[][] = []
  for (const [, cs] of [...cells].sort(([a], [b]) => a.localeCompare(b))) {
    cs.sort((a, b) => a.location.lat - b.location.lat || a.id.localeCompare(b.id))
    const n = Math.ceil(cs.length / BATCH)
    for (let i = 0; i < n; i++) batches.push(cs.slice(Math.floor((i * cs.length) / n), Math.floor(((i + 1) * cs.length) / n)))
  }
  const out = new Map<string, CleanRow>()
  let next = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < batches.length) {
      const i = next++, batch = batches[i]
      const ids = batch.map((c) => c.id)
      const prompt = `${RULES}\n\nRows:\n${batch.map((c) => JSON.stringify(promptRow(c))).join('\n')}`
      const rows = await askJson(prompt, z.array(CleanRow), (rs) => {
        const got = new Set(rs.map((r) => r.id))
        const missing = ids.filter((id) => !got.has(id))
        return missing.length ? `missing ids: ${missing.slice(0, 5).join(', ')}` : undefined
      })
      for (const r of rows) if (ids.includes(r.id)) out.set(r.id, r)
      console.log(`  gemini batch ${i + 1}/${batches.length} ok`)
    }
  }))
  return out
}

/** Flag rows a human (or the agent review) must look at. Rows with an override are never flagged. */
export function check(rows: Row[], ring: LatLon[], overrides: Overrides): Row[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const r of rows) {
    const f: string[] = []
    const c = r.clean
    // A dropped row goes nowhere, so its merge (and pin move) does not matter.
    const target = !c.should_drop && c.merge_with && c.merge_with !== r.id ? byId.get(c.merge_with) : undefined
    const loc = target?.location ?? r.location
    const gPins = r.members.filter((m) => m.src === 'gosom').map((m) => m.location)
    const moved = c.should_drop ? 0 : Math.max(0, ...gPins.map((p) => distanceM(p, loc)), target ? distanceM(r.location, loc) : 0)
    if (moved > 30) f.push(`pin moves ${Math.round(moved)} m`)
    if (!inRing(loc, ring)) f.push('outside boundary')
    if (!(Category.options as readonly string[]).includes(c.category)) f.push(`unknown category "${c.category}"`)
    if (!c.should_drop && c.merge_with && c.merge_with !== r.id && !target) f.push(`merge target ${c.merge_with} not found`)
    if (target?.clean.should_drop) f.push('merge target is dropped')
    if (target && r.buildingId && target.buildingId && r.buildingId !== target.buildingId) f.push('merge joins two buildings')
    if (!c.should_drop && r.tag === 'google-only' && r.buildingDistM > 40 && WALK_IN.has(c.category)) f.push(`pin ${r.buildingDistM} m from any building`)
    const reviews = Math.max(0, ...r.members.map((m) => m.reviews ?? 0))
    if (!c.should_drop && r.tag === 'google-only' && reviews < 3 && ['Food', 'Shop/Service', 'Other'].includes(c.category)) f.push(`only ${reviews} Google reviews`)
    const named = [c.name, ...r.members.map((m) => m.name)].map(blockCode).find(Boolean)
    if (!c.should_drop && named && r.buildingCode && named !== r.buildingCode) f.push(`pin in block ${r.buildingCode} but name says ${named}`)
    if (c.confidence < 0.7) f.push(`confidence ${c.confidence}`)
    r.flags = f
  }
  // Two kept places with the same name are confusing in search.
  const kept = rows.filter((r) => !r.clean.should_drop && !(r.clean.merge_with && r.clean.merge_with !== r.id))
  const byName = new Map<string, Row[]>()
  for (const r of kept) { const k = tokens(r.clean.name).join(' '); byName.set(k, [...(byName.get(k) ?? []), r]) }
  for (const [, rs] of byName) if (rs.length > 1) for (const r of rs) r.flags.push(`same name as ${rs.filter((x) => x !== r).map((x) => x.id).join(', ')}`)
  for (const r of rows) if (overrides[r.id]) r.flags = []
  return rows.filter((r) => r.flags.length)
}

const PairVerdict = z.object({
  a: z.string(), b: z.string(), same: z.boolean(), keep: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1), reason: z.string().default(''),
})

const DEDUPE_RULES = `You check a campus place list (Universiti Teknologi Malaysia, Johor Bahru) for duplicates.
Each line is a pair of places that are close together with similar names. Decide if both rows are the SAME real place
(the same faculty, the same cafe, the same court, the same building), only named differently (Malay vs English, short vs long name).
Different hostel blocks, a shop inside a building vs the building, two different courts of the same sport with different
letters/numbers, or a faculty vs one of its labs are NOT the same.
If same, keep = the id whose name is the better display name (official, complete). confidence 0..1. reason: a few words.
Reply with only a JSON array, one object per pair, in order: [{"a":"...","b":"...","same":true,"keep":"...","confidence":0.9,"reason":"..."}]`

/** Second Gemini pass across batches: close rows with overlapping names or aliases. */
export async function dedupe(rows: Row[]): Promise<void> {
  const live = rows.filter((r) => !r.clean.should_drop && !(r.clean.merge_with && r.clean.merge_with !== r.id))
  const keys = (r: Row) => new Set([r.clean.name, ...r.clean.aliases, ...r.members.map((m) => m.name)].map((n) => tokens(n).join(' ')).filter(Boolean))
  const pairs: [Row, Row][] = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]
      if (distanceM(a.location, b.location) > 300) continue
      const ka = keys(a), kb = keys(b)
      const shared = [...ka].some((k) => kb.has(k))
      if (shared || jaccard(a.clean.name, b.clean.name) >= 0.5) pairs.push([a, b])
    }
  }
  const show = (r: Row) => ({ id: r.id, name: r.clean.name, aliases: r.clean.aliases, category: r.clean.category,
    ...(r.buildingName ? { building: r.buildingName } : {}) })
  // Chunk by ~500 m cell so a change in one area only re-sends that area's pairs.
  const cell = (r: Row) => `${Math.floor(r.location.lat / 0.0045)}:${Math.floor(r.location.lon / 0.0045)}`
  const byCell = new Map<string, [Row, Row][]>()
  for (const p of pairs) byCell.set(cell(p[0]), [...(byCell.get(cell(p[0])) ?? []), p])
  const chunks = [...byCell].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, ps]) => {
    ps.sort((x, y) => `${x[0].id}${x[1].id}`.localeCompare(`${y[0].id}${y[1].id}`))
    return Array.from({ length: Math.ceil(ps.length / 60) }, (_, i) => ps.slice(i * 60, i * 60 + 60))
  })
  for (const chunk of chunks) {
    const prompt = `${DEDUPE_RULES}\n\nPairs:\n${chunk.map(([a, b]) => JSON.stringify({ a: show(a), b: show(b), distance_m: Math.round(distanceM(a.location, b.location)) })).join('\n')}`
    const verdicts = await askJson(prompt, z.array(PairVerdict), (vs) => vs.length === chunk.length ? undefined : `expected ${chunk.length} verdicts, got ${vs.length}`)
    verdicts.forEach((v, k) => {
      const [a, b] = chunk[k]
      if (!v.same) return
      const keep = v.keep === b.id ? b : a, gone = keep === a ? b : a
      if (gone.clean.merge_with && gone.clean.merge_with !== gone.id) return
      gone.clean = { ...gone.clean, merge_with: keep.id, confidence: Math.min(gone.clean.confidence, v.confidence), reason: `duplicate: ${v.reason}` }
    })
  }
  console.log(`  dedupe: ${pairs.length} pairs checked`)
}

export async function run() {
  const merged = mergeAll()
  const clean = await cleanAll(merged.candidates)
  const rows: Row[] = merged.candidates.filter((c) => !c.drop).map((c) => ({ ...c, clean: clean.get(c.id)!, flags: [] }))
  await dedupe(rows)
  const flagged = check(rows, loadBoundary(), loadOverrides())
  mkdirSync('data/raw/review', { recursive: true })
  writeFileSync('data/raw/places/cleaned.json', JSON.stringify(rows, null, 1))
  writeFileSync('data/raw/review/flagged.json', JSON.stringify(flagged, null, 1))
  return { merged, rows, flagged }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { rows, flagged } = await run()
  const drop = rows.filter((r) => r.clean.should_drop)
  console.log(`rows: ${rows.length}  gemini drop: ${drop.length}  merged away: ${rows.filter((r) => r.clean.merge_with && r.clean.merge_with !== r.id).length}  flagged: ${flagged.length}`)
}
