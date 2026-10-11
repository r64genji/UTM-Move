import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { decodePolyline } from '../../domain/transit/polyline.ts'
import { firstServiceDay, formatDate, klDateTime, tripsOn } from '../../domain/transit/departures.ts'
import type { Trip } from '../../domain/schemas.ts'
import { Page, Pending } from '../../ui/Page.tsx'
import { RouteLayer } from '../map/layers.tsx'
import { FitTo, Note, StopMarkers } from '../transit/parts.tsx'
import { useNow, useTransit } from '../transit/useTransit.ts'

const first = (t: Trip) => t.stopTimes[0].time

export function RoutePage() {
  const { id = '' } = useParams()
  const { data, error } = useTransit()
  const now = useNow(30_000)
  const [picked, setPicked] = useState<{ pattern?: string; trip?: string }>({})
  const route = data?.routes.find((r) => r.id === id)

  if (!data || !route) {
    return (
      <Page title={`Route ${id}`} kicker="Campus bus">
        <Pending>{error ? 'The bus timetable could not be loaded.' : data ? 'There is no route with this letter.' : 'Loading the timetable...'}</Pending>
      </Page>
    )
  }

  const patterns = data.patterns.filter((p) => p.routeId === id)
  const pattern = patterns.find((p) => p.id === picked.pattern) ?? patterns[0]
  const { date, time } = klDateTime(now)
  const dayTrips = (d: string) => tripsOn(data, d).filter((t) => t.patternId === pattern.id).sort((a, b) => first(a).localeCompare(first(b)))
  const today = dayTrips(date)
  const remaining = today.filter((t) => first(t) >= time)
  // Today while buses remain; otherwise the next service day.
  const later = remaining.length ? null : firstServiceDay(date, dayTrips)
  const shownDate = remaining.length ? date : (later?.date ?? date)
  const trips = remaining.length ? today : ((later?.found as Trip[] | undefined) ?? [])
  const next = remaining.length ? remaining[0] : trips[0]
  const trip = trips.find((t) => t.id === picked.trip) ?? next
  const stopOf = (sid: string) => data.stops.find((s) => s.id === sid)
  const line = decodePolyline(pattern.shape)
  const patternStops = pattern.stopIds.map(stopOf).filter((s) => !!s)

  return (
    <Page title={route.name} kicker="Campus bus">
      <RouteLayer legs={[{ mode: 'bus', path: line, color: route.color ?? '#7a1f2b', routeId: id }]} />
      <StopMarkers stops={patternStops} />
      <FitTo points={line} maxZoom={16} />
      <Note />
      {patterns.length > 1 && (
        <label className="pick">
          Direction
          <select className="field" value={pattern.id} onChange={(e) => setPicked({ pattern: e.target.value })}>
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.headsign}
              </option>
            ))}
          </select>
        </label>
      )}
      {trip ? (
        <>
          {!remaining.length ? (
            <p className="no-service" role="status">
              <strong>{today.length ? 'No more buses today.' : 'No service on this route today.'}</strong> Next service: {formatDate(shownDate)}.
            </p>
          ) : null}
          <label className="pick">
            Trip
            <select className="field" value={trip.id} onChange={(e) => setPicked({ pattern: pattern.id, trip: e.target.value })}>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {first(t)} from {stopOf(t.stopTimes[0].stopId)?.name}
                </option>
              ))}
            </select>
          </label>
          <ol className="stop-times">
            {trip.stopTimes.map((st) => (
              <li key={st.stopId}>
                <Link to={`/stop/${encodeURIComponent(st.stopId)}`}>{stopOf(st.stopId)?.name ?? st.stopId}</Link>
                <time>{st.time}</time>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="no-service" role="status">
          <strong>No service on this route.</strong> The timetable has no later days for it.
        </p>
      )}
    </Page>
  )
}
