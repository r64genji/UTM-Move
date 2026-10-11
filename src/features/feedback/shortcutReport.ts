// Prefilled Google Form links for "Report a shortcut" and "Did this shortcut work?".
// The form is the v1 Google Form; the field ids below are PLACEHOLDERS until the fields exist (docs/v2/BLOCKERS.md).
import type { LatLon, ShortcutKind } from '../../domain/schemas.ts'

export const SHORTCUT_FORM = {
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSfwLOnLvRxB2sJnAHIDMqcKtaVTYy8OR3KrJ_beSJKOIYxj0Q/viewform',
  entries: {
    kind: 'entry.1000000001',
    geometry: 'entry.1000000002',
    note: 'entry.1000000003',
    shortcutId: 'entry.1000000004',
    worked: 'entry.1000000005',
  },
}

/** The select options on the form, and the candidate kind each one means. */
export const KIND_LABELS: Record<Exclude<ShortcutKind, 'bridge'>, string> = {
  footpath: 'Footpath',
  'covered-walkway': 'Covered walkway',
  stairs: 'Stairs',
  'through-building': 'Through building',
}

/** `lat,lon;lat,lon` with 6 decimals (about 0.1 m). */
export const encodeGeometry = (line: LatLon[]) => line.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(';')

export function decodeGeometry(text: string): LatLon[] {
  return text
    .split(';')
    .map((pair) => pair.split(',').map(Number))
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
    .map(([lat, lon]) => ({ lat, lon }))
}

export type ShortcutReport = { kind: keyof typeof KIND_LABELS; geometry: LatLon[]; note?: string; shortcutId?: string }

function prefill(values: Record<string, string | undefined>, entries = SHORTCUT_FORM.entries) {
  const q = new URLSearchParams({ usp: 'pp_url' })
  for (const [field, value] of Object.entries(values)) if (value) q.set(entries[field as keyof typeof entries], value)
  return `${SHORTCUT_FORM.url}?${q}`
}

export const reportUrl = (r: ShortcutReport, entries?: typeof SHORTCUT_FORM.entries) =>
  prefill({ kind: KIND_LABELS[r.kind], geometry: encodeGeometry(r.geometry), note: r.note, shortcutId: r.shortcutId }, entries)

/** "Did this shortcut work?" answer. Pass the line walked when the shortcut id is not known. */
export const feedbackUrl = (a: { worked: boolean; shortcutId?: string; geometry?: LatLon[] }, entries?: typeof SHORTCUT_FORM.entries) =>
  prefill({ shortcutId: a.shortcutId, geometry: a.geometry && encodeGeometry(a.geometry), worked: a.worked ? 'Yes' : 'No' }, entries)
