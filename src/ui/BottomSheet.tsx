import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useMap } from '../features/map/MapContext.tsx'
import { DESKTOP, useMedia } from './hooks.ts'

type Size = 'min' | 'mid' | 'full'
type Drag = { y0: number; h0: number; y: number; t: number; v: number; lo: number; hi: number; to: number; rb: number; moved: boolean; handle: boolean }
const MIN_H = 96
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// The sheet that went away a moment ago. A loading sheet swapped for the loaded one is a new element on the same page:
// the new one grows from where the old one ended instead of sliding in again.
let left: { node: HTMLElement; path: string; at: number; h: number; size: Size } | null = null

/** How far the sheet is drawn below (or above) its resting place right now, counting a glide in progress. */
const offset = (node: HTMLElement) => new DOMMatrix(getComputedStyle(node).transform).m42

/** The layout is already final; this only moves the sheet from `from` px away to its place. Longer trips take a little longer. */
function glide(node: HTMLElement, from: number) {
  node.getAnimations().forEach((a) => a.cancel())
  if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  node.animate({ transform: [`translateY(${from}px)`, 'translateY(0)'] }, { duration: Math.min(440, parseFloat(token('--dur')) + Math.abs(from) * 0.4), easing: token('--ease-out') })
}

/** Heights the sheet can rest at. A size that would look the same as the one below it (short content) is left out. */
function stops(node: HTMLElement, min: number) {
  const body = node.lastElementChild as HTMLElement
  const panel = node.closest('.panel')?.clientHeight ?? 600
  const content = node.offsetHeight - body.clientHeight + body.scrollHeight
  const all: [Size, number][] = [['min', min], ['mid', Math.min(content, panel * 0.45)], ['full', Math.min(content, panel * 0.88)]]
  const out: [Size, number][] = []
  for (const s of all) if (!out.length || s[1] - out[out.length - 1][1] > 24) out.push(s)
  return out
}

/** Past its ends the sheet keeps following the finger, but at half speed and tiring out. */
const rubber = (over: number) => 48 * (1 - Math.exp(-over / 96))

/**
 * Bottom sheet on phones, plain block in the sidebar on desktop. Three sizes: nearly hidden, half, nearly full screen.
 * The sheet follows your finger while you drag its handle or header, then settles on the closest size, helped along by your speed.
 * A tap on the handle steps through the sizes that look different. Slides up when it appears and glides when its height changes.
 * Keeps the map's centre in the part of the screen the sheet does not cover.
 */
export function BottomSheet({ children, label }: { children: ReactNode; label: string }) {
  const desktop = useMedia(DESKTOP)
  const map = useMap()
  const { pathname } = useLocation()
  const path = useRef(pathname)
  const el = useRef<HTMLElement>(null)
  const [size, setSize] = useState<Size>(() => (left && left.path === pathname && Date.now() - left.at < 400 ? left.size : 'mid'))
  const drag = useRef<Drag | null>(null)
  const last = useRef(0)
  const minH = useRef(MIN_H)

  useEffect(() => {
    path.current = pathname
  })

  // Appears: slides up from below (or grows from the sheet it replaces). After that, any change in height glides.
  useLayoutEffect(() => {
    const node = el.current
    if (!node || desktop || !node.animate) return
    // The same element again (this effect re-ran, as in StrictMode) keeps the glide it already has.
    const again = left?.node === node
    const prev = left && !again && left.path === path.current && Date.now() - left.at < 400 ? left : null
    left = null
    last.current = node.offsetHeight
    if (!again) glide(node, prev ? node.offsetHeight - prev.h : node.offsetHeight + 16)
    const watch = new ResizeObserver(() => {
      const h = node.offsetHeight
      const d = h - last.current
      last.current = h
      // A drag sets the height itself. A size step or content arriving glides.
      if (Math.abs(d) > 1 && !drag.current?.moved) glide(node, offset(node) + d)
    })
    watch.observe(node)
    return () => {
      watch.disconnect()
      left = { node, path: path.current, at: Date.now(), h: last.current, size: node.dataset.size as Size }
    }
  }, [desktop])

  // Nearly hidden: stop right under the first line, so the next row never peeks out. A bar of buttons (Start) keeps the fixed height.
  useLayoutEffect(() => {
    const node = el.current
    if (!node || size !== 'min') return
    const body = node.lastElementChild as HTMLElement
    body.scrollTop = 0
    const first = [...body.children].find((c) => (c as HTMLElement).offsetHeight > 0 && !c.classList.contains('sheet-actions'))
    const fits = first && !body.querySelector(':scope > .sheet-actions')
    minH.current = fits ? Math.min(140, Math.max(72, Math.ceil(first.getBoundingClientRect().bottom - node.getBoundingClientRect().top + 8))) : MIN_H
    node.style.setProperty('--min-h', `${minH.current}px`)
  })

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

  const step = (dir: 'up' | 'down' | 'cycle') => {
    const node = el.current
    if (!node) return
    const list = stops(node, minH.current)
    if (list.length < 2) return
    const up = list.find((s) => s[1] > last.current + 12)
    const down = list.findLast((s) => s[1] < last.current - 12)
    const next = dir === 'up' ? up : dir === 'down' ? down : (up ?? list[0])
    if (next) setSize(next[0])
  }

  const start = (e: PointerEvent<HTMLElement>) => {
    const node = el.current
    const target = e.target as Element
    const handle = !!target.closest('.sheet-handle')
    // The handle, or the quiet part of the header. Buttons and the scrolling body keep their own taps and swipes.
    const header = !!target.closest('.sheet-head, .sheet-title') && !target.closest('button, a, input, select, textarea')
    if (!node || desktop || e.button > 0 || !(handle || header)) return
    drag.current = { y0: e.clientY, h0: node.offsetHeight - offset(node), y: e.clientY, t: performance.now(), v: 0, lo: 0, hi: 0, to: 0, rb: 0, moved: false, handle }
  }

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    const node = el.current
    if (!d || !node) return
    if (!d.moved) {
      if (Math.abs(e.clientY - d.y0) <= 6) return
      const list = stops(node, minH.current)
      d.moved = true
      d.lo = list[0][1]
      d.hi = list[list.length - 1][1]
      node.setPointerCapture(e.pointerId)
      node.setAttribute('data-drag', '')
      node.getAnimations().forEach((a) => a.cancel())
    }
    const now = performance.now()
    d.v = (e.clientY - d.y) / Math.max(1, now - d.t)
    d.y = e.clientY
    d.t = now
    d.to = d.h0 - (e.clientY - d.y0)
    const h = Math.min(d.hi, Math.max(d.lo, d.to))
    d.rb = Math.sign(d.to - h) * rubber(Math.abs(d.to - h))
    node.style.maxHeight = `${h}px`
    node.style.transform = d.rb ? `translateY(${-d.rb}px)` : ''
  }

  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    const node = el.current
    drag.current = null
    if (!d || !node) return
    if (!d.moved) return d.handle && e.type === 'pointerup' ? step('cycle') : undefined
    // Where the sheet would stop if it kept its speed for a moment, then the closest size.
    const [next, h] = stops(node, minH.current).reduce((best, s) => (Math.abs(s[1] - (d.to - d.v * 120)) < Math.abs(best[1] - (d.to - d.v * 120)) ? s : best))
    const from = node.offsetHeight
    node.style.maxHeight = ''
    node.style.transform = ''
    node.removeAttribute('data-drag')
    glide(node, h - from - d.rb)
    last.current = h
    setSize(next)
  }

  return (
    // The handle is the keyboard way in; pointer drags start on the handle or the header and are handled here.
    <section ref={el} className="sheet" data-size={size} aria-label={label} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {!desktop && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={size === 'full' ? 'Hide panel' : size === 'min' ? 'Show panel' : 'Expand panel'}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') step('up')
            if (e.key === 'ArrowDown') step('down')
          }}
        >
          <span />
        </button>
      )}
      <div className="sheet-body">{children}</div>
    </section>
  )
}
