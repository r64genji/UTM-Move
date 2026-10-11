import { Link } from 'react-router'
import { Page, Pending } from '../../ui/Page.tsx'
import { FitTo, Note, StopMarkers } from '../transit/parts.tsx'
import { useTransit } from '../transit/useTransit.ts'

export function StopsPage() {
  const { data, error } = useTransit()
  if (!data) return <Page title="Bus routes and stops"><Pending>{error ? 'The bus timetable could not be loaded.' : 'Loading the timetable...'}</Pending></Page>
  const stops = [...data.stops].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Page title="Bus routes and stops" kicker="Campus bus">
      <StopMarkers stops={data.stops} />
      <FitTo points={data.stops.filter((s) => !s.offCampus).map((s) => s.location)} maxZoom={16} />
      <Note />
      <section>
        <h2 className="section-title">Bus routes</h2>
        <ul className="list">
          {data.routes.map((r) => (
            <li key={r.id}>
              <Link to={`/route/${r.id}`}>
                <span className="route-chip" style={{ background: r.color }}>{r.id}</span>
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="section-title">All stops</h2>
        <ul className="list">
          {stops.map((s) => (
            <li key={s.id}>
              <Link to={`/stop/${encodeURIComponent(s.id)}`}>
                {s.name}
                <span className="list-code">{s.id}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
