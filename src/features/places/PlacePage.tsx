import { Link, useParams } from 'react-router'
import { Page, Pending } from '../../ui/Page.tsx'
import { feedbackUrl } from '../feedback/form.ts'
import { MarkerLayer } from '../map/layers.tsx'
import { usePlaces } from '../plan-trip/PlacePicker.tsx'
import { FitTo } from '../transit/parts.tsx'


export function PlacePage() {
  const { id = '' } = useParams()
  const places = usePlaces()
  const place = places.find((p) => p.id === id)

  if (!place) {
    return (
      <Page title="Place" kicker="Place">
        <Pending>{places.length ? 'There is no place with this link.' : 'Loading the place...'}</Pending>
      </Page>
    )
  }

  const entrances = place.entrances ?? []
  return (
    <Page title={place.name} kicker={place.category}>
      <MarkerLayer
        markers={[
          { id: place.id, kind: 'place', position: place.location, label: place.name, selected: true },
          ...entrances.map((position, i) => ({ id: `${place.id}-door-${i}`, kind: 'place' as const, position, label: 'Entrance' })),
        ]}
      />
      <FitTo points={[place.location, ...entrances]} maxZoom={18} />
      <dl className="facts">
        {place.blockCode && (
          <>
            <dt>Building</dt>
            <dd>{place.blockCode}</dd>
          </>
        )}
        {place.aliases.length > 0 && (
          <>
            <dt>Also called</dt>
            <dd>{place.aliases.join(', ')}</dd>
          </>
        )}
        <dt>Entrance</dt>
        <dd>{entrances.length ? `${entrances.length} marked on the map` : 'Not marked yet. The pin is the middle of the building.'}</dd>
      </dl>
      <div className="actions">
        <Link className="btn btn-primary" to={`/plan?from=me&to=place:${encodeURIComponent(id)}`}>
          Directions
        </Link>
        <a
          className="btn btn-quiet"
          target="_blank"
          rel="noreferrer"
          href={feedbackUrl(`Problem with place "${place.name}" (${place.id}): `)}
        >
          Report a problem
        </a>
      </div>
    </Page>
  )
}
