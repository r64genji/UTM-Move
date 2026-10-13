import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { decodePolyline } from '../../domain/transit/polyline.ts'
import { BottomSheet } from '../../ui/BottomSheet.tsx'
import { Icon } from '../../ui/icons.tsx'
import { DESKTOP, useMedia } from '../../ui/hooks.ts'
import { useAppStore } from '../app/store.ts'
import { LocationControl } from '../location/LocationControl.tsx'
import { useGrantedLocation } from '../location/useUserLocation.ts'
import { RouteLayer, type RouteLeg } from '../map/layers.tsx'
import { routeColor } from '../transit/palette.ts'
import { CAMPUS_BOUNDS } from '../map/style.ts'
import { countdown, FitTo, StopMarkers } from '../transit/parts.tsx'
import { useNow, useTransit } from '../transit/useTransit.ts'
import { type NearbyKind, NearbyChips, NearbyMarkers, NearbyPanel, useNearbyPlaces } from './Nearby.tsx'
import { greeting, nearestStop, nextPerRoute } from './nearest.ts'

const walkMinutes = (m: number) => Math.max(1, Math.round(m / 80))

const [W, S, E, N] = CAMPUS_BOUNDS
const CAMPUS = [{ lat: S, lon: W }, { lat: N, lon: E }]

const HIDE_HINT_KEY = 'utm-hide-location-hint'

function useNearest() {
  const { data } = useTransit()
  const location = useAppStore((s) => s.location)
  const fix = location.status === 'ok' || location.status === 'low-accuracy' ? location.fix : null
  return { data, fix, near: data && fix ? nearestStop(data.stops, fix) : null }
}

function NearestStopCard({ onHide }: { onHide: () => void }) {
  const { data, near } = useNearest()
  const now = useNow(30_000)
  if (!near || !data)
    return (
      <>
        <LocationControl />
        <button type="button" className="btn-link" onClick={onHide}>
          Don&apos;t show again
        </button>
      </>
    )
  const etas = nextPerRoute(data, near.stop.id, now)
  return (
    <section className="nearest" aria-label="Nearest stop">
      <div className="nearest-head">
        <span className="nearest-icon">
          <Icon name="bus" size={20} />
        </span>
        <div className="nearest-body">
          <p className="eyebrow">
            Nearest stop · {walkMinutes(near.distanceM)} min walk
          </p>
          <h2>
            <Link to={`/stop/${encodeURIComponent(near.stop.id)}`}>{near.stop.name}</Link>
          </h2>
        </div>
        <Link to={`/plan?from=me&to=stop:${encodeURIComponent(near.stop.id)}`} className="go-btn" aria-label={`Directions to ${near.stop.name}`}>
          <Icon name="go" size={20} />
        </Link>
      </div>
      {etas.length ? (
        <ul className="etas">
          {etas.map((e) => (
            <li key={e.routeId}>
              <span className="route-chip" style={{ background: routeColor(e.routeId) }}>
                {e.routeId}
              </span>
              <span className="eta-to">{e.headsign ?? `Route ${e.routeId}`}</span>
              <span key={e.minutes} className="eta-min">
                {countdown(e.minutes)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          {Math.round(near.distanceM)} m away. No more buses today.
        </p>
      )}
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
  const [hideHint, setHideHint] = useState(() => localStorage.getItem(HIDE_HINT_KEY) === '1')
  const { near, fix } = useNearest()
  const [category, setCategory] = useState<NearbyKind | null>(null)
  const [placeId, setPlaceId] = useState<string | null>(null)
  const nearby = useNearbyPlaces(category, fix)
  // Closing a chip sends the camera back to the whole campus.
  const [overview, setOverview] = useState(false)
  const pickCategory = (c: NearbyKind | null) => {
    setCategory(c)
    setPlaceId(null)
    setOverview(c === null)
  }

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
      <RouteLayer legs={category ? [] : legs} arrows={false} />
      {overview && !category && <FitTo points={CAMPUS} />}
      {category ? <NearbyMarkers places={nearby} selectedId={placeId} from={fix} onSelect={setPlaceId} /> : <StopMarkers stops={stops} />}
      {desktop ? (
        <>
          <NearbyChips kind={category} onChange={pickCategory} />
          {category && <NearbyPanel kind={category} places={nearby} located={!!fix} selectedId={placeId} onSelect={setPlaceId} />}
          {!category && showStopsButton}
          {!category && <h1 className="section-title">Select a route</h1>}
          {!category && <ul className="route-grid">
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
          </ul>}
        </>
      ) : (
        <>
          <header className="map-top">
            <h1 className="sr-only">{greeting(now)}, Student</h1>
            <Link to="/search" className="search-pill">
              <img src="/favicon.svg" alt="" width="30" height="30" />
              <span>Find stop or location...</span>
              <Icon name="search" size={22} />
            </Link>
            <NearbyChips kind={category} onChange={pickCategory} />
            <div className="chips chips-fold" role="group" aria-label="Show routes on the map" data-folded={category ? '' : undefined} inert={!!category}>
              {showStopsButton}
              <button type="button" className="chip chip-all" aria-pressed={filter === null} onClick={() => setFilter(null)}>
                All Routes
              </button>
              {data?.routes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="chip chip-route"
                  aria-pressed={filter === r.id}
                  style={{ '--route': routeColor(r.id) } as CSSProperties}
                  onClick={() => setFilter(filter === r.id ? null : r.id)}
                >
                  <i aria-hidden="true" />
                  {r.name}
                </button>
              ))}
            </div>
          </header>
          {category ? (
            <BottomSheet label="Explore">
              <NearbyPanel kind={category} places={nearby} located={!!fix} selectedId={placeId} onSelect={setPlaceId} />
            </BottomSheet>
          ) : (near || !hideHint) && (
            <BottomSheet label="Near you">
              <NearestStopCard
                onHide={() => {
                  localStorage.setItem(HIDE_HINT_KEY, '1')
                  setHideHint(true)
                }}
              />
            </BottomSheet>
          )}
        </>
      )}
    </article>
  )
}
