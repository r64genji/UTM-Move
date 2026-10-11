import { useSyncExternalStore } from 'react'

const onResize = (cb: () => void) => {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}

export const useViewportHeight = () => useSyncExternalStore(onResize, () => window.innerHeight, () => 800)

/** Desktop = side panel. Phone and small tablets = bottom sheet. */
export const DESKTOP = '(min-width: 900px)'
export const useMedia = (query: string) =>
  useSyncExternalStore(
    onResize,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
