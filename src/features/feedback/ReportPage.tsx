import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { LatLon } from '../../domain/schemas.ts'
import { Page } from '../../ui/Page.tsx'
import { MarkerLayer, RouteLayer } from '../map/layers.tsx'
import { useMapClicks } from '../map/useMapClicks.ts'
import { KIND_LABELS, reportUrl, type ShortcutReport } from './shortcutReport.ts'

/** Draw a line on the map, add a note, open the prefilled Google Form. `?id=` confirms an existing shortcut. */
export function ReportPage() {
  const [params] = useSearchParams()
  const [line, setLine] = useState<LatLon[]>([])
  const [kind, setKind] = useState<ShortcutReport['kind']>('footpath')
  const [note, setNote] = useState('')
  useMapClicks((p) => setLine((l) => [...l, p]))

  return (
    <Page title="Report a shortcut">
      <RouteLayer legs={line.length > 1 ? [{ mode: 'walk', path: line, style: 'likely' }] : []} />
      <MarkerLayer markers={line.map((position, i) => ({ id: `p${i}`, kind: 'place', position }))} />
      <p className="pending">Tap the map to draw the shortcut, start to end. {line.length} point{line.length === 1 ? '' : 's'}.</p>
      <div className="actions">
        <button type="button" className="btn btn-quiet" disabled={!line.length} onClick={() => setLine((l) => l.slice(0, -1))}>
          Undo
        </button>
        <button type="button" className="btn btn-quiet" disabled={!line.length} onClick={() => setLine([])}>
          Clear
        </button>
      </div>
      <label>
        Kind
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as ShortcutReport['kind'])}>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Note
        <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where it starts and ends, anything to know" />
      </label>
      {line.length < 2 ? (
        <button type="button" className="btn btn-primary" disabled>
          Open the form
        </button>
      ) : (
        <a className="btn btn-primary" target="_blank" rel="noreferrer" href={reportUrl({ kind, geometry: line, note, shortcutId: params.get('id') ?? undefined })}>
          Open the form
        </a>
      )}
      <p className="pending">The form opens prefilled. Tap Submit there to send it.</p>
    </Page>
  )
}
