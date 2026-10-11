// Compare the YAML timetable with v1 (tag v1, Backend/data/schedule.json) and explain the count.
// Run: npx tsx pipeline/transit/compare-v1.ts
import { execFileSync } from 'node:child_process'
import { buildTransit, loadSources } from './build.ts'

interface V1 {
  routes: {
    name: string
    services: { days: string[]; trips: { headsign: string; stops_sequence: string[]; times: string[] }[] }[]
  }[]
}

const v1: V1 = JSON.parse(execFileSync('git', ['show', 'v1:Backend/data/schedule.json'], { encoding: 'utf8' }))
const v2 = buildTransit(loadSources())

// Key = service days + stop sequence (consecutive duplicate stops dropped, as v2 does).
const key = (days: string[], stops: string[]) =>
  `${days.map((d) => d.slice(0, 3)).join(',')} | ${stops.filter((s, i) => s !== stops[i - 1]).join(' ')}`

const v1Times = new Map<string, string[]>()
let v1Count = 0
for (const r of v1.routes)
  for (const svc of r.services)
    for (const t of svc.trips) {
      const k = key(svc.days, t.stops_sequence)
      v1Times.set(k, [...(v1Times.get(k) ?? []), ...t.times])
      v1Count += t.times.length
    }

const v2Times = new Map<string, string[]>()
const calendarDays = new Map(v2.calendars.map((c) => [c.id, c.days]))
for (const t of v2.trips) {
  const days = calendarDays.get(t.calendarId.replace(/-except-friday-prayer$/, ''))!
  const k = key(days, t.stopTimes.map((s) => s.stopId))
  v2Times.set(k, [...(v2Times.get(k) ?? []), t.stopTimes[0].time])
}

console.log(`v1 departures: ${v1Count}`)
console.log(`v2 departures: ${v2.trips.length}`)
const minus = (a: string[], b: string[]) => {
  const rest = [...b]
  return a.filter((x) => {
    const i = rest.indexOf(x)
    if (i === -1) return true
    rest.splice(i, 1)
    return false
  })
}
for (const k of new Set([...v1Times.keys(), ...v2Times.keys()])) {
  const a = (v1Times.get(k) ?? []).sort()
  const b = (v2Times.get(k) ?? []).sort()
  const added = minus(b, a)
  const removed = minus(a, b)
  if (added.length) console.log(`  + ${added.length} only in v2 (PDF): ${added.join(' ')}  [${k}]`)
  if (removed.length) console.log(`  - ${removed.length} only in v1: ${removed.join(' ')}  [${k}]`)
}
