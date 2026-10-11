import * as Comlink from 'comlink'
import type { RouterApi } from '../../workers/router.worker.ts'

let client: Comlink.Remote<RouterApi> | null = null

/** The router worker, created on first use. */
export function getRouter(): Comlink.Remote<RouterApi> {
  client ??= Comlink.wrap<RouterApi>(new Worker(new URL('../../workers/router.worker.ts', import.meta.url), { type: 'module' }))
  return client
}

export type { TripQuery, Spot } from '../../workers/routerApi.ts'
