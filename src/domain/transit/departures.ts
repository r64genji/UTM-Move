import type { Calendar, TransitData, Trip, Weekday } from '../schemas.ts'

export const TIME_ZONE = 'Asia/Kuala_Lumpur'

export interface Departure {
  tripId: string
  routeId: string
  patternId?: string
  headsign?: string
  /** HH:MM, Asia/Kuala_Lumpur wall clock. */
  time: string
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const klParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The Kuala Lumpur date (YYYY-MM-DD) and time (HH:MM) of an instant, whatever the device time zone. */
export function klDateTime(at: Date): { date: string; time: string } {
  const p = Object.fromEntries(klParts.formatToParts(at).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** Does this service calendar run on this date (YYYY-MM-DD)? */
export function runsOn(calendar: Calendar, date: string): boolean {
  const exception = calendar.exceptions.find((e) => e.date === date)
  if (exception) return exception.type === 'added'
  return date >= calendar.startDate && date <= calendar.endDate && calendar.days.includes(weekdayOf(date))
}

/** Every trip that runs on a date (YYYY-MM-DD). */
export function tripsOn(data: TransitData, date: string): Trip[] {
  const running = new Set(data.calendars.filter((c) => runsOn(c, date)).map((c) => c.id))
  return data.trips.filter((t) => running.has(t.calendarId))
}

/** Every departure from a stop on a date (YYYY-MM-DD), sorted by time. A trip's last stop is not a departure. */
export function departuresOn(data: TransitData, stopId: string, date: string): Departure[] {
  const out: Departure[] = []
  for (const trip of tripsOn(data, date)) {
    const i = trip.stopTimes.findIndex((st) => st.stopId === stopId)
    if (i === -1 || i === trip.stopTimes.length - 1) continue
    out.push({
      tripId: trip.id,
      routeId: trip.routeId,
      patternId: trip.patternId,
      headsign: trip.headsign,
      time: trip.stopTimes[i].time,
    })
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.routeId.localeCompare(b.routeId))
}

/** The next departures from a stop at or after an instant, same Kuala Lumpur day only. */
export function nextDepartures(data: TransitData, stopId: string, at: Date, limit = 10): Departure[] {
  const { date, time } = klDateTime(at)
  return departuresOn(data, stopId, date)
    .filter((d) => d.time >= time)
    .slice(0, limit)
}

/** The date after `date` (YYYY-MM-DD). */
export function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** The first date after `after` (up to a year ahead) on which `find` returns something, with that result. */
export function firstServiceDay<T>(after: string, find: (date: string) => T[]): { date: string; found: T[] } | null {
  let date = after
  for (let i = 0; i < 366; i++) {
    date = nextDate(date)
    const found = find(date)
    if (found.length) return { date, found }
  }
  return null
}

/** Minutes between two HH:MM times on the same day. */
export const minutesBetween = (from: string, to: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  return m(to) - m(from)
}

/** Long date for UI text, e.g. "Tuesday 17 March". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)))
}
