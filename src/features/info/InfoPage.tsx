import { Icon } from '../../ui/icons.tsx'
import { Page } from '../../ui/Page.tsx'
import { useTransit } from '../transit/useTransit.ts'

const REASONS = [
  'Traffic congestion within and around campus',
  'Variable passenger boarding and alighting times',
  'Occasional bus maintenance or driver rotation',
  'Unscheduled service interruptions or breaks',
]

export function InfoPage() {
  const { data } = useTransit()
  return (
    <Page title="Disclaimer">
      <section className="warn-card">
        <div className="warn-head">
          <span className="warn-icon">
            <Icon name="warning" size={24} />
          </span>
          <h2>Important Notice</h2>
        </div>
        <h3>Arrival Time Accuracy</h3>
        <p>
          Bus times in this app come from the published timetable. They are <strong>estimates only</strong>: the app does not track buses live.
        </p>
        <p className="muted">Actual times may vary due to:</p>
        <ul>
          {REASONS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="tip">
          To make sure you do not miss your ride, arrive at the bus stop <strong>5 minutes before</strong> the scheduled time.
        </p>
      </section>
      <p className="fine-print">{data?.timetableNote ?? 'Timetable from 2025/2026. Times may change.'} Timetable only. No live bus positions.</p>
    </Page>
  )
}
