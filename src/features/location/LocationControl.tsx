import { useUserLocation } from './useUserLocation.ts'

const HOW_TO_ENABLE = (
  <ul className="loc-how">
    <li>
      <strong>Android Chrome:</strong> tap the lock icon beside the address, then Permissions, then set Location to Allow. Reload the page.
    </li>
    <li>
      <strong>iPhone Safari:</strong> open Settings, then Privacy &amp; Security, Location Services, Safari Websites. Choose While Using the App.
    </li>
  </ul>
)

const MESSAGE = {
  idle: 'We only ask for your location when you tap.',
  asking: 'Finding you…',
  denied: 'Location is blocked for this site.',
  unavailable: 'Your device could not work out where you are.',
  timeout: 'Finding you took too long. Try again outside or near a window.',
  'off-campus': 'You are not on the UTM campus. Pick your starting point on the map.',
} as const

/** The "Use my location" control: one button, one line saying what happened, and what to do next. */
export function LocationControl() {
  const { location, start, picking, request, pickOnMap, cancelPick } = useUserLocation()
  const { status } = location

  let message: string = picking ? 'Tap the map where you are starting.' : ''
  if (!picking) {
    if (status === 'ok') message = `Found you on campus, accurate to about ${Math.round(location.fix.accuracy)} m.`
    else if (status === 'low-accuracy') message = `Your location is rough, about ${Math.round(location.fix.accuracy)} m. Drag the pin to where you are.`
    else message = MESSAGE[status]
  }
  const handPlaced = !picking && start && start.source !== 'gps'
  const label = status === 'idle' || status === 'asking' ? 'Use my location' : status === 'ok' ? 'Update my location' : 'Try again'

  return (
    <section className="loc" aria-label="Your location">
      <button type="button" className="btn btn-primary loc-main" onClick={request} disabled={status === 'asking'}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        {label}
      </button>
      <p className="loc-msg" role="status" data-status={picking ? 'picking' : status}>
        {message}
      </p>
      {status === 'denied' && !picking && HOW_TO_ENABLE}
      {handPlaced && <p className="loc-msg">Starting from the pin you placed. Drag it to adjust.</p>}
      {picking ? (
        <div className="actions">
          <button type="button" className="btn btn-quiet" onClick={cancelPick}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="btn btn-quiet" onClick={pickOnMap}>
            Pick on map
          </button>
        </div>
      )}
    </section>
  )
}
