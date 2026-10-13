import * as Comlink from 'comlink'
import { TRANSFER_PENALTY_S, type Plan, type TripOption } from '../../domain/router/planTrip.ts'
import type { RouterApi } from '../../workers/router.worker.ts'
import type { Spot } from '../../workers/routerApi.ts'
import { dataUrl } from '../../dataUrl.ts'
import { loadPlaces } from './PlacePicker.tsx'
import type { Endpoint, Trip } from './tripParams.ts'

let client: Comlink.Remote<RouterApi> | null = null

/** The router worker, created on first use. */
export function getRouter(): Comlink.Remote<RouterApi> {
  client ??= Comlink.wrap<RouterApi>(new Worker(new URL('../../workers/router.worker.ts', import.meta.url), { type: 'module' }))
  return client
}

export type { TripQuery, Spot } from '../../workers/routerApi.ts'

/** Plan a trip from its URL form. `me` is `start`. Options come back fastest first, each change of bus counted as TRANSFER_PENALTY_S. */
export async function planFor(trip: Trip, start: { lat: number; lon: number } | null, at: Date): Promise<Plan> {
  const spot = (e: Endpoint): Spot => {
    if (e.kind === 'me') return { lat: start!.lat, lon: start!.lon }
    if (e.kind === 'point') return { lat: e.lat, lon: e.lon }
    return e.kind === 'stop' ? { stopId: e.id } : { placeId: e.id }
  }
  if (Number.isNaN(at.getTime())) throw new Error('That time is not valid.')
  const router = getRouter()
  const hasPlaces = (await loadPlaces()).length > 0
  await router.init(hasPlaces ? dataUrl('places.json') : undefined)
  const plan = await router.planTrip({
    from: spot(trip.from!),
    to: spot(trip.to!),
    when: { type: trip.when.type === 'arrive' ? 'arrive' : 'depart', at: at.toISOString() },
    profile: trip.profile,
  })
  const time = (o: TripOption) => o.durationS + TRANSFER_PENALTY_S * o.transfers
  const order = trip.profile === 'least-walk' ? (a: TripOption, b: TripOption) => a.walkS - b.walkS || time(a) - time(b) : (a: TripOption, b: TripOption) => time(a) - time(b)
  return { options: [...plan.options].sort(order) }
}
