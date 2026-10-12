import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from './icons.tsx'

const TABS: { to: string; label: string; icon: IconName; match: RegExp }[] = [
  { to: '/', label: 'Home', icon: 'home', match: /^\/$|^\/stop\// },
  { to: '/routes', label: 'Routes', icon: 'routes', match: /^\/route|^\/info/ },
  { to: '/plan', label: 'Navigate', icon: 'navigate', match: /^\/(plan|navigate|search)/ },
  { to: '/contribute', label: 'Contribute', icon: 'contribute', match: /^\/contribute/ },
]

/** Phone tab bar. */
export function TabBar() {
  const { pathname } = useLocation()
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <Link key={t.to} to={t.to} className="tab" aria-current={t.match.test(pathname) ? 'page' : undefined}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
