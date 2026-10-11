import { useEffect } from 'react'
import { useAppStore } from '../app/store.ts'
import { Page, Pending } from '../../ui/Page.tsx'

export function SearchPage() {
  const setSheet = useAppStore((s) => s.setSheet)
  useEffect(() => {
    setSheet('full')
    return () => setSheet('half')
  }, [setSheet])
  return (
    <Page title="Search">
      <input className="field" type="search" placeholder="Building, faculty, block code, stop" aria-label="Search places" autoFocus />
      <Pending>Offline place search arrives with ticket #26.</Pending>
    </Page>
  )
}
