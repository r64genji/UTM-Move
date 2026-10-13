// One end of a trip: shows the chosen place and opens a search to change it.
// Searches places and stops with the same offline index as /search.
import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { dataUrl } from '../../dataUrl.ts'
import { Place } from '../../domain/schemas.ts'
import { search } from '../../domain/search.ts'
import { Icon } from '../../ui/icons.tsx'
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

type Hit = { key: string; name: string; hint: string; endpoint: Endpoint; kind: 'place' | 'stop' }

export function PlacePicker({ label, value, open, onOpenChange, onChange }: { label: 'From' | 'To'; value: Endpoint | null; open: boolean; onOpenChange: (open: boolean) => void; onChange: (e: Endpoint) => void }) {
  const [query, setQuery] = useState('')
  const index = useSearchIndex()
  const name = useEndpointName(value)
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, onOpenChange])

  const q = query.trim()
  const hits: Hit[] = !q || !index ? [] : search(index, q, null, 8).map((h) => ({
    key: h.id, name: h.name, hint: h.code || h.category, endpoint: { kind: h.kind, id: h.ref }, kind: h.kind,
  }))

  const choose = (e: Endpoint) => {
    onChange(e)
    onOpenChange(false)
    setQuery('')
  }

  return (
    <div className="picker" data-end={label} ref={root}>
      <button type="button" className="picker-value" aria-expanded={open} aria-label={`${label}: ${name ?? 'not set'}`} onClick={() => onOpenChange(!open)}>
        <span className="picker-dot" aria-hidden="true" />
        <span className="picker-label">{label}:</span>
        <span className={name ? 'picker-name' : 'picker-name picker-empty'}>{name ?? (label === 'To' ? 'Where to?' : 'Choose a place')}</span>
      </button>
      {open && (
        <div className="picker-panel" data-end={label}>
          <label className="picker-search">
            <span className="picker-dot" aria-hidden="true" />
            <input
              className="picker-input"
            type="search"
            autoFocus
              placeholder="Building, block code or bus stop"
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={listId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ul id={listId} className="list picker-list">
            <li>
              <button type="button" onClick={() => choose({ kind: 'me' })}>
                <span className="picker-icon picker-icon-me" aria-hidden="true"><Icon name="locate" size={20} /></span>
                <span className="picker-text">Your Location</span>
              </button>
            </li>
            {hits.map((h) => (
              <li key={h.key}>
                <button type="button" onClick={() => choose(h.endpoint)}>
                  <span className="picker-icon" aria-hidden="true"><Icon name={h.kind === 'stop' ? 'bus' : 'building'} size={20} /></span>
                  <span className="picker-text">{h.name}</span>
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
