import { Link, useParams } from 'react-router'
import { firstServiceDay, departuresOn, formatDate, klDateTime, minutesBetween, nextDepartures, type Departure } from '../../domain/transit/departures.ts'
import { Page, Pending } from '../../ui/Page.tsx'
import { countdown, FitTo, Note, StopMarkers } from '../transit/parts.tsx'
import { useNow, useTransit } from '../transit/useTransit.ts'

export function StopPage() {
  const { id = '' } = useParams()
  const { data, error } = useTransit()
  const now = useNow(30_000)
  const stop = data?.stops.find((s) => s.id === id)

  if (!data || !stop) {
    return (
      <Page title={stop?.name ?? `Stop ${id}`} kicker="Bus stop">
        <Pending>{error ? 'The bus timetable could not be loaded.' : data ? 'There is no stop with this code.' : 'Loading the timetable...'}</Pending>
      </Page>
    )
  }

  const { date, time } = klDateTime(now)
  const distinct = (ds: Departure[]) => ds.filter((d, i) => ds.findIndex((x) => x.routeId === d.routeId && x.time === d.time && x.headsign === d.headsign) === i)
  const upcoming = distinct(nextDepartures(data, id, now, 200))
  const routeName = (rid: string) => data.routes.find((r) => r.id === rid)
  const byRoute: [string, Departure[]][] = []
  for (const d of upcoming) {
    const group = byRoute.find(([rid]) => rid === d.routeId)
    if (group) group[1].push(d)
    else byRoute.push([d.routeId, [d]])
  }
  const later = upcoming.length === 0 ? firstServiceDay(date, (d) => departuresOn(data, id, d)) : null
  const ranToday = departuresOn(data, id, date).length > 0

  return (
    <Page title={stop.name} kicker={`Bus stop ${stop.id}`}>
      <StopMarkers stops={data.stops} selectedId={id} />
      <FitTo points={[stop.location]} maxZoom={17} />
      <Note carried={data.timetableNote} />
      {byRoute.map(([rid, deps]) => (
        <section key={rid} className="dep-group" aria-label={`Route ${rid}`}>
          <h2>
            <Link to={`/route/${rid}`} className="route-chip" style={{ background: routeName(rid)?.color }}>
              {rid}
            </Link>
            <span>Route {rid}</span>
          </h2>
          <ul className="deps">
            {deps.slice(0, 3).map((d) => (
              <DepartureRow key={d.tripId} d={d} min={minutesBetween(time, d.time)} />
            ))}
          </ul>
        </section>
      ))}
      {upcoming.length === 0 && (
        <div className="no-service" role="status">
          <strong>{ranToday ? 'No more buses today.' : `No bus service at this stop today (${formatDate(date)}).`}</strong>
          {later ? (
            <>
              <p>Next service: {formatDate(later.date)}. First buses:</p>
              <ul className="deps">
                {distinct(later.found as Departure[]).slice(0, 5).map((d) => (
                  <li key={d.tripId}>
                    <Link to={`/route/${d.routeId}`} className="route-chip" style={{ background: routeName(d.routeId)?.color }}>
                      {d.routeId}
                    </Link>
                    <span className="dep-to">{d.headsign}</span>
                    <time className="dep-time">{d.time}</time>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>The timetable has no later service days. A new timetable has not been added yet.</p>
          )}
        </div>
      )}
    </Page>
  )
}

function DepartureRow({ d, min }: { d: Departure; min: number }) {
  return (
    <li>
      <span className="dep-to">{d.headsign}</span>
      <time className="dep-time">{d.time}</time>
      <span className="dep-in">{countdown(min)}</span>
    </li>
  )
}
