import { useParams } from 'react-router'
import { Page, Pending } from '../../ui/Page.tsx'

export function RoutePage() {
  const { id = '' } = useParams()
  return (
    <Page title={`Route ${id}`} kicker="Campus bus">
      <Pending>The route map and next-bus countdown arrive with ticket #29.</Pending>
    </Page>
  )
}
