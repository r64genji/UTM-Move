import type { LatLon } from '../../domain/schemas.ts'
import { feedbackUrl } from './shortcutReport.ts'

/** "Did this shortcut work?" Opens the Google Form prefilled; the user taps submit there. */
export function ShortcutFeedback({ shortcutId, geometry }: { shortcutId?: string; geometry?: LatLon[] }) {
  return (
    <div className="shortcut-feedback" role="group" aria-label="Did this shortcut work?">
      <p>Did this shortcut work?</p>
      <div className="actions">
        {[true, false].map((worked) => (
          <a key={String(worked)} className="btn btn-quiet" href={feedbackUrl({ worked, shortcutId, geometry })} target="_blank" rel="noreferrer">
            {worked ? 'Yes' : 'No'}
          </a>
        ))}
      </div>
    </div>
  )
}
