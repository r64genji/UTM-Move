// RAPTOR (Round bAsed Public Transit Optimized Router) over transit.json for one service date.
// Rounds = rides: round k finds the best arrival at each stop using k rides. Footpaths run after each round.
// Reverse search (arrive-by) runs the same code on a mirrored timetable: trips reversed, times negated.
import type { TransitData } from '../schemas.ts'
import { runsOn } from './departures.ts'

/** Footpaths: from stop id to nearby stops with walking seconds. */
export type Transfers = ReadonlyMap<string, readonly { to: string; secs: number }[]>

export interface RaptorQuery {
  /** Service date, YYYY-MM-DD in Asia/Kuala_Lumpur. */
  date: string
  /** forward: earliest time at each source stop. reverse: latest time you may be at each source stop. Seconds after midnight. */
  sources: ReadonlyMap<string, number>
  direction?: 'forward' | 'reverse'
  transfers?: Transfers
  /** Default 2, so up to 3 rides. */
  maxTransfers?: number
  /** Least seconds between getting off one bus and leaving on the next, walking included. Default 0. */
  changeS?: number
}

/** Legs are in travel order. depart/arrive are real seconds after midnight, whatever the direction. */
export type RaptorLeg =
  | { kind: 'ride'; tripId: string; from: string; to: string; boardPos: number; alightPos: number; depart: number; arrive: number }
  | { kind: 'walk'; from: string; to: string; depart: number; arrive: number }

export interface RaptorJourney {
  /** The stop this journey was asked for: where you arrive (forward) or where you start (reverse). */
  rides: number
  legs: RaptorLeg[]
}

export interface RaptorResult {
  /** One journey per ride count that improves the stop's time: fewer rides come first. Empty if unreachable. */
  journeysTo(stopId: string): RaptorJourney[]
}

interface Trip { id: string; len: number; times: Float64Array }
interface Pat { stops: Int32Array; trips: Trip[] }
interface Timetable { ids: string[]; index: Map<string, number>; patterns: Pat[]; byStop: Int32Array[] }

const cache = new WeakMap<TransitData, Map<string, Timetable>>()
const toSec = (hhmm: string) => (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60

function timetable(data: TransitData, date: string, mirror: boolean): Timetable {
  const key = `${date}|${mirror}`
  let perData = cache.get(data)
  if (!perData) cache.set(data, (perData = new Map()))
  const hit = perData.get(key)
  if (hit) return hit

  const ids = data.stops.map((s) => s.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const running = new Set(data.calendars.filter((c) => runsOn(c, date)).map((c) => c.id))
  const groups = new Map<string, Pat>()
  for (const t of data.trips) {
    if (!running.has(t.calendarId)) continue
    let seq = t.stopTimes.map((st) => st.stopId)
    let times = t.stopTimes.map((st) => toSec(st.time))
    if (mirror) { seq = seq.reverse(); times = times.reverse().map((x) => -x) }
    const k = `${t.routeId}>${seq.join(',')}`
    let p = groups.get(k)
    if (!p) groups.set(k, (p = { stops: Int32Array.from(seq, (s) => index.get(s) ?? -1), trips: [] }))
    p.trips.push({ id: t.id, len: seq.length, times: Float64Array.from(times) })
  }
  const patterns = [...groups.values()].filter((p) => !p.stops.includes(-1))
  for (const p of patterns) p.trips.sort((a, b) => a.times[0] - b.times[0])
  const lists: number[][] = ids.map(() => [])
  patterns.forEach((p, i) => new Set(p.stops).forEach((s) => lists[s].push(i)))
  const tt = { ids, index, patterns, byStop: lists.map((l) => Int32Array.from(l)) }
  perData.set(key, tt)
  return tt
}

type Label =
  | { type: 'source' }
  | { type: 'ride'; pat: number; trip: number; board: number; pos: number }
  | { type: 'walk'; from: number }

/** First trip index whose time at `pos` is at least `t`, or -1. */
function firstTrip(p: Pat, pos: number, t: number): number {
  let lo = 0
  let hi = p.trips.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (p.trips[mid].times[pos] < t) lo = mid + 1
    else hi = mid
  }
  return lo < p.trips.length ? lo : -1
}

export function raptor(data: TransitData, q: RaptorQuery): RaptorResult {
  const mirror = q.direction === 'reverse'
  const tt = timetable(data, q.date, mirror)
  const n = tt.ids.length
  const rounds = (q.maxTransfers ?? 2) + 1
  const sign = mirror ? -1 : 1
  const change = q.changeS ?? 0

  // Footpaths in search direction. A mirrored search walks them backwards.
  const foot: { to: number; secs: number }[][] = tt.ids.map(() => [])
  for (const [from, list] of q.transfers ?? []) {
    for (const { to, secs } of list) {
      const a = tt.index.get(from)
      const b = tt.index.get(to)
      if (a === undefined || b === undefined) continue
      if (mirror) foot[b].push({ to: a, secs })
      else foot[a].push({ to: b, secs })
    }
  }

  const tau = Array.from({ length: rounds + 1 }, () => new Float64Array(n).fill(Infinity))
  const label: (Label | undefined)[][] = Array.from({ length: rounds + 1 }, () => new Array(n))
  /** When the last bus was left before reaching each stop in each round (a walk keeps the time of the ride before it). */
  const off = Array.from({ length: rounds + 1 }, () => new Float64Array(n).fill(-Infinity))
  const best = new Float64Array(n).fill(Infinity)

  const walk = (k: number, from: number[]) => {
    const added: number[] = []
    for (const s of from) {
      for (const f of foot[s]) {
        const a = tau[k][s] + f.secs
        if (a < best[f.to]) {
          tau[k][f.to] = a
          best[f.to] = a
          off[k][f.to] = off[k][s]
          label[k][f.to] = { type: 'walk', from: s }
          added.push(f.to)
        }
      }
    }
    return added
  }

  let marked: number[] = []
  for (const [id, t] of q.sources) {
    const s = tt.index.get(id)
    if (s === undefined || sign * t >= best[s]) continue
    tau[0][s] = best[s] = sign * t
    label[0][s] = { type: 'source' }
    marked.push(s)
  }
  marked.push(...walk(0, marked))

  for (let k = 1; k <= rounds; k++) {
    const firstPos = new Map<number, number>()
    for (const s of marked) {
      for (const pi of tt.byStop[s]) {
        const pos = tt.patterns[pi].stops.indexOf(s)
        if (pos < (firstPos.get(pi) ?? Infinity)) firstPos.set(pi, pos)
      }
    }
    const rode: number[] = []
    for (const [pi, start] of firstPos) {
      const p = tt.patterns[pi]
      let trip = -1
      let board = -1
      let boardPrev = Infinity
      for (let i = start; i < p.stops.length; i++) {
        const s = p.stops[i]
        if (trip >= 0) {
          const a = p.trips[trip].times[i]
          if (a < best[s]) {
            tau[k][s] = best[s] = off[k][s] = a
            label[k][s] = { type: 'ride', pat: pi, trip, board, pos: i }
            rode.push(s)
          }
        }
        // After a ride (round 2 on), the next bus leaves at least `change` after getting off the last one. A walk between them counts.
        const prev = k > 1 ? Math.max(tau[k - 1][s], off[k - 1][s] + change) : tau[k - 1][s]
        if (prev < Infinity && (trip < 0 || prev <= p.trips[trip].times[i])) {
          const t = firstTrip(p, i, prev)
          // The same bus is caught here no later than where we boarded it: board here (less walking to the stop, more time to change).
          if (t >= 0 && (trip < 0 || t < trip || (t === trip && prev <= boardPrev))) { trip = t; board = i; boardPrev = prev }
        }
      }
    }
    marked = [...new Set([...rode, ...walk(k, rode)])]
    if (!marked.length) break
  }

  const journey = (stop: number, k: number): RaptorJourney => {
    const legs: RaptorLeg[] = []
    let cur = stop
    for (let r = k; ; ) {
      const l = label[r][cur]!
      if (l.type === 'source') break
      if (l.type === 'walk') {
        legs.push({ kind: 'walk', from: tt.ids[l.from], to: tt.ids[cur], depart: tau[r][l.from], arrive: tau[r][cur] })
        cur = l.from
      } else {
        const p = tt.patterns[l.pat]
        const trip = p.trips[l.trip]
        legs.push({ kind: 'ride', tripId: trip.id, from: tt.ids[p.stops[l.board]], to: tt.ids[cur], boardPos: l.board, alightPos: l.pos, depart: trip.times[l.board], arrive: trip.times[l.pos] })
        cur = p.stops[l.board]
        r--
      }
    }
    // `legs` runs against the search direction. A mirrored search flips it into travel order.
    if (!mirror) legs.reverse()
    const real = legs.map((l): RaptorLeg => {
      if (!mirror) return l
      const [depart, arrive] = [-l.arrive, -l.depart]
      if (l.kind === 'walk') return { kind: 'walk', from: l.to, to: l.from, depart, arrive }
      const len = data.trips.find((t) => t.id === l.tripId)!.stopTimes.length
      return { ...l, from: l.to, to: l.from, boardPos: len - 1 - l.alightPos, alightPos: len - 1 - l.boardPos, depart, arrive }
    })
    return { rides: k, legs: real }
  }

  return {
    journeysTo(stopId) {
      const s = tt.index.get(stopId)
      if (s === undefined) return []
      const out: RaptorJourney[] = []
      let bestSoFar = Infinity
      for (let k = 0; k <= rounds; k++) {
        if (tau[k][s] < bestSoFar) {
          bestSoFar = tau[k][s]
          out.push(journey(s, k))
        }
      }
      return out
    },
  }
}
