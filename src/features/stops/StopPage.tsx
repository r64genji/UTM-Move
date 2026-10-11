import { useParams } from 'react-router'
import { Page, Pending } from '../../ui/Page.tsx'

export function StopPage() {
  const { id = '' } = useParams()
  return (
    <Page title={`Stop ${id}`} kicker="Bus stop">
      <Pending>Departures for this stop arrive with ticket #29.</Pending>
    </Page>
  )
}
