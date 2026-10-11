// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { createNavigation, follow, startState, view } from '../../domain/navigate/follow.ts'
import type { Leg, TripOption } from '../../domain/router/planTrip.ts'
import { Guidance } from './NavigatePage.tsx'

afterEach(cleanup)

const at = (hhmm: string) => new Date(`2026-03-17T${hhmm}:00+08:00`)
const A = { lat: 1.56, lon: 103.64 }
const B = { lat: 1.56, lon: 103.6445 } // 500 m east of A
const C = { lat: 1.56, lon: 103.66 }
const walk: Leg = {
  kind: 'walk', from: { name: 'Home', location: A }, to: { name: 'Stop A', location: B }, departAt: at('08:00'), arriveAt: at('08:06'),
  durationS: 360, geometry: [A, B], labels: [],
  steps: [{ turn: 'depart', instruction: 'Head east', location: A, distanceM: 500 }, { turn: 'arrive', instruction: 'Arrive at Stop A', location: B, distanceM: 0 }],
}
const bus: Leg = {
  kind: 'bus', from: { name: 'Stop A', location: B }, to: { name: 'Stop B', location: C }, departAt: at('08:10'), arriveAt: at('08:20'),
  durationS: 600, geometry: [B, C], labels: [], route: { id: 'C', name: 'Route C' }, headsign: 'Library',
}
const option: TripOption = { kind: 'bus', departAt: at('08:00'), arriveAt: at('08:20'), durationS: 1200, walkS: 360, transfers: 0, legs: [walk, bus] }

test('guidance warns that the bus leaves before you can walk there', () => {
  const nav = createNavigation(option)
  const { state } = follow(nav, startState, { ...A, accuracy: 5, t: 0 })
  render(<Guidance v={view(nav, state, at('08:06'))} />)
  expect(screen.getByText('Bus leaves in 4 min. You need 6 min to walk.')).toBeTruthy()
  expect(screen.getByText('Head east')).toBeTruthy()
  expect(screen.getByText('Then: Board route C to Library')).toBeTruthy()
})

test('guidance shows the stop to get off at while riding', () => {
  const nav = createNavigation(option)
  const { state } = follow(nav, { ...startState, alongM: 1000, next: 1 }, { lat: 1.56, lon: 103.652, accuracy: 5, t: 0 })
  render(<Guidance v={view(nav, state, at('08:15'))} />)
  expect(screen.getByText('Get off at Stop B')).toBeTruthy()
  expect(screen.getByText(/^In \d/)).toBeTruthy()
  expect(screen.queryByText(/Bus leaves/)).toBeNull()
})
