// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { WhenPicker } from './WhenPicker.tsx'

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-13T15:00:00+08:00'), toFake: ['Date'] })
  Element.prototype.scrollTo ??= function () {}
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Reported: changing the time did not change the routes. A quick Done after picking kept the old time.
test('pick 09 and 10 on the wheels, tap Done at once: the trip time is 09:10', () => {
  const onChange = vi.fn()
  render(<WhenPicker value="2026-10-13T16:05" label="Depart at" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: /Change time/ }))
  fireEvent.click(within(screen.getByRole('listbox', { name: 'Hour' })).getByText('09'))
  fireEvent.click(within(screen.getByRole('listbox', { name: 'Minute' })).getByText('10'))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(onChange).toHaveBeenLastCalledWith('2026-10-13T09:10')
})
