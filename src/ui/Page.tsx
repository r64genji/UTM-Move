import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Icon } from './icons.tsx'

/** Back one step, or home when the page was opened from a shared link (no history). */
export function useBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key === 'default' ? navigate('/') : navigate(-1))
}

export function BackButton() {
  const back = useBack()
  return (
    <button type="button" className="icon-btn" onClick={back} aria-label="Back">
      <Icon name="back" />
    </button>
  )
}

/** A full-height page: top bar with a centred title (the one h1), then the content. On desktop it fills the sidebar. */
export function Page({ title, back = true, action, children }: { title: string; back?: boolean; action?: ReactNode; children?: ReactNode }) {
  return (
    <article className="page-full">
      <header className="bar">
        {back ? <BackButton /> : <span className="bar-gap" />}
        <h1>{title}</h1>
        {action ?? <span className="bar-gap" />}
      </header>
      <div className="page-body">{children}</div>
    </article>
  )
}

/** A quiet note while something loads or is missing. */
export function Pending({ children }: { children: ReactNode }) {
  return <p className="pending">{children}</p>
}
