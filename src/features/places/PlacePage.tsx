import { Link, useParams } from 'react-router'
import { Page, Pending } from '../../ui/Page.tsx'

export function PlacePage() {
  const { id = '' } = useParams()
  return (
    <Page title={id} kicker="Place">
      <div className="actions">
        <Link className="btn btn-primary" to={`/plan?from=me&to=place:${encodeURIComponent(id)}`}>
          Directions
        </Link>
      </div>
      <Pending>Place details load once the places data is built.</Pending>
    </Page>
  )
}
