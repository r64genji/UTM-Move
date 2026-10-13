// Explore: pick a kind of place (food, prayer, ...) and see the closest ones on the map and in a list.
import { useMemo } from 'react'
import { Link } from 'react-router'
import type { Category, LatLon, Place } from '../../domain/schemas.ts'
import { distanceM } from '../../domain/walk/geo.ts'
import { Icon, type IconName } from '../../ui/icons.tsx'
import { MarkerLayer } from '../map/layers.tsx'
import { usePlaces } from '../plan-trip/PlacePicker.tsx'
import { FitTo } from '../transit/parts.tsx'

const is = (category: Category) => (p: Place) => p.category === category
/** Shops are one category in the data; split them by name. A place can fit two (Student2Shop prints and sells snacks). */
const shop = (words: RegExp) => (p: Place) => p.category === 'Shop/Service' && words.test([p.name, ...p.aliases].join(' '))
const CONVENIENCE = /mart\b|minimart|market|convenience|sebaneka|mynews/i
const PRINTING = /print|photocop|fotokopi|fotostat|photostat|stationery/i
const LAUNDRY = /laundry|dobi/i

export const NEARBY: { label: string; icon: IconName; match: (p: Place) => boolean }[] = [
  { label: 'Food', icon: 'food', match: is('Food') },
  { label: 'Prayer', icon: 'prayer', match: is('Prayer') },
  { label: 'Convenience', icon: 'cart', match: shop(CONVENIENCE) },
  { label: 'Printing', icon: 'print', match: shop(PRINTING) },
  { label: 'Laundry', icon: 'laundry', match: shop(LAUNDRY) },
  { label: 'Faculties', icon: 'building', match: is('Faculty/Academic') },
  { label: 'Library', icon: 'book', match: is('Library') },
  { label: 'ATM', icon: 'card', match: is('Bank/ATM') },
  { label: 'Health', icon: 'health', match: is('Health') },
  { label: 'Sport', icon: 'sport', match: is('Sport') },
  { label: 'Parking', icon: 'parking', match: is('Parking') },
  { label: 'More shops', icon: 'shop', match: (p) => p.category === 'Shop/Service' && ![CONVENIENCE, PRINTING, LAUNDRY].some((w) => w.test([p.name, ...p.aliases].join(' '))) },
]

/** A chip's label. */
export type NearbyKind = string

export type NearbyPlace = Place & { distanceM: number | null }

/** Places for one chip, closest first when we know where you are, else A to Z. */
export function useNearbyPlaces(kind: NearbyKind | null, from: LatLon | null): NearbyPlace[] {
  const places = usePlaces()
  return useMemo(() => {
    const match = NEARBY.find((n) => n.label === kind)?.match
    if (!match) return []
    const list = places.filter(match).map((p) => ({ ...p, distanceM: from ? distanceM(from, p.location) : null }))
    return from ? list.sort((a, b) => a.distanceM! - b.distanceM!) : list.sort((a, b) => a.name.localeCompare(b.name))
  }, [places, kind, from])
}

const away = (m: number | null) => (m === null ? null : `${Math.max(1, Math.round(m / 80))} min · ${m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`}`)

export function NearbyChips({ kind, onChange }: { kind: NearbyKind | null; onChange: (k: NearbyKind | null) => void }) {
  return (
    <div className="chips" role="group" aria-label="Find places nearby">
      {NEARBY.map((n) => (
        <button key={n.label} type="button" className="chip chip-place" aria-pressed={kind === n.label} onClick={() => onChange(kind === n.label ? null : n.label)}>
          <Icon name={n.icon} size={16} />
          {n.label}
          <span className="chip-x">
            <Icon name="close" size={14} />
          </span>
        </button>
      ))}
    </div>
  )
}

/** Pins for the list, and the map moved to show you plus the closest few (or the chosen one). */
export function NearbyMarkers({ places, selectedId, from, onSelect }: { places: NearbyPlace[]; selectedId: string | null; from: LatLon | null; onSelect: (id: string) => void }) {
  const markers = places.map((p) => ({ id: p.id, kind: 'place' as const, position: p.location, label: p.name, selected: p.id === selectedId }))
  const selected = places.find((p) => p.id === selectedId)
  const fit = selected ? [selected.location] : from ? [from, ...places.slice(0, 5).map((p) => p.location)] : places.map((p) => p.location)
  return (
    <>
      <MarkerLayer markers={markers} onSelect={(m) => onSelect(m.id)} />
      <FitTo points={fit} />
    </>
  )
}

export function NearbyPanel({ kind: label, places, located, selectedId, onSelect }: { kind: NearbyKind; places: NearbyPlace[]; located: boolean; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const icon = NEARBY.find((n) => n.label === label)?.icon ?? 'pin'
  const selected = places.find((p) => p.id === selectedId)

  if (selected)
    return (
      <section className="nearby" aria-label={selected.name}>
        <div className="sheet-head">
          <button type="button" className="icon-btn" aria-label={`Back to ${label}`} onClick={() => onSelect(null)}>
            <Icon name="back" size={22} />
          </button>
          <div>
            <h2 className="sheet-title">{selected.name}</h2>
            <p className="muted">{[selected.blockCode, selected.category, away(selected.distanceM)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <Link to={`/plan?from=me&to=place:${encodeURIComponent(selected.id)}`} className="btn btn-primary">
          <Icon name="go" size={20} />
          Directions
        </Link>
      </section>
    )

  return (
    <section className="nearby" aria-label={`${label} nearby`}>
      <h2 className="sheet-title">
        {label} {located ? 'near you' : 'on campus'} ({places.length})
      </h2>
      {!located && <p className="muted">Turn on location to see what's closest.</p>}
      <ul className="rows">
        {places.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onSelect(p.id)}>
              <span className="row-icon">
                <Icon name={icon} size={22} />
              </span>
              <span className="row-text">
                <strong>{p.name}</strong>
                {p.blockCode && <span className="muted">{p.blockCode}</span>}
              </span>
              {p.distanceM !== null && <span className="nearby-away">{away(p.distanceM)}</span>}
            </button>
          </li>
        ))}
        {places.length === 0 && <li className="pending">Nothing here yet.</li>}
      </ul>
    </section>
  )
}
