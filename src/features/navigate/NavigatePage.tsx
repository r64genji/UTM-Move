import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { createNavigation, follow, startState, view, type Fix, type NavState, type Navigation, type View } from '../../domain/navigate/follow.ts'
import type { TripOption } from '../../domain/router/planTrip.ts'
import { klDateTime } from '../../domain/transit/departures.ts'
import { Page } from '../../ui/Page.tsx'
import { watchLocation } from '../location/useUserLocation.ts'
import { useMap } from '../map/MapContext.tsx'
import { MarkerLayer, RouteLayer } from '../map/layers.tsx'
import { toLngLat } from '../map/geo.ts'
import { optionToRoute } from '../plan-trip/TripOptions.tsx'
import { planFor } from '../plan-trip/routerClient.ts'
import { parseTrip, tripSearch } from '../plan-trip/tripParams.ts'

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10 || Math.round(m)} m`)

/** The current instruction, what follows, bus warning, progress. Pure: give it a View. */
export function Guidance({ v, rerouting }: { v: View; rerouting?: boolean }) {
  return (
    <section className="guidance" aria-label="Guidance">
      {rerouting && (
        <p className="no-service" role="status">
          Re-routing…
        </p>
      )}
      <p className="guide-dist">{v.distanceToNextM < 10 ? 'Now' : `In ${metres(v.distanceToNextM)}`}</p>
      <p className="guide-now" aria-live="polite">
        {v.next?.text ?? 'Arrived'}
      </p>
      {v.then && <p className="guide-then">Then: {v.then.text}</p>}
      {v.busWarning && (
        <p className={v.busWarning.late ? 'no-service' : 'pending'} role="status">
          {v.busWarning.text}
        </p>
      )}
      <progress max={1} value={v.progress} aria-label="Progress along the route" />
      <p className="list-code">
        {metres(v.remainingM)} left · Arrive {klDateTime(v.eta).time}
      </p>
    </section>
  )
}

/** Keep the map on the user until they pan away. */
function useFollowMap(fix: Fix | null) {
  const map = useMap()
  const [free, setFree] = useState(false)
  useEffect(() => {
    if (!map) return
    const drag = (e: { originalEvent?: unknown }) => e.originalEvent && setFree(true)
    map.on('dragstart', drag)
    return () => void map.off('dragstart', drag)
  }, [map])
  const lat = fix?.lat
  const lon = fix?.lon
  useEffect(() => {
    if (map && !free && lat !== undefined && lon !== undefined) {
      map.easeTo({ center: toLngLat({ lat, lon }), zoom: Math.max(map.getZoom(), 17), duration: 600 })
    }
  }, [map, free, lat, lon])
  return { free, recentre: () => setFree(false) }
}

type Status = 'waiting' | 'planning' | 'ready' | 'rerouting' | 'error'

export function NavigatePage() {
  const [params] = useSearchParams()
  const trip = parseTrip(params)
  const tripKey = tripSearch(trip)
  const opt = Number(params.get('opt')) || 0
  const needsFix = trip.from?.kind === 'me' || trip.to?.kind === 'me'

  const [status, setStatus] = useState<Status>('waiting')
  const [error, setError] = useState('')
  const [nav, setNav] = useState<Navigation | null>(null)
  const [state, setState] = useState<NavState>(startState)
  const [fix, setFix] = useState<Fix | null>(null)
  const [now, setNow] = useState(() => new Date())
  const live = useRef({ nav: null as Navigation | null, state: startState, rerouting: false })
  const gotFirst = useRef(false)

  // Plan from the first fix (for "me") or at once, then follow every fix.
  useEffect(() => {
    const t = parseTrip(new URLSearchParams(tripKey))
    const replan = async (from: Fix | null) => {
      const resolved = from && t.from?.kind === 'me' ? { ...t, from: { kind: 'point', lat: from.lat, lon: from.lon } as const } : t
      const at = t.when.type === 'now' ? new Date() : new Date(`${t.when.time}:00+08:00`)
      const plan = await planFor(resolved, from, at)
      return plan.options[Math.min(opt, plan.options.length - 1)]
    }
    const install = (option: TripOption) => {
      const n = createNavigation(option)
      live.current.nav = n
      live.current.state = startState
      setNav(n)
      setState(startState)
    }
    const fail = (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Planning failed.')
      setStatus('error')
    }
    const plan = (from: Fix | null) => {
      setStatus('planning')
      replan(from)
        .then((o) => {
          if (!o) throw new Error('No route found.')
          install(o)
          setStatus('ready')
        })
        .catch(fail)
    }
    if (!needsFix && t.from && t.to) plan(null)

    const stop = watchLocation((f) => {
      setFix(f)
      setNow(new Date(f.t))
      if (!live.current.nav) {
        if (needsFix && !gotFirst.current && t.from && t.to) {
          gotFirst.current = true
          plan(f)
        }
        return
      }
      const r = follow(live.current.nav, live.current.state, f)
      live.current.state = r.state
      setState(r.state)
      for (const e of r.events) {
        if (e.type === 'reroute' && !live.current.rerouting) {
          // Same destination and route type, planned from where the user is now.
          live.current.rerouting = true
          setStatus('rerouting')
          planFor({ ...t, from: { kind: 'point', lat: e.from.lat, lon: e.from.lon }, when: { type: 'now' } }, null, new Date())
            .then((p) => {
              if (!p.options[0]) throw new Error('No route found from here.')
              install(p.options[0])
              setStatus('ready')
            })
            .catch(fail)
            .finally(() => (live.current.rerouting = false))
        }
      }
    })
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, opt])

  const { free, recentre } = useFollowMap(fix)
  const v = nav ? view(nav, state, now) : null
  const last = nav?.option.legs[nav.option.legs.length - 1]

  return (
    <Page title="Navigate">
      {nav && <RouteLayer legs={optionToRoute(nav.option)} />}
      {nav && last && <MarkerLayer markers={[{ id: 'to', kind: 'place', position: last.to.location, selected: true }]} />}

      {status === 'waiting' && needsFix && <p className="pending" role="status">Waiting for your location…</p>}
      {!trip.from || !trip.to ? (
        <p className="no-service" role="alert">
          <strong>No trip to follow.</strong> <Link to="/plan">Plan a trip</Link> first.
        </p>
      ) : null}
      {status === 'planning' && <p className="pending" role="status">Finding your route…</p>}
      {status === 'error' && (
        <p className="no-service" role="alert">
          <strong>Navigation stopped.</strong> {error}
        </p>
      )}
      {v && !state.arrived && <Guidance v={v} rerouting={status === 'rerouting'} />}
      {free && !state.arrived && (
        <button type="button" className="btn btn-quiet" onClick={recentre}>
          Re-centre
        </button>
      )}

      {state.arrived && nav && (
        <section className="guidance" aria-label="Arrived">
          <p className="guide-now">You have arrived at {last!.to.name}.</p>
        </section>
      )}
    </Page>
  )
}
