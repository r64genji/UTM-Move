import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useMap } from '../features/map/MapContext.tsx'
import { DESKTOP, useMedia } from './hooks.ts'

type Size = 'min' | 'mid' | 'full'
const UP: Record<Size, Size> = { min: 'mid', mid: 'full', full: 'full' }
const DOWN: Record<Size, Size> = { min: 'min', mid: 'min', full: 'mid' }
const MIN_H = 96
const TAP: Record<Size, Size> = { min: 'mid', mid: 'full', full: 'min' }

/**
 * Bottom sheet on phones, plain block in the sidebar on desktop. Three sizes: nearly hidden, half, nearly full screen.
 * The sheet follows your finger while you drag the handle, then snaps to the closest size. A tap steps through hidden, half and full.
 * Keeps the map's centre in the part of the screen the sheet does not cover.
 */
export function BottomSheet({ children, label }: { children: ReactNode; label: string }) {
  const desktop = useMedia(DESKTOP)
  const map = useMap()
  const el = useRef<HTMLElement>(null)
  const [size, setSize] = useState<Size>('mid')
  const drag = useRef<{ y0: number; h0: number; y: number; t: number; v: number; moved: boolean } | null>(null)

  useEffect(() => {
    if (!map || !el.current) return
    const node = el.current
    const root = document.documentElement.style
    let timer: ReturnType<typeof setTimeout>
    const pad = () => {
      const bottom = desktop ? 0 : node.offsetHeight
      // The map buttons sit just above the sheet. They follow every frame; the map itself eases once the sheet settles.
      root.setProperty('--sheet-h', `${bottom}px`)
      clearTimeout(timer)
      timer = setTimeout(() => map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 250 }), drag.current ? 0 : 300)
    }
    pad()
    const watch = new ResizeObserver(() => !drag.current?.moved && pad())
    watch.observe(node)
    return () => {
      clearTimeout(timer)
      watch.disconnect()
      root.removeProperty('--sheet-h')
      map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 0 })
    }
  }, [map, desktop])

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    const node = el.current
    if (!d || !node) return
    const now = performance.now()
    if (Math.abs(e.clientY - d.y0) > 6) d.moved = true
    if (!d.moved) return
    d.v = (e.clientY - d.y) / Math.max(1, now - d.t)
    d.y = e.clientY
    d.t = now
    const max = (node.closest('.panel')?.clientHeight ?? 600) * 0.88
    node.style.transition = 'none'
    node.style.maxHeight = `${Math.min(max, Math.max(MIN_H, d.h0 - (e.clientY - d.y0)))}px`
  }

  const end = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    const node = el.current
    drag.current = null
    if (!d || !node) return
    if (!d.moved) return setSize(TAP[size])
    // Where the sheet would stop if it kept its speed for a moment, then the closest size.
    const parent = node.closest('.panel')?.clientHeight ?? 600
    const now = node.offsetHeight - d.v * 120
    const stops: [Size, number][] = [['min', MIN_H], ['mid', parent * 0.45], ['full', parent * 0.88]]
    const next = stops.reduce((best, s) => (Math.abs(s[1] - now) < Math.abs(best[1] - now) ? s : best))[0]
    node.style.transition = ''
    node.style.maxHeight = ''
    setSize(next)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  return (
    <section ref={el} className="sheet" data-size={size} aria-label={label}>
      {!desktop && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={size === 'full' ? 'Hide panel' : size === 'min' ? 'Show panel' : 'Expand panel'}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { y0: e.clientY, h0: el.current?.offsetHeight ?? 0, y: e.clientY, t: performance.now(), v: 0, moved: false }
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') setSize(UP[size])
            if (e.key === 'ArrowDown') setSize(DOWN[size])
          }}
        >
          <span />
        </button>
      )}
      <div className="sheet-body">{children}</div>
    </section>
  )
}
