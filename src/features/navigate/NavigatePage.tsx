import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { createNavigation, follow, startState, view, type Fix, type NavState, type Navigation, type View } from '../../domain/navigate/follow.ts'
import type { TripOption } from '../../domain/router/planTrip.ts'
import { klDateTime } from '../../domain/transit/departures.ts'
import { DESKTOP, useMedia } from '../../ui/hooks.ts'
import { Icon, type IconName } from '../../ui/icons.tsx'
import { watchLocation } from '../location/useUserLocation.ts'
import { go, setInset, trackTo } from '../map/camera.ts'
import { useMap } from '../map/MapContext.tsx'
import { MarkerLayer, RouteLayer } from '../map/layers.tsx'
import { toLngLat } from '../map/geo.ts'
import { optionToRoute, TripSteps } from '../plan-trip/TripOptions.tsx'
import { planFor } from '../plan-trip/routerClient.ts'
import { parseTrip, tripSearch } from '../plan-trip/tripParams.ts'

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10 || Math.round(m)} m`)

/** The arrow for an instruction. The text is all a maneuver carries. */
const turnIcon = (text = ''): IconName =>
  /^Arrive/.test(text) ? 'flag' : /^(Board|Get off)/.test(text) ? 'bus' : /left/i.test(text) ? 'turnLeft' : /right/i.test(text) ? 'turnRight' : /stairs/i.test(text) ? 'stairs' : 'straight'

/** The current instruction, what follows and the bus warning. Pure: give it a View. */
export function Guidance({ v, rerouting }: { v: View; rerouting?: boolean }) {
  return (
    <section className="guidance" aria-label="Guidance">
      <div className="guide-main">
        <Icon key={v.next?.text} name={v.next ? turnIcon(v.next.text) : 'flag'} size={40} className="guide-icon" />
        <div>
          <p className="guide-dist">{v.distanceToNextM < 10 ? 'Now' : `In ${metres(v.distanceToNextM)}`}</p>
          <p className="guide-now" aria-live="polite">
            <span key={v.next?.text}>{v.next?.text ?? 'Arrived'}</span>
          </p>
        </div>
      </div>
      {v.then && (
        <p className="guide-then">
          <Icon name={turnIcon(v.then.text)} size={18} />
          Then: {v.then.text}
        </p>
      )}
      {rerouting && (
        <p className="guide-alert" role="status">
          Re-routing…
        </p>
      )}
      {v.busWarning && (
        <p className="guide-alert" data-late={v.busWarning.late || undefined} role="status">
          {v.busWarning.text}
        </p>
      )}
    </section>
  )
}

/** Keep the map on the user until they pan away. */
function useFollowMap(fix: Fix | null) {
  const map = useMap()
  const [free, setFree] = useState(false)
  const arrived = useRef(false) // false until the first move onto the user, and again after they pan away
  const lastAt = useRef(0)
  useEffect(() => {
    if (!map) return
    const drag = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return
      arrived.current = false
      setFree(true)
    }
    map.on('dragstart', drag)
    return () => void map.off('dragstart', drag)
  }, [map])
  const desktop = useMedia(DESKTOP)
  // Keep the user between the guidance banner and the bottom bar (the steps list makes the bar taller).
  useEffect(() => {
    const top = document.querySelector<HTMLElement>('.nav-top')
    const bar = document.querySelector<HTMLElement>('.nav-bar')
    if (!map || desktop || !top || !bar) return
    // Layout sizes, not on-screen boxes: both slide in when the page opens, and the camera should aim at where they end up.
    const measure = () => setInset(map, { top: top.offsetTop + top.offsetHeight + 16, bottom: bar.offsetHeight + 16 }, 'follow')
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(top)
    watch.observe(bar)
    return () => {
      watch.disconnect()
      setInset(map, { top: 0, bottom: 0 })
    }
  }, [map, desktop])
  const lat = fix?.lat
  const lon = fix?.lon
  useEffect(() => {
    if (!map || free || lat === undefined || lon === undefined) return
    const now = performance.now()
    const center = toLngLat({ lat, lon })
    if (!arrived.current) {
      arrived.current = true
      go(map, { center, zoom: Math.max(map.getZoom(), 17.5) })
    } else trackTo(map, center, Math.min(1200, Math.max(300, now - lastAt.current)))
    lastAt.current = now
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
  const minutesLeft = v && Math.max(1, Math.round((v.eta.getTime() - now.getTime()) / 60_000))
  const [showSteps, setShowSteps] = useState(false)
  const legNow = nav ? Math.max(0, nav.legAt.findLastIndex((at) => at <= state.alongM)) : 0

  return (
    <article className="navigating">
      {nav && <RouteLayer legs={optionToRoute(nav.option)} />}
      {nav && last && <MarkerLayer markers={[{ id: 'to', kind: 'place', position: last.to.location, selected: true, color: '#ef4444' }]} />}
      <header className="nav-top">
        {!trip.from || !trip.to ? (
          <p className="notice notice-error" role="alert">
            <strong>No trip to follow.</strong> <Link to="/plan">Plan a trip</Link> first.
          </p>
        ) : null}
        {status === 'error' && (
          <p className="notice notice-error" role="alert">
            <strong>Navigation stopped.</strong> {error}
          </p>
        )}
        {v && !state.arrived && <Guidance v={v} rerouting={status === 'rerouting'} />}
        {state.arrived && nav && (
          <section className="guidance" aria-label="Arrived">
            <div className="guide-main">
              <Icon name="flag" size={40} className="guide-icon" />
              <p className="guide-now">You have arrived at {last!.to.name}.</p>
            </div>
          </section>
        )}
      </header>
      <footer className="nav-bar">
        {/* Always mounted so it can slide in and out; hidden from taps and screen readers while the map follows you. */}
        <button type="button" className="btn nav-recentre" data-show={(free && !state.arrived) || undefined} tabIndex={free && !state.arrived ? 0 : -1} aria-hidden={!(free && !state.arrived)} onClick={recentre}>
          <Icon name="navigate" size={18} />
          Re-centre
        </button>
        {showSteps && nav && (
          <div className="nav-steps">
            <TripSteps option={nav.option} current={state.arrived ? undefined : legNow} />
          </div>
        )}
        {v && !state.arrived && <progress max={1} value={v.progress} aria-label="Progress along the route" />}
        <div className="nav-eta">
          {v && !state.arrived ? (
            <>
              <p className="nav-min">{minutesLeft} min</p>
              <p className="muted">
                {metres(v.remainingM)} · Arrive {klDateTime(v.eta).time}
              </p>
            </>
          ) : (
            <p className="muted" role="status">
              {state.arrived ? 'Trip complete.' : status === 'planning' ? 'Finding your route…' : needsFix && status === 'waiting' ? 'Waiting for your location…' : ''}
            </p>
          )}
        </div>
        {nav && (
          <button type="button" className="btn btn-quiet" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>
            {showSteps ? 'Hide steps' : 'Steps'}
          </button>
        )}
        <Link to={{ pathname: '/plan', search: tripKey }} className="btn btn-exit">
          {state.arrived ? 'Done' : 'Exit'}
        </Link>
      </footer>
    </article>
  )
}
