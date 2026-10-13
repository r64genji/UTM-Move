import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Plan } from '../../domain/router/planTrip.ts'
import { klDateTime, tripsOn } from '../../domain/transit/departures.ts'
import { BottomSheet } from '../../ui/BottomSheet.tsx'
import { Icon } from '../../ui/icons.tsx'
import { useAppStore } from '../app/store.ts'
import { LocationControl } from '../location/LocationControl.tsx'
import { useGrantedLocation } from '../location/useUserLocation.ts'
import { MarkerLayer, RouteLayer } from '../map/layers.tsx'
import { useThumb } from '../transit/motion.ts'
import { FitTo } from '../transit/parts.tsx'
import { useTransit } from '../transit/useTransit.ts'
import { WhenPicker } from './WhenPicker.tsx'
import { PlacePicker, useEndpointName } from './PlacePicker.tsx'
import { OptionList, optionToRoute, TripSteps } from './TripOptions.tsx'
import { planFor } from './routerClient.ts'
import { parseTrip, tripSearch, type Profile, type Trip } from './tripParams.ts'

const PROFILES: { id: Profile; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'least-walk', label: 'Least walking' },
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
  // Directions start from where you are unless the link says otherwise.
  const parsed = parseTrip(params)
  const trip = { ...parsed, from: parsed.from ?? ({ kind: 'me' } as const) }
  const start = useAppStore((s) => s.start)
  const { data: transit } = useTransit()
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState(0)
  const [detail, setDetail] = useState(false)
  const [openEnd, setOpenEnd] = useState<'From' | 'To' | null>(null)
  const toName = useEndpointName(trip.to)
  const thumb = useThumb<HTMLDivElement>()
  useGrantedLocation()

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

  const whenControls = (
    <div className="when">
      <div ref={thumb} className="when-switch has-thumb" role="radiogroup" aria-label="When">
        {WHEN.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={when.type === w.id} onClick={() => setWhen(w.id)}>
            {w.label}
          </button>
        ))}
      </div>
      {when.type !== 'now' && (
        <WhenPicker
          value={when.time}
          label={when.type === 'arrive' ? 'Arrive by (Malaysia time)' : 'Depart at (Malaysia time)'}
          onChange={(time) => update({ when: { type: when.type as 'depart' | 'arrive', time } })}
        />
      )}
    </div>
  )

  return (
    <article className="plan">
      {option && <RouteLayer legs={optionToRoute(option)} />}
      {ends && (
        <>
          <MarkerLayer
            markers={[
              { id: 'from', kind: 'place', position: ends[0], selected: true, color: '#22c55e' },
              { id: 'to', kind: 'place', position: ends[1], selected: true, color: '#ef4444' },
            ]}
          />
          <FitTo points={option.legs.flatMap((l) => l.geometry)} maxZoom={18} />
        </>
      )}

      <header className="plan-top">
        <h1 className="side-title">Directions</h1>
        <div className="trip-card">
          <Link to="/" className="icon-btn" aria-label="Close directions">
            <Icon name="back" size={22} />
          </Link>
          <div className="trip-pickers">
            <PlacePicker label="From" value={trip.from} open={openEnd === 'From'} onOpenChange={(o) => setOpenEnd(o ? 'From' : null)} onChange={(from) => update({ from })} />
            <PlacePicker label="To" value={trip.to} open={openEnd === 'To'} onOpenChange={(o) => setOpenEnd(o ? 'To' : null)} onChange={(to) => update({ to })} />
          </div>
          <button type="button" className="icon-btn" onClick={swap} aria-label="Swap from and to">
            <Icon name="swap" size={22} />
          </button>
        </div>
        <div className="chips plan-chips">
          <div className="chip-group" role="radiogroup" aria-label="Route type">
            {PROFILES.map((p) => (
              <button key={p.id} type="button" className="chip" role="radio" aria-checked={trip.profile === p.id} onClick={() => update({ profile: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {(ready || needsStart) && (
        <BottomSheet label="Trip">
          {needsStart && <LocationControl />}
          {ready && (
            <>
              {!detail && whenControls}
              {!current && (
                <>
                  <p className="pending" role="status">
                    Finding routes…
                  </p>
                  <div className="skel skel-option" aria-hidden="true" />
                  <div className="skel skel-option" aria-hidden="true" />
                </>
              )}
              {current?.error && (
                <p className="notice notice-error" role="alert">
                  <strong>Could not plan this trip.</strong> {current.error}
                </p>
              )}
              {plan && plan.options.length === 0 && (
                <p className="notice" role="status">
                  <strong>No route found.</strong> Try a different start or end, or another route type.
                </p>
              )}
              {noBusToday && (
                <p className="notice" role="status">
                  {NO_BUS_NOTE}
                </p>
              )}
              {plan && option && (
                <>
                  {detail ? (
                    <>
                      <header className="sheet-head">
                        <button type="button" className="icon-btn" onClick={() => setDetail(false)} aria-label="All options">
                          <Icon name="back" size={22} />
                        </button>
                        <h2>To {toName ?? 'your destination'}</h2>
                      </header>
                      <TripSteps option={option} />
                    </>
                  ) : (
                    <>
                      <h2 className="sheet-title">To {toName ?? 'your destination'}</h2>
                      <OptionList options={plan.options} selected={selected} onSelect={setSelected} />
                    </>
                  )}
                  {transit?.timetableNote && plan.options.some((o) => o.kind === 'bus') && <p className="note">{transit.timetableNote}</p>}
                  <div className="sheet-actions">
                    {!detail && (
                      <button type="button" className="btn btn-quiet" onClick={() => setDetail(true)}>
                        Steps
                      </button>
                    )}
                    <Link to={{ pathname: '/navigate', search: `${tripSearch(trip)}&opt=${selected}` }} className="btn btn-primary">
                      <Icon name="navigate" size={20} />
                      Start
                    </Link>
                  </div>
                </>
              )}
            </>
          )}
        </BottomSheet>
      )}
    </article>
  )
}
