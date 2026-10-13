import '@fontsource-variable/inter'
import '@fontsource-variable/lexend'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, type NavigateOptions, type To } from 'react-router'
import { routes } from './App.tsx'
import './ui/app.css'

// Every move to another page cross-fades the panel (View Transitions; browsers without them just cut).
// <html data-nav> says which way the new page slides in. <html data-vt> lets the panel be captured, only while it is needed.
const TABS = ['/', '/routes', '/plan', '/contribute']
const html = document.documentElement
let timer: ReturnType<typeof setTimeout>
const mark = (nav: 'fwd' | 'back' | 'tab') => {
  html.dataset.nav = nav
  html.dataset.vt = ''
  clearTimeout(timer)
  timer = setTimeout(() => delete html.dataset.vt, 600)
}

// Back and forward (buttons, swipes) are told apart by the router's own position in the history.
let at: number = history.state?.idx ?? 0
addEventListener('popstate', () => {
  const idx = history.state?.idx ?? 0
  mark(idx < at ? 'back' : 'fwd')
  at = idx
})

// A tap during a transition skips it, which rejects its `ready` promise. Nobody awaits that one, so it would surface as an error.
const startTransition = document.startViewTransition?.bind(document)
if (startTransition)
  document.startViewTransition = (cb) => {
    const t = startTransition(cb)
    t.ready.catch(() => {})
    return t
  }

const router = createBrowserRouter(routes)
router.subscribe(() => (at = history.state?.idx ?? at))
const navigate = router.navigate
router.navigate = ((to: To | number | null, opts?: NavigateOptions) => {
  if (typeof to === 'number') return navigate(to)
  const path = (typeof to === 'string' ? to : to?.pathname)?.split(/[?#]/)[0]
  // Same page with new search parameters (planning a trip, picking a chip) stays still.
  if (path?.startsWith('/') && path !== location.pathname) {
    mark(TABS.includes(path) ? 'tab' : 'fwd')
    opts = { ...opts, viewTransition: opts?.viewTransition ?? true }
  }
  return navigate(to, opts)
}) as typeof navigate

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
