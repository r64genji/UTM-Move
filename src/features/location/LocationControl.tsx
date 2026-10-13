import { Icon } from '../../ui/icons.tsx'
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

  const handPlaced = !picking && start && start.source !== 'gps'
  let message: string = picking ? 'Tap the map where you are starting.' : ''
  // Off campus with a pin placed: the pin line below says what happens, the off-campus advice is done.
  if (!picking && !(handPlaced && status === 'off-campus')) {
    if (status === 'ok') message = `Found you on campus, accurate to about ${Math.round(location.fix.accuracy)} m.`
    else if (status === 'low-accuracy') message = `Your location is rough, about ${Math.round(location.fix.accuracy)} m. Drag the pin to where you are.`
    else message = MESSAGE[status]
  }
  const label = status === 'idle' || status === 'asking' ? 'Use my location' : status === 'ok' ? 'Update my location' : 'Try again'

  return (
    <section className="loc" aria-label="Your location">
      <p className="loc-msg" role="status" data-status={picking ? 'picking' : status}>
        {message}
      </p>
      {status === 'denied' && !picking && HOW_TO_ENABLE}
      {handPlaced && <p className="loc-msg">Starting from the pin you placed. Drag it to adjust.</p>}
      <div className="actions">
        {picking ? (
          <button type="button" className="btn btn-quiet" onClick={cancelPick}>
            Cancel
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={request} disabled={status === 'asking'}>
              <Icon name="locate" size={18} />
              {label}
            </button>
            <button type="button" className="btn btn-quiet" onClick={pickOnMap}>
              <Icon name="pin" size={18} />
              Pick on map
            </button>
          </>
        )}
      </div>
    </section>
  )
}
