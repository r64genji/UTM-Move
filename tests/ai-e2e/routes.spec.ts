// Part C: route plausibility. ~20 trips through the real app UI (URL-driven) plus the router called directly.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { loadRouterData, loadTrips, type GoldenTrip } from '../../pipeline/golden/lib.ts'
import { parsePlaces, planQuery, type RouterData } from '../../src/workers/routerApi.ts'
import { checkRoute, distanceM, lengthM, type LatLon, type OptionRow } from './lib/checks.ts'
import { ask, hasKey, SKIP_MESSAGE } from './lib/gemini.ts'
import { outDir, record, slug } from './lib/run.ts'
import { renderMap } from './lib/staticmap.ts'
import { CAMPUS_CONTEXT, FIXED_TIME } from './lib/viewports.ts'

const GOLDEN = 12
const RANDOM = 8
const PLACES = 'public/data/places.json'

interface Trip { id: string; name: string; from: LatLon; to: LatLon; fromParam: string; toParam: string; at: string; query: { from: object; to: object } }

const data: RouterData = loadRouterData()
if (existsSync(PLACES)) data.places = parsePlaces(JSON.parse(readFileSync(PLACES, 'utf8')))

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildTrips(): Trip[] {
  const golden = loadTrips()
  const step = golden.length / GOLDEN
  const picked: GoldenTrip[] = Array.from({ length: Math.min(GOLDEN, golden.length) }, (_, i) => golden[Math.floor(i * step)])
  const trips: Trip[] = picked.map((t) => ({
    id: `golden-${t.id}`, name: t.name, from: t.from, to: t.to,
    fromParam: `pt:${t.from.lat},${t.from.lon}`, toParam: `pt:${t.to.lat},${t.to.lon}`,
    at: t.at.slice(0, 16), query: { from: { lat: t.from.lat, lon: t.from.lon }, to: { lat: t.to.lat, lon: t.to.lon } },
  }))
  // Random pairs: places when places.json exists, bus stops otherwise.
  const pool = data.places.length
    ? data.places.map((p) => ({ kind: 'place' as const, id: p.id, name: p.name, location: p.location }))
    : data.transit.stops.map((s) => ({ kind: 'stop' as const, id: s.id, name: s.name, location: s.location }))
  const rnd = mulberry32(2026)
  for (let n = 0; n < RANDOM && pool.length > 1; ) {
    const a = pool[Math.floor(rnd() * pool.length)], b = pool[Math.floor(rnd() * pool.length)]
    if (a.id === b.id || distanceM(a.location, b.location) < 300 || distanceM(a.location, b.location) > 3500) continue
    const key = (p: typeof a) => (p.kind === 'place' ? { placeId: p.id } : { stopId: p.id })
    trips.push({ id: `random-${n}`, name: `${a.name} to ${b.name}`, from: a.location, to: b.location, fromParam: `${a.kind}:${a.id}`, toParam: `${b.kind}:${b.id}`, at: FIXED_TIME.slice(0, 16), query: { from: key(a), to: key(b) } })
    n++
  }
  return trips
}

const Judgement = z.object({
  verdict: z.enum(['plausible', 'questionable', 'implausible']),
  severity: z.enum(['low', 'medium', 'high']),
  problems: z.array(z.string()).default([]),
  notes: z.string().default(''),
})

test.skip(!hasKey(), SKIP_MESSAGE)

for (const trip of buildTrips()) {
  test(`C: ${trip.id} ${trip.name}`, async ({ page }, info) => {
    const viewport = info.project.name as 'mobile' | 'desktop'
    const dir = outDir('routes', viewport)
    const base = `${slug(trip.id)}`
    const when = `${trip.at}:00+08:00`
    const plan = planQuery(data, { from: trip.query.from as never, to: trip.query.to as never, when: { type: 'depart', at: when }, profile: 'fastest' })
    const options: OptionRow[] = plan.options.map((o) => ({
      kind: o.kind, durationS: o.durationS,
      legs: o.legs.map((l) => ({ kind: l.kind, departAt: l.departAt.toISOString(), arriveAt: l.arriveAt.toISOString(), geometry: l.geometry, stops: l.stops?.map((s) => ({ id: s.id, at: s.at.toISOString() })) })),
    }))
    const straightM = distanceM(trip.from, trip.to)
    const numbers = plan.options.map((o, i) => {
      const walkM = o.legs.filter((l) => l.kind === 'walk').reduce((s, l) => s + lengthM(l.geometry), 0)
      return {
        option: i + 1, kind: o.kind, durationMin: +(o.durationS / 60).toFixed(1), walkM: Math.round(walkM), straightLineM: Math.round(straightM),
        detourRatio: +(lengthM(o.legs.flatMap((l) => l.geometry)) / Math.max(distanceM(o.legs[0].geometry[0], o.legs.at(-1)!.geometry.at(-1)!), 100)).toFixed(2),
        busLegs: o.legs.filter((l) => l.kind === 'bus').map((l) => `${l.route?.name ?? l.route?.id}: ${l.stops?.[0]?.name} -> ${l.stops?.at(-1)?.name}`),
      }
    })
    const deterministic = checkRoute(trip.from, trip.to, options)

    // The real app, URL driven.
    await page.clock.setFixedTime(FIXED_TIME)
    await page.goto(`/plan?from=${encodeURIComponent(trip.fromParam)}&to=${encodeURIComponent(trip.toParam)}&when=depart&at=${trip.at}`)
    await page.waitForTimeout(3500)
    const appShot = await page.screenshot()
    writeFileSync(join(dir, `${base}-app.png`), appShot)
    const appText = (await page.locator('body').innerText()).slice(0, 4000)
    writeFileSync(join(dir, `${base}-app.txt`), appText)

    // The router's own geometry on Esri imagery, so the route is judged even before the UI draws it.
    const ends = [{ ...trip.from, color: '#22cc44' }, { ...trip.to, color: '#ff2d2d' }]
    const walkOpt = plan.options.find((o) => o.kind === 'walk')
    const busOpt = plan.options.find((o) => o.kind === 'bus')
    const walkImg = walkOpt ? await renderMap(ends, [{ path: walkOpt.legs.flatMap((l) => l.geometry), color: '#00d5ff' }]) : undefined
    const busImg = busOpt ? await renderMap(ends, busOpt.legs.map((l) => ({ path: l.geometry, color: l.kind === 'bus' ? '#ff00ff' : '#00d5ff' }))) : undefined
    if (walkImg) writeFileSync(join(dir, `${base}-walk.png`), walkImg)
    if (busImg) writeFileSync(join(dir, `${base}-bus.png`), busImg)

    const j = await ask(Judgement, {
      system: `You review routes from a campus navigation app. ${CAMPUS_CONTEXT}`,
      text: `Trip: ${trip.name}. Green dot = start, red dot = destination. Cyan line = walking, magenta line = bus ride. Image 1 is the walk-only route${busImg ? ', image 2 is the best bus option' : ''}${'' }, the last image is a screenshot of the app (it may not draw the route yet: do not judge the app UI).\n` +
        `Numbers computed from the router:\n${JSON.stringify(numbers, null, 1)}\n\nJudge plausibility: does the route follow paths and roads, no zig-zags or loops, no crossing buildings or water, sensible detour against the straight line, bus used only when it makes sense? ` +
        `Reply as JSON in a \`\`\`json fence: {"verdict": "plausible|questionable|implausible", "severity": "low|medium|high", "problems": ["..."], "notes": "one sentence"}. Use implausible with high only for clearly wrong routes.`,
      images: [...(walkImg ? [walkImg] : []), ...(busImg ? [busImg] : []), appShot],
    })
    const bad = j.verdict === 'implausible' && j.severity === 'high'
    const problems = [...deterministic, ...j.problems.map((p) => `gemini (${j.verdict}/${j.severity}): ${p}`)]
    record({
      part: 'C', viewport, name: trip.id, pass: deterministic.length === 0 && !bad,
      summary: `${trip.name}: ${numbers.map((n) => `${n.kind} ${n.durationMin} min, detour ${n.detourRatio}`).join('; ')}. ${j.notes}`,
      problems, screenshots: [`routes/${viewport}/${base}-app.png`, ...(walkImg ? [`routes/${viewport}/${base}-walk.png`] : []), ...(busImg ? [`routes/${viewport}/${base}-bus.png`] : [])],
    })
    expect(deterministic, 'deterministic route checks').toEqual([])
    expect(bad, `Gemini says implausible: ${j.problems.join('; ')}`).toBe(false)
  })
}
