import { useEffect } from 'react'
import type { Fix } from '../../domain/navigate/follow.ts'
import { useAppStore } from '../app/store.ts'
import { classifyError, classifyFix } from './state.ts'

/** Ask the browser for one position fix. Called from a tap, or on load when the permission is already granted (no prompt). */
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
  return {
    location,
    start,
    picking,
    request: requestLocation,
    /** Next map tap sets the start. The shell hides the panel meanwhile so the map is reachable. */
    pickOnMap: () => setPicking(true),
    cancelPick: () => setPicking(false),
  }
}

/** When the device already allows location, ask at once (no prompt appears). Otherwise wait for a tap. */
export function useGrantedLocation() {
  const status = useAppStore((s) => s.location.status)
  useEffect(() => {
    if (status !== 'idle') return
    navigator.permissions?.query({ name: 'geolocation' }).then(
      (p) => p.state === 'granted' && useAppStore.getState().location.status === 'idle' && requestLocation(),
      () => {},
    )
  }, [status])
  // Off campus: keep listening, so the start appears by itself once the user is on campus. A placed pin stays.
  // Errors are ignored: a slow fix indoors must not replace the off-campus advice.
  useEffect(() => {
    if (status !== 'off-campus' || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const { start, setLocation, setStart } = useAppStore.getState()
        const state = classifyFix({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy })
        setLocation(state)
        if ('fix' in state && state.status !== 'off-campus' && !start) setStart({ lat: state.fix.lat, lon: state.fix.lon, source: 'gps' })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [status])
}
