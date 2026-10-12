import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMap } from '../features/map/MapContext.tsx'
import { DESKTOP, useMedia } from './hooks.ts'

/**
 * Bottom sheet on phones (tap or swipe the handle to open it further), plain block in the sidebar on desktop.
 * Keeps the map's centre in the part of the screen the sheet does not cover.
 */
export function BottomSheet({ children, label }: { children: ReactNode; label: string }) {
  const desktop = useMedia(DESKTOP)
  const map = useMap()
  const el = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const swipe = useRef<number | null>(null)

  useEffect(() => {
    if (!map || !el.current) return
    const node = el.current
    const pad = () => map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: desktop ? 0 : node.offsetHeight }, duration: 250 })
    pad()
    const watch = new ResizeObserver(pad)
    watch.observe(node)
    return () => {
      watch.disconnect()
      map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 0 })
    }
  }, [map, desktop])

  return (
    <section ref={el} className="sheet" data-open={open || undefined} aria-label={label}>
      {!desktop && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
          onPointerDown={(e) => {
            swipe.current = e.clientY
          }}
          onPointerUp={(e) => {
            const dy = swipe.current === null ? 0 : e.clientY - swipe.current
            swipe.current = null
            setOpen(Math.abs(dy) < 8 ? !open : dy < 0)
          }}
        >
          <span />
        </button>
      )}
      <div className="sheet-body">{children}</div>
    </section>
  )
}
