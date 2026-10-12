import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Category } from '../../domain/schemas.ts'
import { search, type SearchHit } from '../../domain/search.ts'
import { Icon } from '../../ui/icons.tsx'
import { Page, Pending } from '../../ui/Page.tsx'
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

/** Where a result leads: a place gets directions from here, a stop shows its departures. */
export const hitPath = (h: Pick<SearchHit, 'kind' | 'ref'>) => (h.kind === 'stop' ? `/stop/${encodeURIComponent(h.ref)}` : `/plan?from=me&to=place:${encodeURIComponent(h.ref)}`)

export function SearchPage() {
  const index = useSearchIndex()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [recent, setRecent] = useState(readRecent)

  const hits = useMemo(() => (index ? search(index, query, category) : []), [index, query, category])

  const remember = () => {
    const q = query.trim()
    if (!q) return
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, 6)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  return (
    <Page title="Select Destination">
      <div className="search-box">
        <Icon name="search" size={22} />
        <input
          type="search"
          placeholder="Building, faculty, block code, stop"
          aria-label="Search places"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
            <Icon name="close" size={22} />
          </button>
        )}
      </div>
      <div className="chips chips-flat" role="group" aria-label="Filter by category">
        {Category.options.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {c}
          </button>
        ))}
      </div>
      {!index && <Pending>Loading the place index...</Pending>}
      {index && query.trim() && (
        <section aria-label="Results">
          <h2 className="eyebrow-lg">Search results ({hits.length})</h2>
          <ul className="rows">
            {hits.map((h) => (
              <li key={h.id}>
                <Link to={hitPath(h)} onClick={remember}>
                  <span className="row-icon" data-kind={h.kind}>
                    <Icon name={h.kind === 'stop' ? 'bus' : 'building'} size={22} />
                  </span>
                  <span className="row-text">
                    <strong>{h.name}</strong>
                    <span className="muted">{h.code || h.category}</span>
                  </span>
                </Link>
              </li>
            ))}
            {hits.length === 0 && <li className="pending">Nothing matches "{query}".</li>}
          </ul>
        </section>
      )}
      {index && !query.trim() && recent.length > 0 && (
        <section aria-label="Recent searches">
          <h2 className="eyebrow-lg">Recent</h2>
          <ul className="rows">
            {recent.map((r) => (
              <li key={r}>
                <button type="button" onClick={() => setQuery(r)}>
                  <span className="row-icon" data-kind="recent">
                    <Icon name="search" size={22} />
                  </span>
                  <span className="row-text">
                    <strong>{r}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
