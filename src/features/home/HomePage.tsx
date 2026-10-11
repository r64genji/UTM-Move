import { Link } from 'react-router'
import { LocationControl } from '../location/LocationControl.tsx'

export function HomePage() {
  return (
    <article className="page home">
      <p className="wordmark">
        <span>UTM</span> Move
      </p>
      <h1 className="home-title">Where to?</h1>
      <Link to="/search" className="search-field">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Search buildings, faculties, stops
      </Link>
      <LocationControl />
      <nav className="quick" aria-label="Shortcuts">
        <Link to="/plan?from=me" className="quick-item">
          <strong>Plan a trip</strong>
          <span>Walk and campus bus</span>
        </Link>
        <Link to="/stop/CP" className="quick-item">
          <strong>Bus departures</strong>
          <span>Centre Point</span>
        </Link>
      </nav>
    </article>
  )
}
