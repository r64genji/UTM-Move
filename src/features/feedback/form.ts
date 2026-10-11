// The v1 "Send Feedback" Google Form (University Bus App Feedback Form). One place, so every feature that prefills it agrees.
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdCnuw2A3BepSKT5rwRmE6ScBmIbJhtj2sQ67v9Nzih_DOHmw/viewform'

/** Entry ids read from the form page. The form has no origin/destination/minutes fields, so all text goes in the free-text question. */
export const FEEDBACK_ENTRY = {
  /** "What new features or improvements would you like to see in the next version?" */
  freeText: 'entry.1462771476',
} as const

/** Link to the form with the free-text question filled in. */
export function feedbackUrl(text: string): string {
  return `${FORM}?usp=pp_url&${FEEDBACK_ENTRY.freeText}=${encodeURIComponent(text)}`
}

/** The "trip finished" message: where, planned minutes against real minutes. */
export function tripTimeText(t: { from: string; to: string; plannedMin: number; actualMin: number }): string {
  return `Trip time: ${t.from} to ${t.to}. Planned ${t.plannedMin} min, real ${t.actualMin} min.`
}
