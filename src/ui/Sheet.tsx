import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAppStore, type SheetSnap } from '../features/app/store.ts'
import { useMap } from '../features/map/MapContext.tsx'
import { DESKTOP, useMedia, useViewportHeight } from './hooks.ts'

const ORDER: SheetSnap[] = ['peek', 'half', 'full']
const PANEL_WIDTH = 400 + 16 * 2

/** Bottom sheet on phones (drag the handle between peek / half / full), side panel on desktop. */
export function Sheet({ children }: { children: ReactNode }) {
  const snap = useAppStore((s) => s.sheet)
  const setSnap = useAppStore((s) => s.setSheet)
  const desktop = useMedia(DESKTOP)
  const vh = useViewportHeight()
  const map = useMap()
  const full = vh - 56
  const heights: Record<SheetSnap, number> = { peek: 148, half: Math.round(vh * 0.48), full }
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; h: number } | null>(null)
  const visible = drag ?? heights[snap]

  // Keep the map's visual centre in the part of the screen the panel does not cover.
  useEffect(() => {
    if (!map) return
    const padding = desktop ? { left: PANEL_WIDTH, bottom: 0, top: 0, right: 0 } : { left: 0, bottom: Math.min(heights[snap], vh * 0.6), top: 0, right: 0 }
    map.easeTo({ padding, duration: 300 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, desktop, snap, vh])

  const style = { '--sheet-visible': `${visible}px`, '--sheet-hidden': `${full - visible}px`, height: full } as CSSProperties

  return (
    <aside className="sheet" style={desktop ? undefined : style} data-dragging={drag !== null || undefined} aria-label="Panel">
      {!desktop && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={snap === 'full' ? 'Collapse panel' : 'Expand panel'}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            start.current = { y: e.clientY, h: visible }
          }}
          onPointerMove={(e) => {
            if (!start.current) return
            setDrag(Math.max(96, Math.min(full, start.current.h + start.current.y - e.clientY)))
          }}
          onPointerUp={(e) => {
            const s = start.current
            start.current = null
            setDrag(null)
            if (!s) return
            const h = s.h + s.y - e.clientY
            if (Math.abs(h - s.h) < 6) {
              setSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length])
              return
            }
            setSnap(ORDER.reduce((best, k) => (Math.abs(heights[k] - h) < Math.abs(heights[best] - h) ? k : best)))
          }}
          onPointerCancel={() => {
            start.current = null
            setDrag(null)
          }}
        >
          <span />
        </button>
      )}
      <div className="sheet-body">{children}</div>
    </aside>
  )
}
