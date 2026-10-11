// Door to door: walk to a stop, ride (up to 2 transfers), walk to the destination. Depart-at and arrive-by.
import type { LatLon, TransitData } from '../schemas.ts'
import { klDateTime } from '../transit/departures.ts'
import { rideGeometry } from '../transit/cut.ts'
import { decodePolyline } from '../transit/polyline.ts'
import { raptor, type RaptorJourney, type Transfers } from '../transit/raptor.ts'
import type { Graph } from '../walk/graph.ts'
import { distanceM } from '../walk/geo.ts'
import { pathToLeg, route, walkTimes, type Endpoint, type Profile } from '../walk/router.ts'
import { snapToEdge, snapToNode } from '../walk/snap.ts'
import type { Step } from '../walk/steps.ts'

/** Longest walk to or from a stop. */
export const ACCESS_CAP_S = 15 * 60
/** Longest walk between two stops to change bus. */
export const TRANSFER_CAP_S = 5 * 60
/** A bus option must beat walking by at least this much, or it is not offered. */
export const MIN_SAVING_S = 2 * 60
const WALK_SPEED = 1.4

export interface Place { name: string; location: LatLon }

export interface PlanRequest {
  from: Place
  to: Place
  /** depart: leave at `at`. arrive: be there by `at`. */
  mode: 'depart' | 'arrive'
  at: Date
  profile?: Profile
}

export interface LegLabel { text: string; /** Index range into the leg's geometry; absent means the whole leg. */ from?: number; to?: number }

export interface Leg {
  kind: 'walk' | 'bus'
  from: Place
  to: Place
  departAt: Date
  arriveAt: Date
  durationS: number
  geometry: LatLon[]
  labels: LegLabel[]
  /** Walk legs. */
  steps?: Step[]
  /** Bus legs. */
  route?: { id: string; name: string; color?: string }
  headsign?: string
  stops?: { id: string; name: string; location: LatLon; at: Date }[]
}

export interface TripOption {
  kind: 'walk' | 'bus'
  departAt: Date
  arriveAt: Date
  durationS: number
  walkS: number
  transfers: number
  legs: Leg[]
}

export interface Plan { options: TripOption[] }

interface StopInfo { nodes: Int32Array; gapS: Float64Array; transfers: Transfers }

const stopCache = new WeakMap<Graph, WeakMap<TransitData, StopInfo>>()

function stopInfo(g: Graph, data: TransitData, profile: Profile, at: Date): StopInfo {
  let per = stopCache.get(g)
  if (!per) stopCache.set(g, (per = new WeakMap()))
  const hit = per.get(data)
  if (hit) return hit
  const { nodeLat, nodeLon } = g
  const nodes = Int32Array.from(data.stops, (s) => snapToNode(g, s.location))
  const gapS = Float64Array.from(data.stops, (s, i) => {
    if (nodes[i] < 0) return Infinity
    return distanceM(s.location, { lat: nodeLat[nodes[i]] / 1e7, lon: nodeLon[nodes[i]] / 1e7 }) / WALK_SPEED
  })
  const transfers = new Map<string, { to: string; secs: number }[]>()
  data.stops.forEach((s, i) => {
    if (nodes[i] < 0) return
    const t = walkTimes(g, nodes[i], nodes, { profile, at, maxTimeS: TRANSFER_CAP_S })
    const list: { to: string; secs: number }[] = []
    data.stops.forEach((o, j) => {
      const secs = Math.ceil(t[j] + gapS[i] + gapS[j])
      if (j !== i && secs <= TRANSFER_CAP_S) list.push({ to: o.id, secs })
    })
    transfers.set(s.id, list)
  })
  const info = { nodes, gapS, transfers }
  per.set(data, info)
  return info
}

interface Candidate {
  journey: RaptorJourney
  fromStop: number
  toStop: number
  accessS: number
  egressS: number
  departS: number
  arriveS: number
  walkS: number
}

const key = (c: Candidate) => c.journey.legs.map((l) => (l.kind === 'ride' ? `${l.tripId}@${l.boardPos}-${l.alightPos}` : `${l.from}>${l.to}`)).join('|')

/** Plan walk-only plus up to two bus options. */
export function planTrip(g: Graph, data: TransitData, req: PlanRequest): Plan {
  const profile = req.profile ?? 'fastest'
  const { date } = klDateTime(req.at)
  const dayStart = Date.parse(`${date}T00:00:00+08:00`)
  const q = (req.at.getTime() - dayStart) / 1000
  const when = (s: number) => new Date(dayStart + s * 1000)
  const walkOpts = (at: Date) => ({ profile, at })
  const endpoint = (p: LatLon): Endpoint => snapToEdge(g, p) ?? snapToNode(g, p)
  const origin = endpoint(req.from.location)
  const dest = endpoint(req.to.location)
  const info = stopInfo(g, data, profile, req.at)

  const walkLeg = (a: Endpoint, b: Endpoint, from: Place, to: Place, departS: number, durationS: number): Leg => {
    const departAt = when(departS)
    const path = route(g, a, b, walkOpts(departAt))
    const w = path ? pathToLeg(g, path, departAt, to.name) : null
    const geometry = w ? [...w.coords] : []
    const labels: LegLabel[] = (w?.labels ?? []).map((l) => ({ ...l }))
    if (!geometry.length || distanceM(geometry[0], from.location) > 2) {
      geometry.unshift(from.location)
      for (const l of labels) { l.from! += 1; l.to! += 1 }
    }
    if (geometry.length < 2 || distanceM(geometry[geometry.length - 1], to.location) > 2) geometry.push(to.location)
    return { kind: 'walk', from, to, departAt, arriveAt: when(departS + durationS), durationS, geometry, labels, steps: w?.steps ?? [] }
  }

  // Walk only. Always offered when a path exists.
  const options: TripOption[] = []
  const direct = route(g, origin, dest, walkOpts(req.at))
  const walkT = direct ? Math.ceil(direct.timeS) : Infinity
  if (direct) {
    const departS = req.mode === 'depart' ? q : q - walkT
    const leg = walkLeg(origin, dest, req.from, req.to, departS, walkT)
    options.push({ kind: 'walk', departAt: leg.departAt, arriveAt: leg.arriveAt, durationS: walkT, walkS: walkT, transfers: 0, legs: [leg] })
  }

  const access = walkTimes(g, origin, info.nodes, { ...walkOpts(req.at), maxTimeS: ACCESS_CAP_S })
  const egress = walkTimes(g, dest, info.nodes, { ...walkOpts(req.at), maxTimeS: ACCESS_CAP_S, reverse: true })
  const reach = (t: Float64Array, i: number) => Math.ceil(t[i] + info.gapS[i])
  const accessS = data.stops.map((_, i) => (info.nodes[i] >= 0 ? reach(access, i) : Infinity))
  const egressS = data.stops.map((_, i) => (info.nodes[i] >= 0 ? reach(egress, i) : Infinity))
  const nearest = (a: number[]) => a.indexOf(Math.min(...a))

  // Candidates from every stop, then again from only the nearest stop at each end (the least walking).
  const candidates = new Map<string, Candidate>()
  for (const nearestOnly of [false, true]) {
    const near = (a: number[], i: number) => !nearestOnly || i === nearest(a)
    const sources = new Map<string, number>()
    const sourceSide = req.mode === 'depart' ? accessS : egressS
    const targetSide = req.mode === 'depart' ? egressS : accessS
    data.stops.forEach((s, i) => {
      if (Number.isFinite(sourceSide[i]) && near(sourceSide, i)) sources.set(s.id, req.mode === 'depart' ? q + sourceSide[i] : q - sourceSide[i])
    })
    if (!sources.size) continue
    const result = raptor(data, { date, sources, direction: req.mode === 'depart' ? 'forward' : 'reverse', transfers: info.transfers })
    data.stops.forEach((s, i) => {
      if (!Number.isFinite(targetSide[i]) || !near(targetSide, i)) return
      for (const journey of result.journeysTo(s.id)) {
        if (!journey.legs.some((l) => l.kind === 'ride')) continue
        const first = journey.legs[0]
        const last = journey.legs[journey.legs.length - 1]
        const fromStop = data.stops.findIndex((x) => x.id === first.from)
        const toStop = data.stops.findIndex((x) => x.id === last.to)
        const a = accessS[fromStop]
        const e = egressS[toStop]
        if (!Number.isFinite(a) || !Number.isFinite(e)) continue
        const walkedBetween = journey.legs.reduce((sum, l) => sum + (l.kind === 'walk' ? l.arrive - l.depart : 0), 0)
        const c: Candidate = {
          journey, fromStop, toStop, accessS: a, egressS: e,
          departS: first.depart - a, arriveS: last.arrive + e, walkS: a + e + walkedBetween,
        }
        candidates.set(key(c), c)
      }
    })
  }

  // Worth it: beats walking by MIN_SAVING_S.
  const rank = (c: { departS: number; arriveS: number }) => (req.mode === 'depart' ? c.arriveS : -c.departS)
  const walkRank = req.mode === 'depart' ? q + walkT : -(q - walkT)
  const worth = [...candidates.values()].filter((c) => rank(c) <= walkRank - MIN_SAVING_S || !direct)
  const byRank = (a: Candidate, b: Candidate) => rank(a) - rank(b) || a.walkS - b.walkS
  const rides = (c: Candidate) => c.journey.rides
  const fastest = [...worth].sort(byRank)[0]
  const leastWalk = [...worth].sort((a, b) => a.walkS - b.walkS || byRank(a, b))[0]
  const fewest = [...worth].sort((a, b) => rides(a) - rides(b) || byRank(a, b))[0]
  const picks = [...new Set([fastest, leastWalk, fewest].filter(Boolean))]
  // Drop an option when another is no slower and walks no more.
  const kept = picks.filter((c) => !picks.some((o) => o !== c && rank(o) <= rank(c) && o.walkS <= c.walkS && (rank(o) < rank(c) || o.walkS < c.walkS)))
  const chosen = kept.sort(byRank).slice(0, 2)

  for (const c of chosen) options.push(busOption(c))
  return { options }

  function busOption(c: Candidate): TripOption {
    const stop = (i: number): Place => ({ name: data.stops[i].name, location: data.stops[i].location })
    const named = (id: string) => stop(data.stops.findIndex((s) => s.id === id))
    const legs: Leg[] = []
    const { legs: jl } = c.journey
    if (c.accessS > 0) legs.push(walkLeg(origin, info.nodes[c.fromStop], req.from, stop(c.fromStop), c.departS, c.accessS))
    let prevArrive = c.departS + c.accessS
    let firstRide = true
    for (const l of jl) {
      const from = named(l.from)
      const to = named(l.to)
      if (l.kind === 'walk') {
        const a = info.nodes[data.stops.findIndex((s) => s.id === l.from)]
        const b = info.nodes[data.stops.findIndex((s) => s.id === l.to)]
        legs.push(walkLeg(a, b, from, to, l.depart, l.arrive - l.depart))
        prevArrive = l.arrive
        continue
      }
      const trip = data.trips.find((t) => t.id === l.tripId)!
      const pattern = data.patterns.find((p) => p.id === trip.patternId)
      const r = data.routes.find((x) => x.id === trip.routeId)!
      const stopTimes = trip.stopTimes.slice(l.boardPos, l.alightPos + 1)
      const locations = (ids: string[]) => ids.map((id) => data.stops.find((s) => s.id === id)!.location)
      const geometry = pattern && pattern.stopIds.join() === trip.stopTimes.map((s) => s.stopId).join()
        ? rideGeometry(decodePolyline(pattern.shape), locations(pattern.stopIds), l.boardPos, l.alightPos)
        : locations(stopTimes.map((s) => s.stopId))
      const labels: LegLabel[] = []
      const waitMin = Math.round((l.depart - (firstRide && req.mode === 'depart' ? q : prevArrive)) / 60)
      if (firstRide && req.mode === 'depart') labels.push({ text: `Bus in ${waitMin} min` })
      else if (!firstRide && waitMin > 0) labels.push({ text: `Wait ${waitMin} min` })
      legs.push({
        kind: 'bus', from, to, departAt: when(l.depart), arriveAt: when(l.arrive), durationS: l.arrive - l.depart, geometry, labels,
        route: { id: r.id, name: r.name, color: r.color },
        headsign: trip.headsign ?? pattern?.headsign,
        stops: stopTimes.map((st) => {
          const s = data.stops.find((x) => x.id === st.stopId)!
          return { id: s.id, name: s.name, location: s.location, at: when(Number(st.time.slice(0, 2)) * 3600 + Number(st.time.slice(3)) * 60) }
        }),
      })
      prevArrive = l.arrive
      firstRide = false
    }
    if (c.egressS > 0) legs.push(walkLeg(info.nodes[c.toStop], dest, stop(c.toStop), req.to, c.arriveS - c.egressS, c.egressS))
    return {
      kind: 'bus', departAt: when(c.departS), arriveAt: when(c.arriveS), durationS: c.arriveS - c.departS,
      walkS: c.walkS, transfers: c.journey.rides - 1, legs,
    }
  }
}
