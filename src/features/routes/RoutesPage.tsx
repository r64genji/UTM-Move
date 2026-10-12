import { useState } from 'react'
import { Link } from 'react-router'
import { klDateTime, nextDate, tripsOn } from '../../domain/transit/departures.ts'
import type { Route, TransitData, Trip } from '../../domain/schemas.ts'
import { Icon } from '../../ui/icons.tsx'
import { Page, Pending } from '../../ui/Page.tsx'
import { routeColor } from '../transit/palette.ts'
import { useNow, useTransit } from '../transit/useTransit.ts'

type Kind = 'weekday' | 'weekend'

const isWeekend = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay())
}

/** Today if it is the right kind of day, otherwise the next day that is. */
export function dayOfKind(today: string, kind: Kind) {
  let date = today
  while (isWeekend(date) !== (kind === 'weekend')) date = nextDate(date)
  return date
}

const first = (t: Trip) => t.stopTimes[0].time

export type RouteSummary = { status: 'Active' | 'Service Ended' | 'Not Today' | null; next?: Trip; headsign?: string }

/** What a route card shows: the next bus (or the first of the day), where it goes, and whether the route still runs today. */
export function summarize(data: TransitData, route: Route, date: string, today: { date: string; time: string }): RouteSummary {
  const trips = tripsOn(data, date)
    .filter((t) => t.routeId === route.id)
    .sort((a, b) => first(a).localeCompare(first(b)))
  const isToday = date === today.date
  const next = isToday ? trips.find((t) => first(t) >= today.time) : trips[0]
  const trip = next ?? trips[0]
  const headsign = (trip && data.patterns.find((p) => p.id === trip.patternId)?.headsign) ?? trip?.headsign ?? data.patterns.find((p) => p.routeId === route.id)?.headsign
  const status = !isToday ? null : !trips.length ? 'Not Today' : next ? 'Active' : 'Service Ended'
  return { status, next, headsign }
}

export function RoutesPage() {
  const { data, error } = useTransit()
  const now = useNow(30_000)
  const [kind, setKind] = useState<Kind>(() => (isWeekend(klDateTime(new Date()).date) ? 'weekend' : 'weekday'))
  const today = klDateTime(now)
  const date = dayOfKind(today.date, kind)

  return (
    <Page
      title="All Routes"
      back={false}
      action={
        <Link to="/info" className="icon-btn" aria-label="About the timetable">
          <Icon name="info" />
        </Link>
      }
    >
      <div className="segmented" role="tablist" aria-label="Day type">
        {(['weekday', 'weekend'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {k === 'weekday' ? 'Weekday' : 'Weekend'}
          </button>
        ))}
      </div>
      {!data && <Pending>{error ? 'The bus timetable could not be loaded.' : 'Loading the timetable...'}</Pending>}
      <ul className="cards">
        {data?.routes.map((r) => {
          const color = routeColor(r.id)
          const s = summarize(data, r, date, today)
          return (
            <li key={r.id}>
              <Link to={`/route/${r.id}?on=${date}`} className="card route-card">
                <span className="route-icon" style={{ background: `${color}20`, color }}>
                  <Icon name="bus" />
                </span>
                <span className="route-card-body">
                  <span className="route-card-title">
                    <strong>{r.name}</strong>
                    {s.status && <span className="status" data-status={s.status}>{s.status}</span>}
                  </span>
                  <span className="muted">{s.headsign ?? 'View Schedule'}</span>
                </span>
                {s.next && (
                  <time className="next-badge" style={{ color, background: `${color}15`, borderColor: `${color}30` }} aria-label={`Next bus ${first(s.next)}`}>
                    {first(s.next)}
                  </time>
                )}
                <Icon name="chevron" className="chev" />
              </Link>
            </li>
          )
        })}
      </ul>
    </Page>
  )
}
