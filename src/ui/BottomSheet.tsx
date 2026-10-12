import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMap } from '../features/map/MapContext.tsx'
import { DESKTOP, useMedia } from './hooks.ts'

type Size = 'min' | 'mid' | 'full'
const UP: Record<Size, Size> = { min: 'mid', mid: 'full', full: 'full' }
const DOWN: Record<Size, Size> = { min: 'min', mid: 'min', full: 'mid' }

/**
 * Bottom sheet on phones, plain block in the sidebar on desktop. Three sizes: nearly hidden, half, nearly full screen.
 * Swipe the handle up or down to change size; a tap opens a hidden sheet and hides an open one.
 * Keeps the map's centre in the part of the screen the sheet does not cover.
 */
export function BottomSheet({ children, label }: { children: ReactNode; label: string }) {
  const desktop = useMedia(DESKTOP)
  const map = useMap()
  const el = useRef<HTMLElement>(null)
  const [size, setSize] = useState<Size>('mid')
  const swipe = useRef<number | null>(null)

  useEffect(() => {
    if (!map || !el.current) return
    const node = el.current
    const root = document.documentElement.style
    const pad = () => {
      const bottom = desktop ? 0 : node.offsetHeight
      // The map buttons sit just above the sheet.
      root.setProperty('--sheet-h', `${bottom}px`)
      map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 250 })
    }
    pad()
    const watch = new ResizeObserver(pad)
    watch.observe(node)
    return () => {
      watch.disconnect()
      root.removeProperty('--sheet-h')
      map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 0 })
    }
  }, [map, desktop])

  return (
    <section ref={el} className="sheet" data-size={size} aria-label={label}>
      {!desktop && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={size === 'min' ? 'Show panel' : 'Hide panel'}
          onPointerDown={(e) => {
            swipe.current = e.clientY
          }}
          onPointerUp={(e) => {
            const dy = swipe.current === null ? 0 : e.clientY - swipe.current
            swipe.current = null
            setSize(Math.abs(dy) < 8 ? (size === 'min' ? 'mid' : 'min') : dy < 0 ? UP[size] : DOWN[size])
          }}
        >
          <span />
        </button>
      )}
      <div className="sheet-body">{children}</div>
    </section>
  )
}
