import type { UserFix } from '../map/layers.tsx'
import { isOnCampus } from '../../domain/geo/pointInPolygon.ts'

export const LOW_ACCURACY_M = 100

export type LocationState =
  | { status: 'idle' | 'asking' | 'denied' | 'unavailable' | 'timeout' }
  | { status: 'ok' | 'low-accuracy' | 'off-campus'; fix: UserFix }

/** Where trips start from. Read this in the planner. */
export type StartPoint = { lat: number; lon: number; source: 'gps' | 'pin' | 'map' }

/** Too rough beats off-campus: a 5 km circle says nothing about which side of the fence you are on. */
export function classifyFix(fix: UserFix): LocationState {
  if (fix.accuracy > LOW_ACCURACY_M) return { status: 'low-accuracy', fix }
  if (!isOnCampus(fix)) return { status: 'off-campus', fix }
  return { status: 'ok', fix }
}

/** GeolocationPositionError.code: 1 denied, 2 unavailable, 3 timeout. */
export function classifyError(code: number): LocationState {
  return { status: code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable' }
}
