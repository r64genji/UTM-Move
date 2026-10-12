// Live guidance, pure: a trip option plus a stream of GPS fixes in, current step / off-route / arrival out.
// No React, no DOM, no clock: every time comes from the fix or the caller.
import type { TripOption } from '../router/planTrip.ts'
import { WALK_SPEED } from '../router/planTrip.ts'
import type { LatLon } from '../schemas.ts'
import { distanceM } from '../walk/geo.ts'

/** Fixes rougher than this are ignored (no step change, no off-route clock). */
export const MAX_ACCURACY_M = 50
/** Further than this from the route counts as off it... */
export const OFF_ROUTE_M = 30
/** ...once it has lasted this long. */
export const OFF_ROUTE_MS = 10_000
/** A maneuver is behind you once you are this far past it. */
const PASSED_M = 10
/** How far ahead of the last position the route is searched while walking. */
const LOOKAHEAD_M = 200
const ARRIVE_M = 25

export type Fix = LatLon & { accuracy: number; /** ms since epoch */ t: number }

export interface Maneuver {
  text: string
  /** Metres along the whole route. */
  at: number
  location: LatLon
}

export interface Navigation {
  option: TripOption
  path: LatLon[]
  /** Metres along the route at each vertex of `path`. */
  cum: number[]
  /** Metres along the route where each leg starts, plus the total at the end. */
  legAt: number[]
  maneuvers: Maneuver[]
  totalM: number
}

export interface NavState {
  alongM: number
  /** Index of the next maneuver; -1 before the first fix. */
  next: number
  offSince: number | null
  rerouted: boolean
  arrived: boolean
}

export type NavEvent = { type: 'step'; text: string } | { type: 'reroute'; from: Fix } | { type: 'arrive' }

export const startState: NavState = { alongM: 0, next: -1, offSince: null, rerouted: false, arrived: false }

interface Hit { along: number; dist: number }

/** Nearest point on path segments lo..hi-1 to p, with its distance along the route. */
function project(path: LatLon[], cum: number[], p: LatLon, lo: number, hi: number): Hit {
  const mLat = 111_195
  const mLon = mLat * Math.cos((p.lat * Math.PI) / 180)
  let best: Hit = { along: cum[lo], dist: Infinity }
  for (let i = lo; i < hi; i++) {
    const ax = (path[i].lon - p.lon) * mLon, ay = (path[i].lat - p.lat) * mLat
    const bx = (path[i + 1].lon - p.lon) * mLon, by = (path[i + 1].lat - p.lat) * mLat
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    const dist = Math.hypot(ax + t * dx, ay + t * dy)
    if (dist < best.dist) best = { dist, along: cum[i] + t * (cum[i + 1] - cum[i]) }
  }
  return best
}

export function createNavigation(option: TripOption): Navigation {
  const path: LatLon[] = []
  const cum: number[] = []
  const legAt: number[] = []
  const legIdx: number[] = []
  for (const leg of option.legs) {
    legIdx.push(path.length)
    leg.geometry.forEach((p, i) => {
      if (path.length) cum.push(cum[cum.length - 1] + distanceM(path[path.length - 1], p))
      else cum.push(0)
      path.push(p)
      if (i === 0) legAt.push(cum[cum.length - 1])
    })
  }
  const totalM = cum[cum.length - 1] ?? 0
  legAt.push(totalM)

  const maneuvers: Maneuver[] = []
  const last = option.legs.length - 1
  option.legs.forEach((leg, i) => {
    const lo = legIdx[i]
    const hi = i === last ? path.length - 1 : legIdx[i + 1]
    if (leg.kind === 'bus') {
      // Headsigns often start with "To" already ("To Cluster (T02)"); do not say "to To".
      const to = (leg.headsign ?? leg.to.name).replace(/^to /i, '')
      maneuvers.push({ text: `Board route ${leg.route?.id} to ${to}`, at: legAt[i], location: leg.from.location })
      maneuvers.push({ text: `Get off at ${leg.to.name}`, at: legAt[i + 1], location: leg.to.location })
      return
    }
    let from = lo
    for (const s of leg.steps ?? []) {
      if (s.turn === 'arrive' && i !== last) continue
      const hit = project(path, cum, s.location, from, Math.max(from, hi))
      maneuvers.push({ text: s.instruction, at: Math.max(hit.along, legAt[i]), location: s.location })
      // Later steps are never earlier on the line.
      while (from < hi - 1 && cum[from + 1] <= hit.along) from++
    }
  })
  if (!maneuvers.length) {
    const to = option.legs[last].to
    maneuvers.push({ text: `Arrive at ${to.name}`, at: totalM, location: to.location })
  }
  return { option, path, cum, legAt, maneuvers, totalM }
}

/** Leg index containing `along`. A leg owns its start and not its end. */
function legIndex(nav: Navigation, along: number): number {
  let i = nav.option.legs.length - 1
  while (i > 0 && nav.legAt[i] > along) i--
  return i
}

/** Feed one fix. Returns the next state and what happened. */
export function follow(nav: Navigation, state: NavState, fix: Fix): { state: NavState; events: NavEvent[] } {
  if (fix.accuracy > MAX_ACCURACY_M || !nav.path.length) return { state, events: [] }
  const events: NavEvent[] = []
  const leg = legIndex(nav, state.alongM)
  const walking = nav.option.legs[leg].kind === 'walk'

  const lo = Math.max(0, nav.cum.findIndex((c) => c >= state.alongM - 20) - 1)
  let hi = nav.path.length - 1
  if (walking) while (hi > lo + 1 && nav.cum[hi - 1] > state.alongM + LOOKAHEAD_M) hi--
  const hit = project(nav.path, nav.cum, fix, lo, Math.max(lo, hi))
  const alongM = Math.max(state.alongM, hit.along)

  const offWalk = nav.option.legs[legIndex(nav, alongM)].kind === 'walk' && hit.dist > OFF_ROUTE_M
  const offSince = offWalk ? (state.offSince ?? fix.t) : null
  let rerouted = state.rerouted
  if (offSince !== null && fix.t - offSince >= OFF_ROUTE_MS && !rerouted) {
    rerouted = true
    events.push({ type: 'reroute', from: fix })
  }

  let next = nav.maneuvers.findIndex((m) => m.at > alongM - PASSED_M)
  if (next < 0) next = nav.maneuvers.length
  next = Math.max(state.next, next)
  if (next !== state.next && next < nav.maneuvers.length) events.push({ type: 'step', text: nav.maneuvers[next].text })

  const arrived = state.arrived || (distanceM(fix, nav.path[nav.path.length - 1]) <= ARRIVE_M && alongM >= nav.totalM - ARRIVE_M * 2)
  if (arrived && !state.arrived) events.push({ type: 'arrive' })

  return { state: { alongM, next, offSince, rerouted, arrived }, events }
}

export interface BusWarning { text: string; /** You will not make it at walking pace. */ late: boolean }

export interface View {
  next: Maneuver | null
  then: Maneuver | null
  distanceToNextM: number
  /** 0..1 of the route covered. */
  progress: number
  remainingM: number
  eta: Date
  busWarning: BusWarning | null
}

const min = (ms: number) => Math.round(ms / 60_000)

/** What to show. `now` is the wall clock for the ETA and the bus warning. */
export function view(nav: Navigation, state: NavState, now: Date): View {
  const n = Math.max(0, state.next) // -1 until the first fix
  const next = nav.maneuvers[n] ?? null
  const then = nav.maneuvers[n + 1] ?? null
  const legs = nav.option.legs
  const cur = legIndex(nav, state.alongM)

  // ETA: what is left of this leg at its planned pace, then every later leg (a bus never leaves early).
  let t = now.getTime()
  legs.forEach((leg, i) => {
    if (i < cur) return
    if (leg.kind === 'bus' && i > cur) t = Math.max(t, leg.departAt.getTime())
    const span = nav.legAt[i + 1] - nav.legAt[i]
    const left = i === cur && span > 0 ? Math.max(0, nav.legAt[i + 1] - state.alongM) / span : 1
    t += leg.durationS * 1000 * left
  })

  // The next bus we still have to board.
  const busIdx = legs.findIndex((l, i) => l.kind === 'bus' && state.alongM < nav.legAt[i] + PASSED_M)
  let busWarning: BusWarning | null = null
  if (busIdx >= 0 && !state.arrived) {
    const leavesMs = legs[busIdx].departAt.getTime() - now.getTime()
    const needS = Math.max(0, nav.legAt[busIdx] - state.alongM) / WALK_SPEED
    const needMin = Math.ceil(needS / 60)
    const text =
      leavesMs <= 0 ? 'The bus has left. Check the next departures.'
      : needMin === 0 ? `Bus leaves in ${min(leavesMs)} min.`
      : `Bus leaves in ${min(leavesMs)} min. You need ${needMin} min to walk.`
    busWarning = { text, late: leavesMs <= 0 || needS * 1000 > leavesMs }
  }

  return {
    next,
    then,
    distanceToNextM: next ? Math.max(0, next.at - state.alongM) : 0,
    progress: nav.totalM ? Math.min(1, state.alongM / nav.totalM) : 1,
    remainingM: Math.max(0, nav.totalM - state.alongM),
    eta: new Date(t),
    busWarning,
  }
}
