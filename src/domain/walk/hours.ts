import type { OpeningHours, Weekday } from '../schemas.ts'

const DAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const KL_OFFSET_MS = 8 * 3600_000 // Asia/Kuala_Lumpur is UTC+8 all year, no DST.
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

/** Day and minute of day in Asia/Kuala_Lumpur, whatever the device time zone is. */
export function klClock(at: Date): { day: Weekday; minute: number } {
  const kl = new Date(at.getTime() + KL_OFFSET_MS)
  return { day: DAYS[kl.getUTCDay()], minute: kl.getUTCHours() * 60 + kl.getUTCMinutes() }
}

/** Closing time ('HH:MM') of the opening that covers `at`, or null if closed. Handles close past midnight. */
export function openUntil(hours: OpeningHours, at: Date): string | null {
  const { day, minute } = klClock(at)
  const yesterday = DAYS[(DAYS.indexOf(day) + 6) % 7]
  for (const h of hours) {
    const open = minutes(h.open)
    const close = minutes(h.close)
    if (open < close) {
      if (h.days.includes(day) && minute >= open && minute < close) return h.close
    } else {
      // Overnight, like 18:00-02:00.
      if (h.days.includes(day) && minute >= open) return h.close
      if (h.days.includes(yesterday) && minute < close) return h.close
    }
  }
  return null
}
