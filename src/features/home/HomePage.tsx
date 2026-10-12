import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { decodePolyline } from '../../domain/transit/polyline.ts'
import { Icon } from '../../ui/icons.tsx'
import { DESKTOP, useMedia } from '../../ui/hooks.ts'
import { useAppStore } from '../app/store.ts'
import { LocationControl } from '../location/LocationControl.tsx'
import { useGrantedLocation } from '../location/useUserLocation.ts'
import { RouteLayer, type RouteLeg } from '../map/layers.tsx'
import { routeColor } from '../transit/palette.ts'
import { StopMarkers } from '../transit/parts.tsx'
import { useNow, useTransit } from '../transit/useTransit.ts'
import { greeting, nearestStop, nextPerRoute } from './nearest.ts'

const walkMinutes = (m: number) => Math.max(1, Math.round(m / 80))

function NearestStopCard() {
  const { data } = useTransit()
  const location = useAppStore((s) => s.location)
  const now = useNow(30_000)
  const fix = location.status === 'ok' || location.status === 'low-accuracy' ? location.fix : null
  const near = data && fix ? nearestStop(data.stops, fix) : null
  if (!near || !data) return <LocationControl />
  const etas = nextPerRoute(data, near.stop.id, now)
  return (
    <section className="nearest" aria-label="Nearest stop">
      <span className="nearest-icon">
        <Icon name="pin" size={20} />
      </span>
      <div className="nearest-body">
        <p className="eyebrow">Nearest Stop</p>
        <h2>
          <Link to={`/stop/${encodeURIComponent(near.stop.id)}`}>{near.stop.name}</Link>
        </h2>
        {etas.length ? (
          <ul className="etas">
            {etas.map((e) => (
              <li key={e.routeId}>
                <span className="eta-route" style={{ color: routeColor(e.routeId), background: `${routeColor(e.routeId)}20`, borderColor: `${routeColor(e.routeId)}40` }}>
                  {e.routeId}
                </span>
                {e.headsign && <span className="eta-to">{e.headsign}</span>}
                <span>: {e.minutes} min</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            {Math.round(near.distanceM)} m, about {walkMinutes(near.distanceM)} min walk. No more buses today.
          </p>
        )}
      </div>
      <Link to={`/plan?from=me&to=stop:${encodeURIComponent(near.stop.id)}`} className="go-btn" aria-label={`Directions to ${near.stop.name}`}>
        <Icon name="go" size={18} />
      </Link>
    </section>
  )
}

export function HomePage() {
  const desktop = useMedia(DESKTOP)
  const { data } = useTransit()
  const now = useNow(60_000)
  const showStops = useAppStore((s) => s.showStops)
  const setShowStops = useAppStore((s) => s.setShowStops)
  const [filter, setFilter] = useState<string | null>(null)

  useGrantedLocation()

  const legs = useMemo<RouteLeg[]>(
    () =>
      (data?.patterns ?? [])
        .filter((p) => !filter || p.routeId === filter)
        .map((p) => ({ mode: 'bus' as const, path: decodePolyline(p.shape), color: routeColor(p.routeId), routeId: p.routeId })),
    [data, filter],
  )
  const stops = showStops || filter ? (data?.stops ?? []).filter((s) => !filter || data!.patterns.some((p) => p.routeId === filter && p.stopIds.includes(s.id))) : []

  const showStopsButton = (
    <button type="button" className="chip chip-stops" aria-pressed={showStops} onClick={() => setShowStops(!showStops)}>
      <Icon name={showStops ? 'eye' : 'eyeOff'} size={18} />
      {desktop ? (showStops ? 'Hide All Stops' : 'Show All Stops') : 'Stops'}
    </button>
  )

  return (
    <article className="home">
      <RouteLayer legs={legs} arrows={false} />
      <StopMarkers stops={stops} />
      {desktop ? (
        <>
          {showStopsButton}
          <h1 className="section-title">Select a route</h1>
          <ul className="route-grid">
            {data?.routes.map((r) => (
              <li key={r.id}>
                <Link to={`/route/${r.id}`} className="route-tile">
                  <span className="route-tile-name">
                    {r.name}
                    <i style={{ background: routeColor(r.id) }} />
                  </span>
                  <span className="muted">{data.patterns.find((p) => p.routeId === r.id)?.headsign}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <header className="home-head">
            <h1>{greeting(now)}, Student</h1>
            <p>Where do you want to go today?</p>
            <Link to="/search" className="home-search">
              <Icon name="search" size={20} />
              Find stop or location...
            </Link>
          </header>
          <NearestStopCard />
          <div className="chips" role="group" aria-label="Show routes on the map">
            {showStopsButton}
            <button type="button" className="chip chip-all" aria-pressed={filter === null} onClick={() => setFilter(null)}>
              All Routes
            </button>
            {data?.routes.map((r) => (
              <button
                key={r.id}
                type="button"
                className="chip"
                aria-pressed={filter === r.id}
                style={filter === r.id ? { background: routeColor(r.id), borderColor: routeColor(r.id) } : undefined}
                onClick={() => setFilter(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </>
      )}
    </article>
  )
}
