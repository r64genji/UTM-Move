import * as Comlink from 'comlink'
import { dataUrl } from '../dataUrl.ts'
import { loadTransit } from '../features/transit/useTransit.ts'
import { decodeGraph } from '../domain/walk/graph.ts'
import { parsePlaces, planQuery, type RouterData, type TripQuery } from './routerApi.ts'

let loaded: Promise<RouterData> | null = null

async function load(placesUrl?: string): Promise<RouterData> {
  const [graph, transit, places] = await Promise.all([
    fetch(dataUrl('graph.bin')).then(async (r) => {
      if (!r.ok) throw new Error(`graph.bin: HTTP ${r.status}`)
      return decodeGraph(await r.arrayBuffer())
    }),
    loadTransit(),
    placesUrl ? fetch(placesUrl).then((r) => r.json()).then(parsePlaces) : [],
  ])
  return { graph, transit, places }
}

const api = {
  /** Load the data once. Later calls reuse it. Pass a places URL to enable `{ placeId }` endpoints. */
  async init(placesUrl?: string) {
    loaded ??= load(placesUrl).catch((e) => { loaded = null; throw e })
    await loaded
  },
  async planTrip(query: TripQuery) {
    loaded ??= load().catch((e) => { loaded = null; throw e })
    return planQuery(await loaded, query)
  },
}

export type RouterApi = typeof api
Comlink.expose(api)
