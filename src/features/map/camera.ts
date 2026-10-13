// The one place that moves the camera. The bottom sheet's padding and a "fit these points" request used to run as
// two separate moves and cancel each other; here both feed one target and the camera lands once.
import type { LngLatLike, Map, PaddingOptions } from 'maplibre-gl'
import type { LatLon } from '../../domain/schemas.ts'
import { toLngLat } from './geo.ts'

/** Same curve as --ease-out in app.css (ease-out quart). */
export const EASE_OUT = (t: number) => 1 - (1 - t) ** 4
export const EASE_MS = 450 // short moves
export const FLY_MS = 900 // long jumps

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

type Fit = { points: LatLon[]; maxZoom: number; top: number }
type Inset = { top: number; bottom: number; hidden: boolean }
type Camera = { center: LngLatLike; zoom: number }
type State = Inset & { fit: Fit | null; settled: boolean; frame: number; busyUntil: number; goal: Camera | null }

const states = new WeakMap<Map, State>()
const stateOf = (map: Map) => {
  let s = states.get(map)
  if (!s) states.set(map, (s = { top: 0, bottom: 0, hidden: false, fit: null, settled: false, frame: 0, busyUntil: 0, goal: null }))
  return s
}

const bottomOf = (s: State) => (s.hidden ? 0 : s.bottom)

/** Padding the camera should rest at: clear of the sheet, plus a margin around fitted points. */
function paddingOf(s: State): PaddingOptions {
  return s.fit
    ? { top: Math.max(s.top, s.fit.top), right: 64, bottom: bottomOf(s) + 48, left: 48 }
    : { top: s.top, right: 0, bottom: bottomOf(s), left: 0 }
}

/** Fly for long jumps, ease for short ones. Always the same curve, never a cut except `instant`. */
export function go(map: Map, camera: Camera, padding?: PaddingOptions, instant = false) {
  const s = stateOf(map)
  const here = map.project(map.getCenter())
  const there = map.project(camera.center)
  const far = Math.hypot(here.x - there.x, here.y - there.y) > 1.2 * Math.max(map.getCanvas().clientWidth, map.getCanvas().clientHeight) || Math.abs(map.getZoom() - camera.zoom) > 3
  const duration = instant || reducedMotion() ? 0 : far ? FLY_MS : EASE_MS
  const move = far ? map.flyTo.bind(map) : map.easeTo.bind(map)
  move({ ...camera, padding: padding ?? paddingOf(s), duration, easing: EASE_OUT })
  // Remembered while it flies, so a padding change in the meantime re-aims it instead of cancelling it.
  s.goal = camera
  s.busyUntil = performance.now() + duration
  return duration
}

/** Keep `center` on screen while it moves (a followed dot): one short linear leg per update, so legs join up. */
export function trackTo(map: Map, center: LngLatLike, ms: number) {
  map.easeTo({ center, padding: paddingOf(stateOf(map)), duration: reducedMotion() ? 0 : ms, easing: (t) => t })
}

function cameraFor(map: Map, fit: Fit, padding: PaddingOptions) {
  if (fit.points.length === 1) return { center: toLngLat(fit.points[0]), zoom: Math.max(map.getZoom(), 16.5) }
  const lons = fit.points.map((p) => p.lon)
  const lats = fit.points.map((p) => p.lat)
  const cam = map.cameraForBounds([toLngLat({ lat: Math.min(...lats), lon: Math.min(...lons) }), toLngLat({ lat: Math.max(...lats), lon: Math.max(...lons) })], { padding, absolutePadding: true, maxZoom: fit.maxZoom })
  return cam?.center && cam.zoom !== undefined ? { center: cam.center, zoom: cam.zoom } : null
}

function apply(map: Map) {
  const s = stateOf(map)
  s.frame = 0
  if (!map.getContainer().isConnected) return
  const padding = paddingOf(s)
  const instant = !s.settled // first load: no animation
  s.settled = true
  const cam = (s.fit && cameraFor(map, s.fit, padding)) || (performance.now() < s.busyUntil ? s.goal : null)
  if (cam) return void go(map, cam, padding, instant)
  map.easeTo({ padding, duration: instant || reducedMotion() ? 0 : EASE_MS, easing: EASE_OUT })
  s.busyUntil = performance.now() + (instant ? 0 : EASE_MS)
  s.goal = null
}

const schedule = (map: Map) => {
  const s = stateOf(map)
  if (!s.frame) s.frame = requestAnimationFrame(() => apply(map))
}

/**
 * Tell the camera what covers the map (sheet below, cards above). `ease` settles with one move; `follow` tracks a
 * resizing sheet frame by frame, so the map and the sheet move as one.
 */
export function setInset(map: Map, patch: Partial<Inset>, how: 'ease' | 'follow' = 'ease') {
  const s = stateOf(map)
  const before = paddingOf(s)
  Object.assign(s, patch)
  const root = document.documentElement
  root.style.setProperty('--sheet-h', `${bottomOf(s)}px`)
  // Not enough map left above the sheet for the locate button: it fades out instead of covering the sheet.
  root.toggleAttribute('data-no-room', window.innerHeight - bottomOf(s) < 300)
  const after = paddingOf(s)
  if (before.top === after.top && before.bottom === after.bottom && s.settled) return
  // A fit still in flight keeps going (re-aimed), so the camera lands once.
  if (how === 'ease' || !s.settled || performance.now() < s.busyUntil) return schedule(map)
  map.jumpTo({ padding: after })
}

/** Ask the camera to show these points (above the sheet, below `top` px of floating cards). Returns the undo. */
export function setFit(map: Map, fit: Fit) {
  const s = stateOf(map)
  s.fit = fit
  schedule(map)
  return () => {
    if (s.fit === fit) s.fit = null
  }
}
