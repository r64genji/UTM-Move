import type { Fix } from '../../domain/navigate/follow.ts'
import { useAppStore } from '../app/store.ts'
import { classifyError, classifyFix } from './state.ts'

/** Ask the browser for one position fix. Only ever called from a tap. */
export function requestLocation() {
  const { setLocation, setStart } = useAppStore.getState()
  if (!('geolocation' in navigator)) return setLocation({ status: 'unavailable' })
  setLocation({ status: 'asking' })
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const state = classifyFix({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy })
      setLocation(state)
      // A rough fix still starts the trip; the pin is there to be dragged. Off campus is not a usable start.
      if ('fix' in state && state.status !== 'off-campus') setStart({ lat: state.fix.lat, lon: state.fix.lon, source: 'gps' })
    },
    (err) => setLocation(classifyError(err.code)),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  )
}

/** Follow the device (navigation). Every fix also updates the shared location, so the blue dot moves. Returns the stop function. */
export function watchLocation(onFix: (fix: Fix) => void): () => void {
  const { setLocation } = useAppStore.getState()
  if (!('geolocation' in navigator)) {
    setLocation({ status: 'unavailable' })
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    ({ coords }) => {
      const fix = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }
      setLocation(classifyFix(fix))
      onFix({ ...fix, t: Date.now() })
    },
    (err) => setLocation(classifyError(err.code)),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
  )
  return () => navigator.geolocation.clearWatch(id)
}

/** Location state plus the actions the UI offers. Shared across pages through the store. */
export function useUserLocation() {
  const location = useAppStore((s) => s.location)
  const start = useAppStore((s) => s.start)
  const picking = useAppStore((s) => s.picking)
  const setPicking = useAppStore((s) => s.setPicking)
  const setSheet = useAppStore((s) => s.setSheet)
  return {
    location,
    start,
    picking,
    request: requestLocation,
    /** Next map tap sets the start. The sheet shrinks so the map is reachable on a phone. */
    pickOnMap: () => {
      setPicking(true)
      setSheet('peek')
    },
    cancelPick: () => {
      setPicking(false)
      setSheet('half')
    },
  }
}
