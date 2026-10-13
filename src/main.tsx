import '@fontsource-variable/inter'
import '@fontsource-variable/lexend'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, type NavigateOptions, type To } from 'react-router'
import { routes } from './App.tsx'
import './ui/app.css'

// Every move to another page eases the new page in. <html data-nav> says which way it comes from; the first load has none.
// (Not View Transitions: while one runs, the browser sends every tap to <html>, so quick taps were lost.)
const TABS = ['/', '/routes', '/plan', '/contribute']
const html = document.documentElement

// Back and forward (buttons, swipes) are told apart by the router's own position in the history.
let at: number = history.state?.idx ?? 0
addEventListener('popstate', () => {
  const idx = history.state?.idx ?? 0
  html.dataset.nav = idx < at ? 'back' : 'fwd'
  at = idx
})

const router = createBrowserRouter(routes)
router.subscribe(() => (at = history.state?.idx ?? at))
const navigate = router.navigate
router.navigate = ((to: To | number | null, opts?: NavigateOptions) => {
  if (typeof to === 'number') return navigate(to)
  const path = (typeof to === 'string' ? to : to?.pathname)?.split(/[?#]/)[0]
  // Same page with new search parameters (planning a trip, picking a chip) stays still.
  if (path?.startsWith('/') && path !== location.pathname) html.dataset.nav = TABS.includes(path) ? 'tab' : 'fwd'
  return navigate(to, opts)
}) as typeof navigate

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
