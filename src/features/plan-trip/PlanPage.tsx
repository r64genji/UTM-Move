import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Plan } from '../../domain/router/planTrip.ts'
import { klDateTime, tripsOn } from '../../domain/transit/departures.ts'
import { Page } from '../../ui/Page.tsx'
import { useAppStore } from '../app/store.ts'
import { LocationControl } from '../location/LocationControl.tsx'
import { MarkerLayer, RouteLayer } from '../map/layers.tsx'
import { FitTo } from '../transit/parts.tsx'
import { useTransit } from '../transit/useTransit.ts'
import { PlacePicker } from './PlacePicker.tsx'
import { OptionDetail, OptionList, optionToRoute } from './TripOptions.tsx'
import { planFor } from './routerClient.ts'
import { parseTrip, tripSearch, type Profile, type Trip } from './tripParams.ts'

const PROFILES: { id: Profile; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'sheltered', label: 'Sheltered' },
  { id: 'no-stairs', label: 'No stairs' },
]

const WHEN = [
  { id: 'now', label: 'Now' },
  { id: 'depart', label: 'Depart at' },
  { id: 'arrive', label: 'Arrive by' },
] as const

type Result = { key: string; error?: string; plan?: Plan; at?: Date }

export const NO_BUS_NOTE = 'No campus bus today. Showing walking routes.'

export function PlanPage() {
  const [params, setParams] = useSearchParams()
  const trip = parseTrip(params)
  const start = useAppStore((s) => s.start)
  const { data: transit } = useTransit()
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState(0)
  const [detail, setDetail] = useState(false)

  const update = (patch: Partial<Trip>) => {
    setSelected(0)
    setDetail(false)
    setParams(new URLSearchParams(tripSearch({ ...trip, ...patch })), { replace: true })
  }
  const needsStart = [trip.from, trip.to].some((e) => e?.kind === 'me') && !start

  // Plan whenever the trip (or the start point) changes. The URL is the only input.
  const tripKey = tripSearch(trip)
  const startKey = start ? `${start.lat},${start.lon}` : ''
  const key = tripKey + startKey
  useEffect(() => {
    const trip = parseTrip(new URLSearchParams(tripKey))
    if (!trip.from || !trip.to || (needsStart && (trip.from.kind === 'me' || trip.to.kind === 'me'))) return
    let live = true
    ;(async () => {
      const at = trip.when.type === 'now' ? new Date() : new Date(`${trip.when.time}:00+08:00`)
      const plan = await planFor(trip, start, at)
      if (live) setResult({ key, plan, at })
    })().catch((e: unknown) => live && setResult({ key, error: e instanceof Error ? e.message : 'Planning failed.' }))
    return () => void (live = false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, startKey])

  const ready = !!trip.from && !!trip.to && !needsStart
  const current = ready && result?.key === key ? result : null
  const plan = current?.plan ?? null
  const option = plan?.options[selected]
  const noBusToday = plan && !!transit && !plan!.options.some((o) => o.kind === 'bus') && tripsOn(transit, klDateTime(current!.at!).date).length === 0

  const swap = () => update({ from: trip.to, to: trip.from })
  const when = trip.when
  const setWhen = (type: 'now' | 'depart' | 'arrive') => {
    if (type === 'now') return update({ when: { type } })
    const { date, time } = klDateTime(new Date())
    update({ when: { type, time: when.type === 'now' ? `${date}T${time}` : when.time } })
  }

  const ends = option && [option.legs[0].from.location, option.legs[option.legs.length - 1].to.location]

  return (
    <Page title="Plan a trip">
      {option && <RouteLayer legs={optionToRoute(option)} />}
      {ends && (
        <>
          <MarkerLayer markers={[{ id: 'from', kind: 'place', position: ends[0], selected: true }, { id: 'to', kind: 'place', position: ends[1], selected: true }]} />
          <FitTo points={option.legs.flatMap((l) => l.geometry)} maxZoom={18} />
        </>
      )}

      <div className="trip-form">
        <div className="trip-pickers">
          <PlacePicker label="From" value={trip.from} onChange={(from) => update({ from })} />
          <PlacePicker label="To" value={trip.to} onChange={(to) => update({ to })} />
        </div>
        <button type="button" className="icon-btn swap" onClick={swap} aria-label="Swap from and to">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M8 4v16M8 20l-4-4M8 20l4-4M16 20V4M16 4l-4 4M16 4l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {needsStart && <LocationControl />}

      <div className="segmented" role="radiogroup" aria-label="When">
        {WHEN.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={when.type === w.id} onClick={() => setWhen(w.id)}>
            {w.label}
          </button>
        ))}
      </div>
      {when.type !== 'now' && (
        <input
          className="field"
          type="datetime-local"
          aria-label={when.type === 'arrive' ? 'Arrive by (Malaysia time)' : 'Depart at (Malaysia time)'}
          value={when.time}
          onChange={(e) => e.target.value && update({ when: { type: when.type as 'depart' | 'arrive', time: e.target.value } })}
        />
      )}

      <div className="segmented" role="radiogroup" aria-label="Route type">
        {PROFILES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={trip.profile === p.id} onClick={() => update({ profile: p.id })}>
            {p.label}
          </button>
        ))}
      </div>

      {!ready && !needsStart && <p className="pending">Choose where you are going from and to.</p>}
      {ready && !current && (
        <p className="pending" role="status">
          Finding routes…
        </p>
      )}
      {current?.error && (
        <p className="no-service" role="alert">
          <strong>Could not plan this trip.</strong> {current.error}
        </p>
      )}
      {plan && plan.options.length === 0 && (
        <p className="no-service" role="status">
          <strong>No route found.</strong> Try a different start or end, or another route type.
        </p>
      )}
      {transit?.timetableNote && plan?.options.some((o) => o.kind === 'bus') && <p className="note">{transit.timetableNote}</p>}
      {noBusToday && (
        <p className="no-service" role="status">
          {NO_BUS_NOTE}
        </p>
      )}
      {plan && option && (
        <>
          {detail ? (
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setDetail(false)}>
                All options
              </button>
              <OptionDetail option={option} />
            </>
          ) : (
            <OptionList options={plan.options} selected={selected} onSelect={setSelected} />
          )}
          <div className="actions">
            {!detail && (
              <button type="button" className="btn btn-quiet" onClick={() => setDetail(true)}>
                Details
              </button>
            )}
            <Link to={{ pathname: '/navigate', search: `${tripSearch(trip)}&opt=${selected}` }} className="btn btn-primary">
              Start
            </Link>
          </div>
        </>
      )}
    </Page>
  )
}
