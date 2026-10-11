// First-pass review of flagged rows by the agent (#11), so the user only has to check, not start from zero.
// `npx tsx pipeline/places/agent-review.ts [--write]`
// Sends each flagged row without a decision, with its neighbours, to the model for a careful second look.
// Prints the proposals; with --write, saves them to data/overrides/places.yaml with `by: agent`.
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { Category, type LatLon } from '../../src/domain/schemas.ts'
import { distanceM } from './geo.ts'
import { loadBuildings } from './merge.ts'
import { askJson } from './llm.ts'
import { Decision, loadOverrides, saveOverrides } from './overrides.ts'
import type { Row } from './clean.ts'

const Proposal = z.object({
  id: z.string(),
  action: z.enum(['keep', 'fix', 'drop', 'merge']),
  name: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  aliases: z.array(z.string()).nullable().default(null),
  mergeInto: z.string().nullable().default(null),
  note: z.string(),
})

const RULES = `You are the careful second reviewer of a campus place list for a navigation app for Universiti Teknologi Malaysia (UTM),
Johor Bahru. A first pass flagged the rows below. The user's top priority: NO weird entries (junk names, private homes, businesses
with no walk-in place on campus, duplicates, pins in wrong spots, people's names, closed places). When in doubt, drop.

For each row decide one action:
- keep: the first pass is right as it is (name, category, keep/drop/merge). Only if the row is clearly a real, findable campus place
  (or the first pass's merge is clearly right; then use merge).
- fix: it is a real campus place but the name / category / aliases need changing. Give the full corrected name, category and aliases.
- drop: not a real findable campus place, a private home, a person, a company/agency without a walk-in place, closed, a duplicate
  whose place already exists under another name nearby (or merge instead), or the pin is clearly not where the place is.
- merge: the row is the same real place as one of the "nearby" rows; mergeInto = that id. Never merge two different buildings,
  two hostel blocks, or a shop/cafe/surau into the building it is in.
Flags explained: "pin moves N m" = merging would move the pin that far (big moves usually mean the merge is wrong);
"confidence" = the first pass was unsure; "same name as" = two kept rows share a name (drop or rename one, or merge if same);
"pin N m from any building" = a Google pin for an indoor place far from any building (often a wrong pin or a home business);
"only N Google reviews" = a business known only to Google with almost no reviews: often a home business, an online seller, or a
stall that has closed; keep it only if the name and building clearly show a real walk-in shop or cafe on campus (in an arcade,
food court, student mall, faculty), drop it when it sits in a hostel block or nowhere;
"pin in block X but name says Y" = the pin is in a different building than the name says: fix the name if the name is wrong,
or drop when the pin is likely wrong (you cannot move pins).
Category must be one of ${Category.options.map((c) => JSON.stringify(c)).join(', ')}.
note: one short sentence in English saying why.
Reply with only a JSON array, one object per row, same ids, in order:
[{"id":"...","action":"keep|fix|drop|merge","name":null,"category":null,"aliases":null,"mergeInto":null,"note":"..."}]`

const rows: Row[] = JSON.parse(readFileSync('data/raw/places/cleaned.json', 'utf8'))
const flagged: Row[] = JSON.parse(readFileSync('data/raw/review/flagged.json', 'utf8'))
const overrides = loadOverrides()
const todo = flagged.filter((r) => !overrides[r.id])
const live = rows.filter((r) => !r.clean.should_drop)

const show = (r: Row) => ({
  id: r.id,
  first_pass: { name: r.clean.name, aliases: r.clean.aliases, category: r.clean.category, drop: r.clean.should_drop,
    merge_with: r.clean.merge_with, confidence: r.clean.confidence, reason: r.clean.reason },
  flags: r.flags,
  source_names: r.members.map((m) => `${m.name} [${m.src}${m.gcat ? `: ${m.gcat}` : ''}]`),
  ...(r.buildingName ? { inside_building: r.buildingName } : {}),
  nearby: live.filter((x) => x.id !== r.id && distanceM(x.location, r.location) < 200)
    .sort((a, b) => distanceM(a.location, r.location) - distanceM(b.location, r.location)).slice(0, 12)
    .map((x) => ({ id: x.id, name: x.clean.name, m: Math.round(distanceM(x.location, r.location)), ...(x.buildingName ? { building: x.buildingName } : {}) })),
})

const out: z.infer<typeof Proposal>[] = []
for (let i = 0; i < todo.length; i += 20) {
  const chunk = todo.slice(i, i + 20)
  const res = await askJson(`${RULES}\n\nRows:\n${chunk.map((r) => JSON.stringify(show(r))).join('\n')}`, z.array(Proposal),
    (ps) => (chunk.every((r) => ps.some((p) => p.id === r.id)) ? undefined : 'missing ids'))
  out.push(...res.filter((p) => chunk.some((r) => r.id === p.id)))
}
writeFileSync('data/raw/review/agent-proposals.json', JSON.stringify(out, null, 1))
for (const p of out) {
  const r = rows.find((x) => x.id === p.id)!
  console.log(`${p.id}\t${p.action}\t${r.clean.name} -> ${p.name ?? ''} ${p.category ?? ''} ${p.mergeInto ?? ''}\t${p.note}`)
}
// A pin in the wrong block, when the named block exists close by, moves to that block.
const buildings = loadBuildings()
function movedPin(r: Row): LatLon | undefined {
  const m = r.flags.map((f) => f.match(/^pin in block \S+ but name says (\S+)$/)).find(Boolean)
  const b = m && buildings.find((b) => b.blockCode === m[1] && distanceM(b.center, r.location) < 300)
  return b ? b.center : undefined
}

if (process.argv.includes('--write')) {
  for (const p of out) {
    const r = rows.find((x) => x.id === p.id)!
    const location = p.action === 'keep' || p.action === 'fix' ? movedPin(r) : undefined
    const fix = p.action === 'fix' || !!location
    const d = Decision.parse({
      action: fix ? 'fix' : p.action, by: 'agent', note: location ? `${p.note} Pin moved to the named block.` : p.note,
      ...(fix ? { name: p.name ?? r.clean.name, category: [p.category, r.clean.category].find((c) => Category.safeParse(c).success) ?? 'Other', aliases: p.aliases ?? r.clean.aliases } : {}),
      ...(location ? { location: { lat: +location.lat.toFixed(6), lon: +location.lon.toFixed(6) } } : {}),
      ...(p.action === 'merge' ? { mergeInto: p.mergeInto } : {}),
    })
    overrides[p.id] = d
  }
  saveOverrides(overrides)
  console.log(`wrote ${out.length} agent decisions to data/overrides/places.yaml`)
}
