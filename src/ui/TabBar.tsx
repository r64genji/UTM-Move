import { useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from './icons.tsx'

const TABS: { to: string; label: string; icon: IconName; own: RegExp }[] = [
  { to: '/', label: 'Explore', icon: 'map', own: /^\/$/ },
  { to: '/routes', label: 'Routes', icon: 'routes', own: /^\/routes/ },
  { to: '/plan', label: 'Navigate', icon: 'navigate', own: /^\/(plan|navigate)/ },
  { to: '/contribute', label: 'Contribute', icon: 'contribute', own: /^\/contribute/ },
]

// Stops, routes, search and the disclaimer are reached from more than one tab. They keep the tab you came from lit.
// Opened straight from a link there is no such tab, so each falls back to its usual one.
const SHARED: [RegExp, number][] = [[/^\/stop\//, 0], [/^\/route\//, 1], [/^\/search/, 2], [/^\/info/, 3]]

/** Index of the tab to highlight. Call once, where the app shell lives, so the last tab is remembered across pages. */
export function useActiveTab() {
  const { pathname } = useLocation()
  const own = TABS.findIndex((t) => t.own.test(pathname))
  const [last, setLast] = useState(() => (own >= 0 ? own : (SHARED.find(([re]) => re.test(pathname))?.[1] ?? 0)))
  if (own >= 0 && own !== last) setLast(own)
  return own >= 0 ? own : last
}

/** Phone tab bar. The pill under the active icon slides to the tab you pick. */
export function TabBar({ active }: { active: number }) {
  return (
    <nav className="tabbar" aria-label="Main" style={{ '--tab-i': active } as CSSProperties}>
      <span className="tab-pill" aria-hidden="true" />
      {TABS.map((t, i) => (
        <Link key={t.to} to={t.to} className="tab" aria-current={i === active ? 'page' : undefined}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
