import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { klDateTime } from '../../domain/transit/departures.ts'
import { Icon } from '../../ui/icons.tsx'
import { useExit } from '../transit/motion.ts'

const DAYS = 7

const utc = (value: string) => {
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh, mm)
}
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16)

const ITEM = 44

/** A scroll wheel of numbers 0..count-1 that snaps to one. Reports the number in the middle once the scroll settles. */
function Wheel({ count, value, label, onChange }: { count: number; value: number; label: string; onChange: (n: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const grab = useRef<{ y: number; top: number; moved: boolean } | null>(null)
  useEffect(() => {
    el.current!.scrollTop = value * ITEM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** A tap or a released drag knows its number now: report it before the glide ends, so a quick Done gets it. */
  const pick = (n: number) => {
    n = Math.min(count - 1, Math.max(0, n))
    onChange(n)
    el.current!.scrollTo({ top: n * ITEM, behavior: 'smooth' })
  }
  return (
    <div
      ref={el}
      className="wheel"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      // A finger scrolls the wheel by itself. A mouse needs to be told to.
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') return
        grab.current = { y: e.clientY, top: e.currentTarget.scrollTop, moved: false }
      }}
      onPointerMove={(e) => {
        const g = grab.current
        if (!g) return
        if (!g.moved && Math.abs(e.clientY - g.y) > 4) {
          // Only a real drag takes over, so a plain click still reaches the number under it.
          g.moved = true
          e.currentTarget.setPointerCapture(e.pointerId)
          e.currentTarget.style.scrollSnapType = 'none'
        }
        if (g.moved) e.currentTarget.scrollTop = g.top - (e.clientY - g.y)
      }}
      onPointerUp={(e) => {
        const moved = grab.current?.moved
        grab.current = null
        if (!moved) return
        e.currentTarget.style.scrollSnapType = ''
        pick(Math.round(e.currentTarget.scrollTop / ITEM))
      }}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop
        clearTimeout(settle.current)
        settle.current = setTimeout(() => onChange(Math.min(count - 1, Math.max(0, Math.round(top / ITEM)))), 80)
      }}
    >
      {Array.from({ length: count }, (_, n) => (
        <div key={n} role="option" aria-selected={n === value} className="wheel-item" onClick={() => pick(n)}>
          {String(n).padStart(2, '0')}
        </div>
      ))}
    </div>
  )
}

/** The time popup: two wheels, hours and minutes. */
function TimePopup({ time, leaving, onDone, onClose }: { time: string; leaving: boolean; onDone: (time: string) => void; onClose: () => void }) {
  const [h, setH] = useState(Number(time.slice(0, 2)))
  const [m, setM] = useState(Number(time.slice(3)))
  return createPortal(
    <div className="popup-backdrop" data-leaving={leaving || undefined} onClick={onClose}>
      <div className="popup" role="dialog" aria-label="Pick a time" onClick={(e) => e.stopPropagation()}>
        <div className="popup-wheels">
          <div className="wheel-band" aria-hidden />
          <Wheel count={24} value={h} label="Hour" onChange={setH} />
          <span className="wheel-colon" aria-hidden>
            :
          </span>
          <Wheel count={60} value={m} label="Minute" onChange={setM} />
        </div>
        <div className="popup-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Day pills and a time button that opens a wheel popup, so nothing opens the phone's own date popup. `value` is `YYYY-MM-DDTHH:MM`, Malaysia time. */
export function WhenPicker({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [date, time] = value.split('T')
  const today = klDateTime(new Date()).date
  const days = Array.from({ length: DAYS }, (_, i) => fmt(utc(`${today}T00:00`) + i * 86_400_000).slice(0, 10))
  if (!days.includes(date)) days.unshift(date)
  const dayLabel = (d: string) => {
    if (d === today) return 'Today'
    if (d === days[days.indexOf(today) + 1]) return 'Tomorrow'
    return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  }
  const [open, setOpen] = useState(false)
  const popup = useExit(open)

  return (
    <div className="when-picker" role="group" aria-label={label}>
      <div className="when-days">
        {days.map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={d === date} onClick={() => onChange(`${d}T${time}`)}>
            {dayLabel(d)}
          </button>
        ))}
      </div>
      <button type="button" className="when-time" aria-label={`${label}: ${time}. Change time`} onClick={() => setOpen(true)}>
        <Icon name="clock" size={20} />
        {time}
      </button>
      {popup.present && <TimePopup time={time} leaving={popup.leaving} onClose={() => setOpen(false)} onDone={(t) => (setOpen(false), onChange(`${date}T${t}`))} />}
    </div>
  )
}
