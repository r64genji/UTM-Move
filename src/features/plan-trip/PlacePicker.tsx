// One end of a trip: shows the chosen place and opens a search to change it.
// Searches places and stops with the same offline index as /search.
import { useEffect, useId, useState } from 'react'
import { z } from 'zod'
import { dataUrl } from '../../dataUrl.ts'
import { Place } from '../../domain/schemas.ts'
import { search } from '../../domain/search.ts'
import { useSearchIndex } from '../places/useSearch.ts'
import { useTransit } from '../transit/useTransit.ts'
import type { Endpoint } from './tripParams.ts'

let placesPromise: Promise<Place[]> | null = null

/** /data/places.json, or an empty list while that file does not exist yet. */
export function loadPlaces(): Promise<Place[]> {
  placesPromise ??= fetch(dataUrl('places.json'))
    .then((r) => (r.ok ? r.json() : []))
    .then((json) => z.array(Place).parse(json))
    .catch(() => [])
  return placesPromise
}

export function usePlaces(): Place[] {
  const [places, setPlaces] = useState<Place[]>([])
  useEffect(() => {
    let live = true
    loadPlaces().then((p) => live && setPlaces(p))
    return () => void (live = false)
  }, [])
  return places
}

/** The name to show for an endpoint. */
export function useEndpointName(e: Endpoint | null): string | null {
  const { data } = useTransit()
  const places = usePlaces()
  if (!e) return null
  if (e.kind === 'me') return 'Your Location'
  if (e.kind === 'point') return 'Dropped pin'
  if (e.kind === 'stop') return data?.stops.find((s) => s.id === e.id)?.name ?? `Stop ${e.id}`
  return places.find((p) => p.id === e.id)?.name ?? `Place ${e.id}`
}

type Hit = { key: string; name: string; hint: string; endpoint: Endpoint }

export function PlacePicker({ label, value, onChange }: { label: 'From' | 'To'; value: Endpoint | null; onChange: (e: Endpoint) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const index = useSearchIndex()
  const name = useEndpointName(value)
  const listId = useId()

  const q = query.trim()
  const hits: Hit[] = !q || !index ? [] : search(index, q, null, 8).map((h) => ({
    key: h.id, name: h.name, hint: h.code || h.category, endpoint: { kind: h.kind, id: h.ref },
  }))

  const choose = (e: Endpoint) => {
    onChange(e)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="picker" data-end={label}>
      <button type="button" className="picker-value" aria-expanded={open} aria-label={`${label}: ${name ?? 'not set'}`} onClick={() => setOpen(!open)}>
        <span className="picker-dot" aria-hidden="true" />
        <span className="picker-label">{label}:</span>
        <span className={name ? 'picker-name' : 'picker-name picker-empty'}>{name ?? (label === 'To' ? 'Where to?' : 'Choose a place')}</span>
      </button>
      {open && (
        <div className="picker-panel">
          <input
            className="field"
            type="search"
            autoFocus
            placeholder="Building, block code or bus stop"
            aria-label={`Search ${label.toLowerCase()}`}
            aria-controls={listId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul id={listId} className="list picker-list">
            <li>
              <button type="button" onClick={() => choose({ kind: 'me' })}>Your Location</button>
            </li>
            {hits.map((h) => (
              <li key={h.key}>
                <button type="button" onClick={() => choose(h.endpoint)}>
                  {h.name}
                  <span className="list-code">{h.hint}</span>
                </button>
              </li>
            ))}
            {q && hits.length === 0 && <li className="picker-none">Nothing matches "{query}".</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
