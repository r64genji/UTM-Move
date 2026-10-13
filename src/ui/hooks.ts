import { useEffect, useSyncExternalStore } from 'react'

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

/** Rows of chips scroll by finger already. This lets a mouse drag them too. Call once, near the app root. */
export function useDragScroll(selector = '.chips, .when-days') {
  useEffect(() => {
    let drag: { el: HTMLElement; x: number; left: number; id: number; moved: boolean } | null = null
    const down = (e: PointerEvent) => {
      const el = e.pointerType === 'mouse' && e.button === 0 ? (e.target as Element).closest<HTMLElement>(selector) : null
      if (el && el.scrollWidth > el.clientWidth) drag = { el, x: e.clientX, left: el.scrollLeft, id: e.pointerId, moved: false }
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      if (!drag.moved && Math.abs(e.clientX - drag.x) > 4) {
        drag.moved = true
        drag.el.setPointerCapture(drag.id)
      }
      if (drag.moved) drag.el.scrollLeft = drag.left - (e.clientX - drag.x)
    }
    const up = () => {
      // A drag must not also press the chip under the pointer.
      if (drag?.moved) window.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true })
      drag = null
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
    }
  }, [selector])
}
