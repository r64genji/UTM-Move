// One end of a trip: shows the chosen place and opens a search to change it.
// Today it searches stops and (if /data/places.json exists) places. Ticket #26 replaces the search internals only.
import { useEffect, useId, useState } from 'react'
import { z } from 'zod'
import { Place } from '../../domain/schemas.ts'
import { useAppStore } from '../app/store.ts'
import { useMap } from '../map/MapContext.tsx'
import { useTransit } from '../transit/useTransit.ts'
import type { Endpoint } from './tripParams.ts'

let placesPromise: Promise<Place[]> | null = null

/** /data/places.json, or an empty list while that file does not exist yet. */
export function loadPlaces(): Promise<Place[]> {
  placesPromise ??= fetch('/data/places.json')
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
  if (e.kind === 'me') return 'My location'
  if (e.kind === 'point') return 'Dropped pin'
  if (e.kind === 'stop') return data?.stops.find((s) => s.id === e.id)?.name ?? `Stop ${e.id}`
  return places.find((p) => p.id === e.id)?.name ?? `Place ${e.id}`
}

type Hit = { key: string; name: string; hint: string; endpoint: Endpoint }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function PlacePicker({ label, value, onChange }: { label: string; value: Endpoint | null; onChange: (e: Endpoint) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data } = useTransit()
  const places = usePlaces()
  const map = useMap()
  const setSheet = useAppStore((s) => s.setSheet)
  const name = useEndpointName(value)
  const listId = useId()

  const q = norm(query)
  const hits: Hit[] = q
    ? [
        ...places
          .filter((p) => [p.name, ...p.aliases, p.blockCode ?? ''].some((t) => norm(t).includes(q)))
          .map((p) => ({ key: `place:${p.id}`, name: p.name, hint: p.blockCode ?? 'Place', endpoint: { kind: 'place', id: p.id } as Endpoint })),
        ...(data?.stops ?? [])
          .filter((s) => norm(`${s.name} ${s.id}`).includes(q))
          .map((s) => ({ key: `stop:${s.id}`, name: s.name, hint: 'Bus stop', endpoint: { kind: 'stop', id: s.id } as Endpoint })),
      ].slice(0, 8)
    : []

  const choose = (e: Endpoint) => {
    onChange(e)
    setOpen(false)
    setQuery('')
  }

  const pickOnMap = () => {
    if (!map) return
    setOpen(false)
    setSheet('peek')
    map.getCanvas().style.cursor = 'crosshair'
    map.once('click', (ev) => {
      map.getCanvas().style.cursor = ''
      setSheet('half')
      onChange({ kind: 'point', lat: ev.lngLat.lat, lon: ev.lngLat.lng })
    })
  }

  return (
    <div className="picker">
      <button type="button" className="picker-value" aria-expanded={open} aria-label={`${label}: ${name ?? 'not set'}`} onClick={() => setOpen(!open)}>
        <span className="picker-label">{label}</span>
        <span className={name ? 'picker-name' : 'picker-name picker-empty'}>{name ?? 'Choose a place'}</span>
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
              <button type="button" onClick={() => choose({ kind: 'me' })}>My location</button>
            </li>
            <li>
              <button type="button" onClick={pickOnMap} disabled={!map}>Pick on map</button>
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
