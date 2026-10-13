import { useRegisterSW } from 'virtual:pwa-register/react'
import { usePresence } from './hooks.ts'
import { Icon } from './icons.tsx'

/** Shown when a new version has been downloaded and is waiting. Reload swaps it in; the cross puts it off. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const { mounted, leaving } = usePresence(needRefresh)
  if (!mounted) return null
  return (
    <div className="update-toast" role="status" data-leaving={leaving || undefined}>
      <span>Update available</span>
      <button type="button" className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setNeedRefresh(false)}>
        <Icon name="close" size={20} />
      </button>
    </div>
  )
}
