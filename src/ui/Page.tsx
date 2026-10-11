import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

/** Standard page frame inside the panel: back button, one h1, content. */
export function Page({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  // location.key is 'default' on a fresh load (shared link): there is no history to go back to.
  const back = () => (location.key === 'default' ? navigate('/') : navigate(-1))
  return (
    <article className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          {kicker && <p className="kicker">{kicker}</p>}
          <h1>{title}</h1>
        </div>
      </header>
      {children}
    </article>
  )
}

/** A quiet note for a section another ticket will fill. */
export function Pending({ children }: { children: ReactNode }) {
  return <p className="pending">{children}</p>
}
