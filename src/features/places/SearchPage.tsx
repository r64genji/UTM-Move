import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Category } from '../../domain/schemas.ts'
import { search, type SearchHit } from '../../domain/search.ts'
import { Page, Pending } from '../../ui/Page.tsx'
import { useAppStore } from '../app/store.ts'
import { MarkerLayer } from '../map/layers.tsx'
import { FitTo } from '../transit/parts.tsx'
import { useSearchIndex } from './useSearch.ts'

const RECENT_KEY = 'utm-recent-searches'

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

export const hitPath = (h: Pick<SearchHit, 'kind' | 'ref'>) => `/${h.kind}/${encodeURIComponent(h.ref)}`

export function SearchPage() {
  const setSheet = useAppStore((s) => s.setSheet)
  const navigate = useNavigate()
  const index = useSearchIndex()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [recent, setRecent] = useState(readRecent)
  useEffect(() => {
    setSheet('full')
    return () => setSheet('half')
  }, [setSheet])

  const hits = useMemo(() => (index ? search(index, query, category) : []), [index, query, category])
  const markers = useMemo(() => hits.map((h) => ({ id: h.id, kind: h.kind, position: { lat: h.lat, lon: h.lon }, label: h.name })), [hits])

  const remember = () => {
    const q = query.trim()
    if (!q) return
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, 6)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  return (
    <Page title="Search">
      <input
        className="field"
        type="search"
        placeholder="Building, faculty, block code, stop"
        aria-label="Search places"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips" role="group" aria-label="Filter by category">
        {Category.options.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {c}
          </button>
        ))}
      </div>
      <MarkerLayer
        markers={markers}
        onSelect={(m) => {
          remember()
          navigate(hitPath({ kind: m.kind, ref: m.id.slice(m.id.indexOf(':') + 1) }))
        }}
      />
      {query.trim() && hits.length > 0 && <FitTo points={markers.map((m) => m.position)} maxZoom={17} />}
      {!index && <Pending>Loading the place index...</Pending>}
      {index && query.trim() && (
        <ul className="list" aria-label="Results">
          {hits.map((h) => (
            <li key={h.id}>
              <Link to={hitPath(h)} onClick={remember}>
                {h.name}
                <span className="list-code">{h.code || h.category}</span>
              </Link>
            </li>
          ))}
          {hits.length === 0 && <li className="picker-none">Nothing matches "{query}".</li>}
        </ul>
      )}
      {index && !query.trim() && recent.length > 0 && (
        <section aria-label="Recent searches">
          <h2 className="kicker">Recent</h2>
          <ul className="list">
            {recent.map((r) => (
              <li key={r}>
                <button type="button" className="recent" onClick={() => setQuery(r)}>
                  {r}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
