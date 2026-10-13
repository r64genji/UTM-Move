// Small motion helpers shared by the pages: a sliding thumb for segmented controls, and a short exit for overlays.
import { useEffect, useLayoutEffect, useState } from 'react'

/**
 * Slides a thumb (the `.has-thumb::before` in app.css) behind whichever child is selected.
 * Pass the returned callback as `ref` and add the class `has-thumb`. The thumb never slides in from the left on first paint.
 */
export function useThumb<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const place = () => {
    const on = el?.querySelector<HTMLElement>('[aria-selected="true"], [aria-checked="true"]')
    if (!el || !on) return
    el.style.setProperty('--tx', `${on.offsetLeft}px`)
    el.style.setProperty('--tw', `${on.offsetWidth}px`)
  }
  // Every render: the selection may have changed.
  useLayoutEffect(place)
  useEffect(() => {
    if (!el) return
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    watch?.observe(el)
    for (const child of el.children) watch?.observe(child)
    // Slide only after the first placement has been painted.
    const frame = requestAnimationFrame(() => (el.dataset.ready = ''))
    return () => {
      cancelAnimationFrame(frame)
      watch?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el])
  return setEl
}

/** Keeps something on screen for `ms` after `open` turns false so it can play its exit. `leaving` is true during that time. */
export function useExit(open: boolean, ms = 120) {
  const [was, setWas] = useState(open)
  const [exiting, setExiting] = useState(false)
  if (open !== was) {
    setWas(open)
    setExiting(!open)
  }
  useEffect(() => {
    if (!exiting) return
    const timer = setTimeout(() => setExiting(false), ms)
    return () => clearTimeout(timer)
  }, [exiting, ms])
  return { present: open || exiting, leaving: !open }
}
