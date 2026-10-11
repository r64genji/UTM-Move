import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shown when a new version has been downloaded and is waiting. Reload swaps it in. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div className="update-toast" role="status">
      <span>Update available</span>
      <button type="button" className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  )
}
