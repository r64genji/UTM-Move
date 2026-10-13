import { Link, useParams } from 'react-router'
import { firstServiceDay, departuresOn, formatDate, klDateTime, minutesBetween, nextDepartures, type Departure } from '../../domain/transit/departures.ts'
import { BackButton } from '../../ui/Page.tsx'
import { BottomSheet } from '../../ui/BottomSheet.tsx'
import { routeColor } from '../transit/palette.ts'
import { countdown, FitTo, Note, StopMarkers } from '../transit/parts.tsx'
import { useNow, useTransit } from '../transit/useTransit.ts'

export function StopPage() {
  const { id = '' } = useParams()
  const { data, error } = useTransit()
  const now = useNow(30_000)
  const stop = data?.stops.find((s) => s.id === id)

  const head = (title: string, sub: string) => (
    <header className="sheet-head">
      <BackButton />
      <div>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
    </header>
  )

  if (!data || !stop) {
    return (
      <BottomSheet label="Bus stop">
        {head(`Stop ${id}`, 'Bus stop')}
        <p className="pending">{error ? 'The bus timetable could not be loaded.' : data ? 'There is no stop with this code.' : 'Loading the timetable...'}</p>
      </BottomSheet>
    )
  }

  const { date, time } = klDateTime(now)
  const distinct = (ds: Departure[]) => ds.filter((d, i) => ds.findIndex((x) => x.routeId === d.routeId && x.time === d.time && x.headsign === d.headsign) === i)
  const upcoming = distinct(nextDepartures(data, id, now, 200))
  const byRoute: [string, Departure[]][] = []
  for (const d of upcoming) {
    const group = byRoute.find(([rid]) => rid === d.routeId)
    if (group) group[1].push(d)
    else byRoute.push([d.routeId, [d]])
  }
  const later = upcoming.length === 0 ? firstServiceDay(date, (d) => departuresOn(data, id, d)) : null
  const ranToday = departuresOn(data, id, date).length > 0
  const chip = (rid: string) => (
    <Link to={`/route/${rid}`} className="route-chip" style={{ background: routeColor(rid) }}>
      {rid}
    </Link>
  )

  return (
    <>
      <StopMarkers stops={data.stops} selectedId={id} />
      <FitTo points={[stop.location]} maxZoom={17} />
      <BottomSheet label={`${stop.name} departures`}>
        {head(stop.name, `Bus stop ${stop.id}`)}
        {byRoute.map(([rid, deps]) => (
          <section key={rid} className="dep-group" aria-label={`Route ${rid}`}>
            <h2>
              {chip(rid)}
              <span>Route {rid}</span>
            </h2>
            <ul className="deps">
              {deps.slice(0, 3).map((d) => {
                const left = countdown(minutesBetween(time, d.time))
                return (
                  <li key={d.tripId}>
                    <span className="dep-to">{d.headsign}</span>
                    <time className="dep-time">{d.time}</time>
                    <span key={left} className="dep-in num-roll">
                      {left}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {upcoming.length === 0 && (
          <div className="notice" role="status">
            <strong>{ranToday ? 'No more buses today.' : `No bus service at this stop today (${formatDate(date)}).`}</strong>
            {later ? (
              <>
                <p>Next service: {formatDate(later.date)}. First buses:</p>
                <ul className="deps">
                  {distinct(later.found as Departure[]).slice(0, 5).map((d) => (
                    <li key={d.tripId}>
                      {chip(d.routeId)}
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
        <Note carried={data.timetableNote} />
      </BottomSheet>
    </>
  )
}
