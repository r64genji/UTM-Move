import { useSearchParams } from 'react-router'
import { LocationControl } from '../location/LocationControl.tsx'
import { Page, Pending } from '../../ui/Page.tsx'
import { parseTrip, tripSearch, type Endpoint, type Profile } from './tripParams.ts'

const PROFILES: { id: Profile; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'sheltered', label: 'Sheltered' },
  { id: 'no-stairs', label: 'No stairs' },
]

const describe = (e: Endpoint | null) =>
  !e ? 'Choose a place' : e.kind === 'me' ? 'Your location' : e.kind === 'point' ? `${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}` : `${e.kind === 'stop' ? 'Stop' : 'Place'} ${e.id}`

export function PlanPage() {
  const [params, setParams] = useSearchParams()
  const trip = parseTrip(params)
  return (
    <Page title="Plan a trip">
      <dl className="trip-ends">
        <div>
          <dt>From</dt>
          <dd>{describe(trip.from)}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{describe(trip.to)}</dd>
        </div>
      </dl>
      <LocationControl />
      <div className="segmented" role="radiogroup" aria-label="Route type">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={trip.profile === p.id}
            onClick={() => setParams(new URLSearchParams(tripSearch({ ...trip, profile: p.id })), { replace: true })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Pending>Trip options arrive with ticket #27.</Pending>
    </Page>
  )
}
