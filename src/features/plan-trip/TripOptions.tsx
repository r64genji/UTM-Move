// The option cards and the leg-by-leg detail for a planned trip. Pure: give it a Plan, it renders it.
import type { Leg, TripOption } from '../../domain/router/planTrip.ts'
import { klDateTime } from '../../domain/transit/departures.ts'
import { distanceM } from '../../domain/walk/geo.ts'
import type { RouteLeg } from '../map/layers.tsx'
import { routeColor } from '../transit/palette.ts'

const minutes = (s: number) => Math.max(1, Math.round(s / 60))
const clock = (d: Date) => klDateTime(d).time

/** Every distinct note on the trip's legs, in order. */
export const optionLabels = (o: TripOption) => [...new Set(o.legs.flatMap((l) => l.labels.map((x) => x.text)))]

export const routes = (o: TripOption) => o.legs.filter((l) => l.kind === 'bus').map((l) => l.route!)

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
export const walkDistanceM = (o: TripOption) =>
  o.legs.filter((l) => l.kind === 'walk').reduce((sum, l) => sum + l.geometry.slice(1).reduce((d, p, i) => d + distanceM(l.geometry[i], p), 0), 0)

export const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/** Journey time, walking and arrival for one option. */
export function Summary({ option }: { option: TripOption }) {
  return (
    <dl className="stats">
      <div>
        <dt>Journey time</dt>
        <dd>~{minutes(option.durationS)} min</dd>
      </div>
      <div>
        <dt>Walking</dt>
        <dd className="muted-strong">
          {metres(walkDistanceM(option))} {option.walkS >= 30 && <small>~{minutes(option.walkS)} min</small>}
        </dd>
      </div>
      <div>
        <dt>Arrival</dt>
        <dd className="accent">{clock(option.arriveAt)}</dd>
      </div>
    </dl>
  )
}

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
        <span className="option-time">{minutes(option.durationS)} min</span>
        <span className="option-arrive">Arrive {clock(option.arriveAt)}</span>
      </span>
      <span className="option-meta">
        {option.kind === 'walk' ? 'Walk only' : routes(option).map((r, i) => <RouteBadge key={i} route={r} />)}
        <span>Walk {walkMin} min</span>
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

function LegDetail({ leg }: { leg: Leg }) {
  if (leg.kind === 'bus') {
    return (
      <li className="leg">
        <div className="leg-head">
          <RouteBadge route={leg.route!} />
          <strong>{leg.headsign ?? `Route ${leg.route!.id}`}</strong>
          <time>{clock(leg.departAt)}</time>
        </div>
        <p>
          Board at {leg.from.name}, get off at {leg.to.name} ({clock(leg.arriveAt)}).
        </p>
        {leg.labels.map((l) => (
          <p key={l.text} className="leg-label">
            {l.text}
          </p>
        ))}
      </li>
    )
  }
  return (
    <li className="leg">
      <div className="leg-head">
        <strong>Walk {minutes(leg.durationS)} min</strong>
        <time>{clock(leg.departAt)}</time>
      </div>
      <p>
        {leg.from.name} to {leg.to.name}
      </p>
      {leg.labels.map((l) => (
        <p key={l.text} className="leg-label">
          {l.text}
        </p>
      ))}
      {!!leg.steps?.length && (
        <ol className="steps">
          {leg.steps.map((s, i) => (
            <li key={i}>
              {s.instruction}
              {s.distanceM > 0 && <span className="list-code">{Math.round(s.distanceM)} m</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

export function OptionDetail({ option }: { option: TripOption }) {
  return (
    <ol className="legs" aria-label="Legs">
      {option.legs.map((l, i) => (
        <LegDetail key={i} leg={l} />
      ))}
    </ol>
  )
}
