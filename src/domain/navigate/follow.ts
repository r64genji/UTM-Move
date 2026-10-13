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
/** ...and while riding (a bus covers more ground between fixes). */
const RIDE_LOOKAHEAD_M = 1500
const ARRIVE_M = 25
/** You are on the bus once you are this far along its line. Until then you are still waiting to board. */
export const BOARDED_M = 100
/** On a bus, further than this from its line for OFF_BUS_MS is the wrong bus. */
const OFF_BUS_M = 150
const OFF_BUS_MS = 30_000
/** Not on the bus this long after it was due: it was missed (or it is very late), so plan again. */
export const MISSED_MS = 5 * 60_000
/** A bus is not boarded before it is due, less this: another bus on the same road is not yours. */
const EARLY_MS = 2 * 60_000
/** "Get off" stays up until you are this far into the walk after it, so a slow GPS still shows it. */
const ALIGHTED_M = 30
/** A stop counts as passed this far past it. */
const STOP_PASSED_M = 25

export type Fix = LatLon & { accuracy: number; /** ms since epoch */ t: number }

export interface Maneuver {
  text: string
  /** Metres along the whole route. */
  at: number
  location: LatLon
  kind?: 'board' | 'alight'
  /** Alight: metres along the route of each stop after boarding, the last one is where you get off. */
  stopsAt?: number[]
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
  /** Time of the last fix used, ms; null before the first. */
  lastT: number | null
}

export type NavEvent = { type: 'step'; text: string } | { type: 'reroute'; from: Fix; why: 'off-route' | 'missed-bus' } | { type: 'arrive' }

export const startState: NavState = { alongM: 0, next: -1, offSince: null, rerouted: false, arrived: false, lastT: null }

/** GPS noise: on the first fix, where the path doubles back, the earliest pass this close to the nearest wins. */
const FIRST_SLACK_M = 25
/** After that, progress moves no faster than this (m/s) plus the same slack: a noisy fix must not jump to where the path comes back. */
const WALK_MAX_MPS = 3
const BUS_MAX_MPS = 30

interface Hit { along: number; dist: number }

/** Nearest point on path segments lo..hi-1 to p, with its distance along the route. With `slack`, the earliest point no more than that further away. */
function project(path: LatLon[], cum: number[], p: LatLon, lo: number, hi: number, slack = 0): Hit {
  const mLat = 111_195
  const mLon = mLat * Math.cos((p.lat * Math.PI) / 180)
  let best: Hit = { along: cum[lo], dist: Infinity }
  const hits: Hit[] = []
  for (let i = lo; i < hi; i++) {
    const ax = (path[i].lon - p.lon) * mLon, ay = (path[i].lat - p.lat) * mLat
    const bx = (path[i + 1].lon - p.lon) * mLon, by = (path[i + 1].lat - p.lat) * mLat
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    const hit = { dist: Math.hypot(ax + t * dx, ay + t * dy), along: cum[i] + t * (cum[i + 1] - cum[i]) }
    hits.push(hit)
    if (hit.dist < best.dist) best = hit
  }
  return hits.find((h) => h.dist <= best.dist + slack) ?? best
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
      maneuvers.push({ text: `Board route ${leg.route?.id} to ${to}`, at: legAt[i], location: leg.from.location, kind: 'board' })
      // Each stop on the line, in order; a loop can pass near a stop twice, so search on from the last one.
      let from = lo
      const stopsAt = (leg.stops ?? []).slice(1, -1).map((st) => {
        const hit = project(path, cum, st.location, from, Math.max(from, hi))
        while (from < hi - 1 && cum[from + 1] <= hit.along) from++
        return hit.along
      })
      stopsAt.push(legAt[i + 1])
      maneuvers.push({ text: `Get off at ${leg.to.name}`, at: legAt[i + 1], location: leg.to.location, kind: 'alight', stopsAt })
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

/** On leg `i`, a bus, and already moving with it. */
const riding = (nav: Navigation, i: number, along: number) => nav.option.legs[i].kind === 'bus' && along >= nav.legAt[i] + BOARDED_M

/** The next bus leg not boarded yet, or -1. */
const nextBus = (nav: Navigation, along: number) => nav.option.legs.findIndex((l, i) => l.kind === 'bus' && along < nav.legAt[i] + BOARDED_M)

/** A maneuver is behind you once you are past it; a bus is only boarded once you move with it. */
const passed = (m: Maneuver, along: number) => along >= m.at + (m.kind === 'board' ? BOARDED_M : m.kind === 'alight' ? ALIGHTED_M : PASSED_M)

/** Feed one fix. `now` (ms) is the clock for the missed bus: a phone standing still sends no new fixes. Returns the next state and what happened. */
export function follow(nav: Navigation, state: NavState, fix: Fix, now = fix.t): { state: NavState; events: NavEvent[] } {
  // After arrival nothing changes: noise around the door must not start guidance again.
  if (fix.accuracy > MAX_ACCURACY_M || !nav.path.length || state.arrived) return { state, events: [] }
  const events: NavEvent[] = []
  const leg = legIndex(nav, state.alongM)

  // Search a little behind the last position and a stretch ahead, never the whole route: a bus line can loop back near itself.
  const lo = Math.max(0, nav.cum.findIndex((c) => c >= state.alongM - 20) - 1)
  let hi = nav.path.length - 1
  // On a bus, not past its last stop: the walk after it often runs beside the road the bus is still on.
  const ahead = riding(nav, leg, state.alongM) ? Math.min(state.alongM + RIDE_LOOKAHEAD_M, nav.legAt[leg + 1] + 2 * PASSED_M) : state.alongM + LOOKAHEAD_M
  while (hi > lo + 1 && nav.cum[hi - 1] > ahead) hi--
  // The first fix has no speed to check against: where the path doubles back, take the earliest pass within GPS noise.
  const hit = project(nav.path, nav.cum, fix, lo, Math.max(lo, hi), state.lastT === null ? FIRST_SLACK_M : 0)
  const reach = state.lastT === null ? Infinity : state.alongM + FIRST_SLACK_M + (Math.max(0, fix.t - state.lastT) / 1000) * (nav.option.legs[leg].kind === 'bus' ? BUS_MAX_MPS : WALK_MAX_MPS)
  let alongM = Math.max(state.alongM, Math.min(hit.along, reach))
  const waitFor = nextBus(nav, state.alongM)
  if (waitFor >= 0 && now < nav.option.legs[waitFor].departAt.getTime() - EARLY_MS) alongM = Math.min(alongM, Math.max(state.alongM, nav.legAt[waitFor] + BOARDED_M - 1))

  const cur = legIndex(nav, alongM)
  const onBus = riding(nav, cur, alongM)
  const waiting = nav.option.legs[cur].kind === 'bus' && !onBus
  // At the stop or on a bus, only far from the bus line for a while is off route (GPS is rougher there, and you may wait a few metres away).
  const off = hit.dist > (onBus || waiting ? OFF_BUS_M : OFF_ROUTE_M)

  const offSince = off ? (state.offSince ?? fix.t) : null
  let rerouted = state.rerouted
  // A phone standing still may send no new fix: then the clock decides, once the fix is clearly off (not one noisy reading).
  const offLimit = onBus || waiting ? OFF_BUS_M : OFF_ROUTE_M
  const confirmed = (offSince !== null && fix.t > offSince) || hit.dist > 2 * offLimit
  if (offSince !== null && confirmed && now - offSince >= (onBus || waiting ? OFF_BUS_MS : OFF_ROUTE_MS) && !rerouted) {
    rerouted = true
    events.push({ type: 'reroute', from: fix, why: 'off-route' })
  }
  const due = nextBus(nav, alongM)
  // Missed: the bus is MISSED_MS overdue, or it is due and you cannot reach the stop within MISSED_MS of its time even if it is late.
  const dueAt = due >= 0 ? nav.option.legs[due].departAt.getTime() : 0
  const reachAt = now + (Math.max(0, nav.legAt[due] - alongM) / WALK_SPEED) * 1000
  if (due >= 0 && !rerouted && (now - dueAt >= MISSED_MS || (now > dueAt && reachAt > dueAt + MISSED_MS))) {
    rerouted = true
    events.push({ type: 'reroute', from: fix, why: 'missed-bus' })
  }

  let next = nav.maneuvers.findIndex((m) => !passed(m, alongM))
  if (next < 0) next = nav.maneuvers.length
  next = Math.max(state.next, next)
  if (next !== state.next && next < nav.maneuvers.length) events.push({ type: 'step', text: nav.maneuvers[next].text })

  const arrived = state.arrived || (distanceM(fix, nav.path[nav.path.length - 1]) <= ARRIVE_M && alongM >= nav.totalM - ARRIVE_M * 2)
  if (arrived && !state.arrived) events.push({ type: 'arrive' })

  return { state: { alongM, next, offSince, rerouted, arrived, lastT: fix.t }, events }
}

export interface BusWarning { text: string; /** You will not make it at walking pace. */ late: boolean }

export interface View {
  next: Maneuver | null
  then: Maneuver | null
  distanceToNextM: number
  /** Riding to the next maneuver (get off): stops still to come, the last one is yours. */
  stopsLeft: number | null
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
    // A bus never leaves early: not the next ones, nor the one you are waiting for.
    if (leg.kind === 'bus' && (i > cur || !riding(nav, i, state.alongM))) t = Math.max(t, leg.departAt.getTime())
    const span = nav.legAt[i + 1] - nav.legAt[i]
    const left = i === cur && span > 0 ? Math.max(0, nav.legAt[i + 1] - state.alongM) / span : 1
    t += leg.durationS * 1000 * left
  })

  // The next bus we still have to board. None while riding: the ride is not a walk.
  const busIdx = nextBus(nav, state.alongM)
  let busWarning: BusWarning | null = null
  if (busIdx >= 0 && !state.arrived && !riding(nav, cur, state.alongM)) {
    const leavesMs = legs[busIdx].departAt.getTime() - now.getTime()
    const needS = Math.max(0, nav.legAt[busIdx] - state.alongM) / WALK_SPEED
    const needMin = Math.ceil(needS / 60)
    // Times are estimates: a bus due now may still come. MISSED_MS after it was due, follow() plans again.
    const leaves = min(leavesMs) <= 0 ? 'Bus due now.' : `Bus leaves in ${min(leavesMs)} min.`
    const spare = min(leavesMs) - needMin
    const text = needMin === 0 ? leaves : `${leaves} You need ${needMin} min to walk.${spare >= 0 && spare <= 1 ? ' Go now.' : ''}`
    busWarning = { text, late: needMin > 0 && needS * 1000 > leavesMs }
  }

  return {
    next,
    then,
    distanceToNextM: next ? Math.max(0, next.at - state.alongM) : 0,
    stopsLeft: next?.stopsAt && riding(nav, cur, state.alongM) ? next.stopsAt.filter((a) => a > state.alongM + STOP_PASSED_M).length || 1 : null,
    progress: nav.totalM ? Math.min(1, state.alongM / nav.totalM) : 1,
    remainingM: Math.max(0, nav.totalM - state.alongM),
    eta: new Date(t),
    busWarning,
  }
}
