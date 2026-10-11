// Stage 2: Gemini reads each floor plan into doors + public links, the plan is georeferenced to its OSM building,
// and what survives is written to data/overrides/indoor/<id>.geojson plus floor-plan evidence.
// Usage: tsx pipeline/floorplans/run.ts   (run from repo root, after triage.ts; needs ~/.hermes/.env sourced)
// Per-plan results (also the rejects, with the reason) go to data/raw/floorplans/results.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { z } from 'zod'
import { addCandidate, appendEvidence, featureCollection } from '../shortcuts/store.ts'
import { askImage } from './gemini.ts'
import { bestFit, fitOutline, toLL, toM, distToRing, type LL, type XY } from './geo.ts'

interface Plan {
  id: string
  /** png in data/raw/floorplans/png */
  file: string
  url: string
  title: string
  /** where to look for the building in OSM (m radius) */
  near: LL
  radiusM: number
  /** OSM building ids the plan may be, when the plan names the block */
  osmIds?: string[]
}
const PLANS: Plan[] = JSON.parse(readFileSync('pipeline/floorplans/plans.json', 'utf8'))

const GRID = 1000
const P = z.object({ x: z.number(), y: z.number() })
const Reply = z.object({
  building: z.string().default(''),
  level: z.string().default(''),
  outline: z.array(P).default([]),
  doors: z.array(z.object({
    id: z.string(), name: z.string().default(''), x: z.number(), y: z.number(),
    exterior: z.boolean(), public: z.boolean(), stepFree: z.boolean().default(true), confidence: z.number(),
  })).default([]),
  links: z.array(z.object({
    name: z.string().default(''), kind: z.enum(['corridor', 'lobby', 'bridge', 'stairs', 'lift']),
    from: z.string(), to: z.string(), path: z.array(P).min(2), public: z.boolean(), walkSeconds: z.number(), confidence: z.number(),
  })).default([]),
  hours: z.string().default(''),
})
const PROMPT = `You read a building floor plan for a walking-route graph. Coordinates: x and y on a 0-1000 grid over the whole image (0,0 top-left).
Reply ONLY JSON:
{"building": name/code, "level": e.g. "Ground floor",
 "outline": [corners of the OUTER WALL of the whole building on this level, in order, as {"x","y"}; only if the full outer wall is visible and drawn, else [] ],
 "doors": [{"id":"d1","name":"short label","x":..,"y":..,"exterior": true if it leads outside the building,"public": true only if any visitor may use it (lobby, main entrance, corridor door), false for labs/offices/store rooms,"stepFree": false if stairs/steps at it,"confidence":0-1}],
 "links": [{"name":"","kind":"corridor|lobby|bridge|stairs|lift","from":"door id","to":"door id","path":[{"x","y"}... centreline of the walkable route between the two doors, following the corridor, at least 2 points],"public": true only for lobbies, corridors, bridges, covered links that a visitor can walk through,"walkSeconds": estimated walking time at 1.3 m/s (estimate building scale from room sizes),"confidence":0-1}],
 "hours": "opening hours if printed on the plan, else \\"\\""}
Include only doors that are building exits or on a public route. Do not invent anything that is not drawn.`

const fc = (name: string) => JSON.parse(readFileSync(name, 'utf8'))
const buildings: { id: string; ring: LL[]; center: LL; name?: string }[] = fc('data/raw/osm/buildings.geojson').features
  .filter((f: { geometry: { type: string } }) => f.geometry.type === 'Polygon')
  .map((f: { properties: Record<string, unknown>; geometry: { coordinates: number[][][] } }) => ({
    id: String(f.properties.osm_id),
    name: (f.properties.name ?? f.properties.ref ?? f.properties['addr:housenumber']) as string | undefined,
    center: { lat: (f.properties.center as number[])[1], lon: (f.properties.center as number[])[0] },
    ring: f.geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => ({ lat, lon })),
  }))

const results: Record<string, unknown> = {}
const today = new Date().toISOString().slice(0, 10)
mkdirSync('data/overrides/indoor', { recursive: true })

for (const plan of PLANS) {
  const reject = (reason: string, extra: object = {}) => { results[plan.id] = { accepted: false, reason, ...extra }; console.log(`REJECT ${plan.id}: ${reason}`) }
  const raw = await sharp(`data/raw/floorplans/png/${plan.file}`).resize({ width: 2000, withoutEnlargement: true }).png().toBuffer()
  const meta = await sharp(raw).metadata()
  const W = meta.width!, H = meta.height!
  const r = await askImage(PROMPT, raw, 'image/png', Reply)
  const px = (p: XY): XY => ({ x: (p.x * W) / GRID, y: (p.y * H) / GRID })
  if (r.outline.length < 4) { reject('Gemini found no closed outer wall in the plan (partial or schematic drawing)', { gemini: r }); continue }
  const doors = r.doors.filter((d) => d.confidence >= 0.7)
  const cands = buildings.filter((b) => (plan.osmIds ? plan.osmIds.includes(b.id) : toM(b.center, plan.near).x ** 2 + toM(b.center, plan.near).y ** 2 < plan.radiusM ** 2))
  let best: { b: (typeof buildings)[number]; fit: ReturnType<typeof bestFit> & { fit: NonNullable<ReturnType<typeof bestFit>['fit']> } } | undefined
  const reasons: string[] = []
  for (const b of cands) {
    const o = b.center
    const ring = b.ring.map((p) => toM(p, o))
    const res = bestFit(fitOutline(r.outline.map(px), ring))
    if (res.fit && (!best || res.fit.meanM < best.fit.fit.meanM)) best = { b, fit: res as never }
    else if (!res.fit) reasons.push(res.reason!)
  }
  if (!best) { reject(`no OSM building outline matches (${cands.length} candidates; e.g. ${reasons[0] ?? 'none'})`, { gemini: r }); continue }
  const { b, fit } = best.fit ? { b: best.b, fit: best.fit.fit } : (undefined as never)
  const o = b.center
  const ring = b.ring.map((p) => toM(p, o))
  const place = (p: XY) => toLL(fit.apply(px(p)), o)
  const farDoors = doors.filter((d) => d.exterior && distToRing(fit.apply(px(d)), ring) > 6)
  if (farDoors.length) { reject(`${farDoors.length} exterior door(s) more than 6 m from the OSM outline of ${b.id}`, { gemini: r, osm: b.id }); continue }
  const hasHours = r.hours.trim().length > 0
  const hours = [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '08:00', close: '18:00' }]
  const common = { building: b.id, plan: plan.id, level: r.level, source: plan.url, access: 'public', hours, assumed: !hasHours }
  const features: unknown[] = []
  const doorsById = new Map(doors.map((d) => [d.id, d]))
  for (const d of doors.filter((x) => x.public && x.exterior)) {
    const c = place(d)
    features.push({ type: 'Feature', properties: { ...common, name: d.name || `${r.building} door`, stepFree: d.stepFree, confidence: d.confidence }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })
  }
  let links = 0
  for (const l of r.links.filter((x) => x.public && x.confidence >= 0.7 && x.kind !== 'stairs' && x.kind !== 'lift')) {
    const a = doorsById.get(l.from), z2 = doorsById.get(l.to)
    if (!a || !z2 || !a.exterior || !z2.exterior || !a.public || !z2.public) continue // only links that join two public exterior doors cross the building
    const pts = l.path.map(place)
    features.push({ type: 'Feature', properties: { ...common, name: l.name || `${r.building} ${l.kind}`, kind: 'indoor', linkKind: l.kind, walkSeconds: l.walkSeconds, stepFree: a.stepFree && z2.stepFree, confidence: l.confidence }, geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) } })
    const { id } = addCandidate({ kind: 'through-building', geometry: pts, from: a.name || undefined, to: z2.name || undefined, note: `${r.building} ${r.level}: ${l.kind}` })
    appendEvidence({ shortcutId: id, source: 'floor-plan', ref: plan.url, summary: `${plan.title}: ${l.kind} between ${a.name || a.id} and ${z2.name || z2.id}${hasHours ? '' : ' (hours assumed)'}`, url: plan.url, observedAt: today, confidence: l.confidence })
    links++
  }
  results[plan.id] = { accepted: true, osm: b.id, fit: { scale: fit.scale, rotationDeg: fit.rotationDeg, meanM: fit.meanM, maxM: fit.maxM }, doors: features.length - links, links, gemini: r }
  if (features.length) writeFileSync(`data/overrides/indoor/${plan.id}.geojson`, featureCollection(features))
  console.log(`OK ${plan.id}: ${b.id}, fit mean ${fit.meanM.toFixed(1)} m, ${features.length - links} doors, ${links} links`)
}
writeFileSync('data/raw/floorplans/results.json', JSON.stringify(results, null, 1))
