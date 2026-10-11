// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, expect, test } from 'vitest'
import type { Leg, Plan } from '../../domain/router/planTrip.ts'
import { PlanPage } from './PlanPage.tsx'
import { OptionDetail, OptionList, optionToRoute } from './TripOptions.tsx'

afterEach(cleanup)

const at = (hhmm: string) => new Date(`2026-03-17T${hhmm}:00+08:00`)
const spot = (name: string) => ({ name, location: { lat: 1.56, lon: 103.64 } })
const line = [
  { lat: 1.56, lon: 103.64 },
  { lat: 1.561, lon: 103.641 },
  { lat: 1.562, lon: 103.642 },
  { lat: 1.563, lon: 103.643 },
]

const walk: Leg = {
  kind: 'walk', from: spot('Start'), to: spot('Stop A'), departAt: at('08:00'), arriveAt: at('08:05'), durationS: 300, geometry: line,
  labels: [{ text: 'Through Library, open until 22:00', from: 1, to: 2 }, { text: 'Covered walkway', from: 2, to: 3 }],
  steps: [{ turn: 'depart', instruction: 'Head north', location: line[0], distanceM: 120 }],
}
const bus: Leg = {
  kind: 'bus', from: spot('Stop A'), to: spot('Stop B'), departAt: at('08:09'), arriveAt: at('08:20'), durationS: 660, geometry: line,
  labels: [{ text: 'Bus in 4 min' }], route: { id: 'P10', name: 'P10', color: '#d62828' }, headsign: 'Centre Point',
}
const plan: Plan = {
  options: [
    { kind: 'bus', departAt: at('08:00'), arriveAt: at('08:23'), durationS: 1380, walkS: 480, transfers: 0, legs: [walk, bus] },
    {
      kind: 'walk', departAt: at('08:00'), arriveAt: at('08:41'), durationS: 2460, walkS: 2460, transfers: 0,
      legs: [{ ...walk, labels: [{ text: 'Shortcut, unverified', from: 0, to: 1 }] }],
    },
  ],
}

test('option cards show total time, arrival, walking and the domain labels', () => {
  render(<OptionList options={plan.options} selected={0} onSelect={() => {}} />)
  const [bus1, walk1] = screen.getAllByRole('radio')
  expect(bus1.textContent).toContain('23 min')
  expect(bus1.textContent).toContain('Arrive 08:23')
  expect(bus1.textContent).toContain('Walk 8 min')
  expect(within(bus1).getByText('P10').getAttribute('style')).toContain('rgb(214, 40, 40)')
  expect(within(bus1).getByText('Through Library, open until 22:00')).toBeTruthy()
  expect(within(bus1).getByText('Covered walkway')).toBeTruthy()
  expect(within(bus1).getByText('Bus in 4 min')).toBeTruthy()
  expect(walk1.textContent).toContain('41 min')
  expect(walk1.textContent).toContain('Walk only')
  expect(within(walk1).getByText('Shortcut, unverified')).toBeTruthy()
  expect(bus1.getAttribute('aria-checked')).toBe('true')
})

test('detail lists the legs and the walking steps', () => {
  render(<OptionDetail option={plan.options[0]} />)
  expect(screen.getByText('Walk 5 min')).toBeTruthy()
  expect(screen.getByText('Head north')).toBeTruthy()
  expect(screen.getByText('Centre Point')).toBeTruthy()
  expect(screen.getByText('Board at Stop A, get off at Stop B (08:20).')).toBeTruthy()
})

test('the map gets a solid walk, a highlighted covered run and a bus in its colour', () => {
  expect(optionToRoute(plan.options[0]).map((l) => (l.mode === 'bus' ? l.color : l.style))).toEqual(['normal', 'normal', 'covered', '#d62828'])
  expect(optionToRoute(plan.options[1]).map((l) => (l.mode === 'bus' ? l.color : l.style))).toEqual(['likely', 'normal'])
})

function Url() {
  const l = useLocation()
  return <output data-testid="url">{l.pathname + l.search}</output>
}

test('tapping a profile chip puts it in the URL', () => {
  render(
    <MemoryRouter initialEntries={['/plan?from=stop:CP&to=stop:K9']}>
      <PlanPage />
      <Url />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('radio', { name: 'Sheltered' }))
  expect(screen.getByTestId('url').textContent).toBe('/plan?from=stop%3ACP&to=stop%3AK9&profile=sheltered')
  fireEvent.click(screen.getByRole('radio', { name: 'Arrive by' }))
  expect(screen.getByTestId('url').textContent).toMatch(/&when=arrive&at=\d{4}-\d\d-\d\dT\d\d%3A\d\d&profile=sheltered$/)
})
