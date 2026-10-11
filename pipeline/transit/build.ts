// Build public/data/transit.json from data/transit/*.yaml.
// Run: npm run build:transit
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { z } from 'zod'
import { HHMM, ISODate, Stop, TransitData, Weekday } from '../../src/domain/schemas.ts'
import type { Calendar, Pattern, Route, Trip } from '../../src/domain/schemas.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
export const TRANSIT_DIR = join(ROOT, 'data/transit')
const OUT_FILE = join(ROOT, 'public/data/transit.json')

/**
 * Seconds a bus waits at each stop between the first and the last. The PDF caps it: route G runs
 * KTR -> FKT (12 middle stops, 638 s of driving) in 15 min in the morning, so the mean wait is under 22 s.
 */
export const DWELL_SECS = 15

const Id = z.string().min(1)

export const StopsFile = z.strictObject({ stops: z.array(Stop) })

export const RouteFile = z.strictObject({
  id: Id,
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  patterns: z.record(
    Id,
    z.strictObject({
      headsign: z.string().min(1),
      stops: z.array(Id).min(2),
      driveSecs: z.array(z.number().positive()),
      shape: z.string().min(1),
    }),
  ),
  buses: z.array(
    z.strictObject({
      id: Id,
      page: z.number().int().positive(),
      service: Id,
      departures: z.record(Id, z.array(HHMM).min(1)),
    }),
  ),
})

export const CalendarFile = z.strictObject({
  session: z.strictObject({ start: ISODate, end: ISODate }),
  services: z.record(Id, z.array(Weekday).min(1)),
  fridayPrayerGap: z.strictObject({ from: HHMM, to: HHMM }),
  publicHolidays: z.array(z.strictObject({ date: ISODate, name: z.string().min(1) })),
  semesterBreaks: z.array(
    z.strictObject({ from: ISODate, to: ISODate, kind: z.enum(['mid', 'final']), name: z.string().min(1) }),
  ),
})

export interface TransitSources {
  stops: z.infer<typeof StopsFile>
  calendar: z.infer<typeof CalendarFile>
  routes: z.infer<typeof RouteFile>[]
}

function readYaml<T>(schema: z.ZodType<T>, file: string): T {
  const result = schema.safeParse(parse(readFileSync(file, 'utf8')))
  if (!result.success) throw new Error(`${file}:\n${z.prettifyError(result.error)}`)
  return result.data
}

export function loadSources(dir = TRANSIT_DIR): TransitSources {
  const routeFiles = readdirSync(dir).filter((f) => /^route-.+\.yaml$/.test(f)).sort()
  return {
    stops: readYaml(StopsFile, join(dir, 'stops.yaml')),
    calendar: readYaml(CalendarFile, join(dir, 'calendar.yaml')),
    routes: routeFiles.map((f) => readYaml(RouteFile, join(dir, f))),
  }
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Calendar id for trips that skip the Friday prayer gap. */
const noFriday = (service: string) => `${service}-except-friday-prayer`

function buildCalendars(cal: TransitSources['calendar']): Calendar[] {
  const noService = new Set([
    ...cal.publicHolidays.map((h) => h.date),
    ...cal.semesterBreaks.filter((b) => b.kind === 'final').flatMap((b) => datesBetween(b.from, b.to)),
  ])
  const exceptions = [...noService]
    .filter((d) => d >= cal.session.start && d <= cal.session.end)
    .sort()
    .map((date) => ({ date, type: 'removed' as const }))
  const base = { startDate: cal.session.start, endDate: cal.session.end, exceptions }
  return Object.entries(cal.services).flatMap(([id, days]) => {
    const own: Calendar = { id, days, ...base }
    if (!days.includes('fri')) return [own]
    return [own, { id: noFriday(id), days: days.filter((d) => d !== 'fri'), ...base }]
  })
}

export function buildTransit(src: TransitSources): TransitData {
  const stopIds = new Set(src.stops.stops.map((s) => s.id))
  const gap = src.calendar.fridayPrayerGap
  const routes: Route[] = []
  const patterns: Pattern[] = []
  const trips: Trip[] = []

  for (const r of src.routes) {
    routes.push({ id: r.id, name: r.name, color: r.color })
    for (const [pid, p] of Object.entries(r.patterns)) {
      if (p.driveSecs.length !== p.stops.length - 1) throw new Error(`${r.id}/${pid}: driveSecs needs one entry per hop`)
      for (const s of p.stops) if (!stopIds.has(s)) throw new Error(`${r.id}/${pid}: unknown stop ${s}`)
      patterns.push({ id: `${r.id}:${pid}`, routeId: r.id, headsign: p.headsign, stopIds: p.stops, shape: p.shape })
    }
    for (const bus of r.buses) {
      const days = src.calendar.services[bus.service]
      if (!days) throw new Error(`${r.id}/${bus.id}: unknown service ${bus.service}`)
      for (const [pid, times] of Object.entries(bus.departures)) {
        const p = r.patterns[pid]
        if (!p) throw new Error(`${r.id}/${bus.id}: unknown pattern ${pid}`)
        // seconds after the first-stop departure at which the bus reaches each stop
        const offsets = p.stops.map((_, i) => p.driveSecs.slice(0, i).reduce((a, b) => a + b, 0) + DWELL_SECS * Math.max(0, i - 1))
        for (const time of times) {
          const dep = toMin(time)
          const inGap = days.includes('fri') && dep >= toMin(gap.from) && dep < toMin(gap.to)
          trips.push({
            id: `${r.id}:${bus.id}:${bus.service}:${pid}:${time.replace(':', '')}`,
            routeId: r.id,
            calendarId: inGap ? noFriday(bus.service) : bus.service,
            headsign: p.headsign,
            patternId: `${r.id}:${pid}`,
            stopTimes: p.stops.map((stopId, i) => ({ stopId, time: toHHMM(dep + Math.round(offsets[i] / 60)) })),
          })
        }
      }
    }
  }

  return TransitData.parse({
    stops: src.stops.stops,
    routes,
    patterns,
    calendars: buildCalendars(src.calendar),
    trips,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildTransit(loadSources())
  mkdirSync(dirname(OUT_FILE), { recursive: true })
  const json = JSON.stringify(data)
  writeFileSync(OUT_FILE, json)
  const byService: Record<string, number> = {}
  for (const t of data.trips) {
    const service = t.calendarId.replace(/-except-friday-prayer$/, '')
    byService[service] = (byService[service] ?? 0) + 1
  }
  console.log(`wrote ${OUT_FILE} (${(json.length / 1024).toFixed(1)} KB)`)
  console.log(`stops ${data.stops.length}, routes ${data.routes.length}, patterns ${data.patterns.length}`)
  console.log(`departures ${data.trips.length} (${Object.entries(byService).map(([k, n]) => `${k} ${n}`).join(', ')})`)
  console.log(`  skipped on Fridays (prayer gap): ${data.trips.filter((t) => t.calendarId.endsWith('-except-friday-prayer')).length}`)
}
