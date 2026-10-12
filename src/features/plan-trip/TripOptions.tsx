// The option cards and the leg-by-leg detail for a planned trip. Pure: give it a Plan, it renders it.
import { Fragment, type CSSProperties } from 'react'
import type { Leg, TripOption } from '../../domain/router/planTrip.ts'
import { klDateTime } from '../../domain/transit/departures.ts'
import { distanceM } from '../../domain/walk/geo.ts'
import type { RouteLeg } from '../map/layers.tsx'
import { routeColor } from '../transit/palette.ts'
import { Icon } from '../../ui/icons.tsx'

const minutes = (s: number) => Math.max(1, Math.round(s / 60))
const clock = (d: Date) => klDateTime(d).time

/** Every distinct note on the trip's legs, in order. */
export const optionLabels = (o: TripOption) => [...new Set(o.legs.flatMap((l) => l.labels.map((x) => x.text)))]

/** What the map draws for one option: walk solid, unverified shortcut dashed, covered highlighted, bus in route colour. */
export function optionToRoute(o: TripOption): RouteLeg[] {
  const out: RouteLeg[] = []
  for (const leg of o.legs) {
    if (leg.kind === 'bus') {
      out.push({ mode: 'bus', path: leg.geometry, color: routeColor(leg.route?.id ?? '', leg.route?.color ?? '#701a2c'), routeId: leg.route?.id ?? '' })
      continue
    }
    let at = 0
    const push = (to: number, style: 'normal' | 'likely' | 'covered') => {
      if (to > at) out.push({ mode: 'walk', path: leg.geometry.slice(at, to + 1), style })
      at = to
    }
    for (const l of [...leg.labels].sort((a, b) => a.from! - b.from!)) {
      push(l.from!, 'normal')
      push(l.to!, /unverified/i.test(l.text) ? 'likely' : /^covered/i.test(l.text) ? 'covered' : 'normal')
    }
    push(leg.geometry.length - 1, 'normal')
  }
  return out
}

/** Metres walked over the whole trip, along the drawn path. */
const walkedM = (l: Leg) => l.geometry.slice(1).reduce((d, p, i) => d + distanceM(l.geometry[i], p), 0)

export const walkDistanceM = (o: TripOption) => o.legs.filter((l) => l.kind === 'walk').reduce((sum, l) => sum + walkedM(l), 0)

export const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

export function RouteBadge({ route }: { route: { id: string; color?: string } }) {
  return (
    <span className="route-chip" style={{ background: routeColor(route.id, route.color) }}>
      {route.id}
    </span>
  )
}

export function OptionCard({ option, selected, onSelect }: { option: TripOption; selected: boolean; onSelect: () => void }) {
  const walkMin = minutes(option.walkS)
  return (
    <button type="button" role="radio" aria-checked={selected} className="option" onClick={onSelect}>
      <span className="option-main">
        <span className="option-legs">
          {option.kind === 'walk' ? (
            <>
              <Icon name="walk" size={18} />
              Walk only
            </>
          ) : (
            option.legs.map((l, i) => (
              <span key={i} className="option-leg">
                {i > 0 && <Icon name="chevron" size={14} className="option-sep" />}
                {l.kind === 'bus' ? <RouteBadge route={l.route!} /> : <Icon name="walk" size={18} />}
              </span>
            ))
          )}
        </span>
        <span className="option-time">{minutes(option.durationS)} min</span>
      </span>
      <span className="option-meta">
        <span>Arrive {clock(option.arriveAt)}</span>
        <span>
          Walk {walkMin} min · {metres(walkDistanceM(option))}
        </span>
      </span>
      {optionLabels(option).length > 0 && (
        <ul className="option-labels">
          {optionLabels(option).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </button>
  )
}

export function OptionList({ options, selected, onSelect }: { options: TripOption[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="options" role="radiogroup" aria-label="Trip options">
      {options.slice(0, 3).map((o, i) => (
        <OptionCard key={i} option={o} selected={i === selected} onSelect={() => onSelect(i)} />
      ))}
    </div>
  )
}

/** Bus lines get their route colour; walking is the blue dots of the map. */
const legStyle = (leg: Leg) => ({ '--leg': leg.kind === 'bus' ? routeColor(leg.route!.id, leg.route!.color) : undefined }) as CSSProperties

/** What happens at the point between two legs (or at the start). */
function Point({ prev, next }: { prev?: Leg; next: Leg }) {
  const bus = next.kind === 'bus'
  return (
    <li className="j-point" data-bus={bus || prev?.kind === 'bus' || undefined}>
      <time>{clock(bus || !prev ? next.departAt : prev.arriveAt)}</time>
      <span className="j-dot" style={legStyle(bus ? next : (prev ?? next))} />
      <div className="j-text">
        <strong>{next.from.name}</strong>
        {bus && (
          <p className="j-board">
            <RouteBadge route={next.route!} />
            <span>
              Board route {next.route!.id} to {(next.headsign ?? next.to.name).replace(/^to /i, '')}
            </span>
          </p>
        )}
        {!bus && prev?.kind === 'bus' && <p>Get off here</p>}
      </div>
    </li>
  )
}

/** The leg itself: one line for a walk, the ride (with its stops on request) for a bus. */
function Segment({ leg, current }: { leg: Leg; current?: boolean }) {
  const rides = Math.max(1, (leg.stops?.length ?? 2) - 1)
  return (
    <li className="j-leg" data-kind={leg.kind} data-current={current || undefined} style={legStyle(leg)}>
      <span className="j-line" />
      <div className="j-text">
        {leg.kind === 'walk' ? (
          <p className="j-what">
            <Icon name="walk" size={18} />
            Walk {minutes(leg.durationS)} min · {metres(walkedM(leg))}
          </p>
        ) : (
          <p className="j-what">
            <Icon name="bus" size={18} />
            Ride {rides} {rides === 1 ? 'stop' : 'stops'} · {minutes(leg.durationS)} min
          </p>
        )}
        {leg.labels.map((l) => (
          <p key={l.text} className="j-label">
            {l.text}
          </p>
        ))}
        {leg.kind === 'bus' && leg.stops && leg.stops.length > 2 && (
          <details className="j-stops">
            <summary>Show stops</summary>
            <ol>
              {leg.stops.slice(1, -1).map((st) => (
                <li key={st.id}>
                  <span>{st.name}</span>
                  <time>{clock(st.at)}</time>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </li>
  )
}

/** The whole trip at a glance: where you get on, which bus, where you get off. Walks are one line each. `current` marks the leg you are on. */
export function TripSteps({ option, current }: { option: TripOption; current?: number }) {
  // A walk of a few metres (stepping off the bus at the destination) is noise, not a step.
  const shown = option.legs.map((leg, i) => ({ leg, i })).filter(({ leg }) => leg.kind === 'bus' || walkedM(leg) >= 10)
  const legs = shown.length ? shown.map((x) => x.leg) : option.legs
  const here = current === undefined ? undefined : shown.findIndex((x) => x.i === current)
  const last = legs[legs.length - 1]
  return (
    <ol className="journey" aria-label="Trip steps">
      {legs.map((leg, i) => (
        <Fragment key={i}>
          <Point prev={legs[i - 1]} next={leg} />
          <Segment leg={leg} current={here === i} />
        </Fragment>
      ))}
      <li className="j-point j-end">
        <time>{clock(last.arriveAt)}</time>
        <span className="j-dot" />
        <div className="j-text">
          <strong>{last.to.name}</strong>
          <p>{last.kind === 'bus' ? 'Get off here' : 'Arrive'}</p>
        </div>
      </li>
    </ol>
  )
}
