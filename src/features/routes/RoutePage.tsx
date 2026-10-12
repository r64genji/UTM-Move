import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { decodePolyline } from '../../domain/transit/polyline.ts'
import { firstServiceDay, formatDate, klDateTime, tripsOn } from '../../domain/transit/departures.ts'
import type { Trip } from '../../domain/schemas.ts'
import { BackButton } from '../../ui/Page.tsx'
import { BottomSheet } from '../../ui/BottomSheet.tsx'
import { Icon } from '../../ui/icons.tsx'
import { RouteLayer } from '../map/layers.tsx'
import { routeColor } from '../transit/palette.ts'
import { FitTo, Note, StopMarkers } from '../transit/parts.tsx'
import { useNow, useTransit } from '../transit/useTransit.ts'

const first = (t: Trip) => t.stopTimes[0].time

const PARTS = [
  { key: 'Morning', until: '12:00' },
  { key: 'Afternoon', until: '17:00' },
  { key: 'Evening', until: '24:00' },
]

export function RoutePage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { data, error } = useTransit()
  const now = useNow(30_000)
  const [picked, setPicked] = useState<{ pattern?: string; trip?: string }>({})
  const [schedule, setSchedule] = useState(false)
  const route = data?.routes.find((r) => r.id === id)
  const head = (title: string) => (
    <header className="bar bar-map">
      <BackButton />
      <h1>{title}</h1>
      <span className="bar-gap" />
    </header>
  )

  if (!data || !route) {
    return (
      <article className="route-page">
        {head(`Route ${id}`)}
        <BottomSheet label="Route">
          <p className="pending">{error ? 'The bus timetable could not be loaded.' : data ? 'There is no route with this letter.' : 'Loading the timetable...'}</p>
        </BottomSheet>
      </article>
    )
  }

  const color = routeColor(route.id, route.color)
  const patterns = data.patterns.filter((p) => p.routeId === id)
  const pattern = patterns.find((p) => p.id === picked.pattern) ?? patterns[0]
  const { date, time } = klDateTime(now)
  const viewDate = params.get('on') ?? date
  const dayTrips = (d: string) => tripsOn(data, d).filter((t) => t.patternId === pattern.id).sort((a, b) => first(a).localeCompare(first(b)))
  const today = dayTrips(viewDate)
  const remaining = viewDate === date ? today.filter((t) => first(t) >= time) : today
  // The chosen day while buses remain; otherwise the next service day.
  const later = remaining.length ? null : firstServiceDay(viewDate, dayTrips)
  const shownDate = remaining.length ? viewDate : (later?.date ?? viewDate)
  const trips = remaining.length ? today : ((later?.found as Trip[] | undefined) ?? [])
  const next = remaining.length ? remaining[0] : trips[0]
  const trip = trips.find((t) => t.id === picked.trip) ?? next
  const stopOf = (sid: string) => data.stops.find((s) => s.id === sid)
  const line = decodePolyline(pattern.shape)
  const patternStops = pattern.stopIds.map(stopOf).filter((s) => !!s)

  return (
    <article className="route-page">
      <RouteLayer legs={[{ mode: 'bus', path: line, color, routeId: id }]} />
      <StopMarkers stops={patternStops} />
      <FitTo points={line} maxZoom={16} />
      {head(route.name)}
      <BottomSheet label={`${route.name} timetable`}>
        {patterns.length > 1 && (
          <div className="segmented segmented-scroll" role="radiogroup" aria-label="Direction">
            {patterns.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === pattern.id} onClick={() => setPicked({ pattern: p.id })}>
                {p.headsign}
              </button>
            ))}
          </div>
        )}
        {trip ? (
          <>
            <div className="next-bus">
              <p className="eyebrow">
                {trip === next ? 'Next bus' : 'Selected trip'}
                {remaining.length === 0 && <span className="status" data-status="Service Ended">No more buses</span>}
              </p>
              <p className="next-time" style={{ color }}>
                <time>{first(trip)}</time>
                <span className="muted">Departing · {trip.stopTimes.length} stops</span>
              </p>
            </div>
            {remaining.length === 0 && (
              <p className="notice" role="status">
                <strong>{today.length ? 'No more buses today.' : 'No service on this route today.'}</strong> Next service: {formatDate(shownDate)}.
              </p>
            )}
            <button type="button" className="btn btn-primary btn-wide" aria-expanded={schedule} onClick={() => setSchedule(!schedule)}>
              {schedule ? 'Hide Full Schedule' : 'View Full Schedule'}
            </button>
            {schedule && (
              <div className="times">
                {PARTS.map((part, i) => {
                  const ts = trips.filter((t) => first(t) < part.until && (i === 0 || first(t) >= PARTS[i - 1].until))
                  return (
                    ts.length > 0 && (
                      <section key={part.key} aria-label={part.key}>
                        <h2>
                          {part.key} <span className="count">{ts.length}</span>
                        </h2>
                        <div className="time-grid">
                          {ts.map((t) => (
                            <button key={t.id} type="button" aria-pressed={t.id === trip.id} onClick={() => setPicked({ pattern: pattern.id, trip: t.id })}>
                              {first(t)}
                            </button>
                          ))}
                        </div>
                      </section>
                    )
                  )
                })}
              </div>
            )}
            <ol className="timeline" aria-label="Stops">
              {trip.stopTimes.map((st, i) => (
                <li key={st.stopId} style={{ '--line': color } as CSSProperties}>
                  <span className="dot">{i === 0 && <Icon name="bus" size={18} />}</span>
                  <Link to={`/stop/${encodeURIComponent(st.stopId)}`}>{stopOf(st.stopId)?.name ?? st.stopId}</Link>
                  <time>{st.time}</time>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="notice" role="status">
            <strong>No service on this route.</strong> The timetable has no later days for it.
          </p>
        )}
        <Note carried={data.timetableNote} />
      </BottomSheet>
    </article>
  )
}
