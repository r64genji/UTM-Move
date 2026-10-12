// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import transitJson from '../public/data/transit.json?raw'
import { afterEach, expect, test, vi } from 'vitest'
import { routes } from './App.tsx'

afterEach(cleanup)

test('home greets the student, and /stop/CP shows the stop page', async () => {
  const json = transitJson
  vi.stubGlobal('fetch', async () => new Response(json))
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (Morning|Afternoon|Evening), Student$/)
  expect(screen.getByRole('link', { name: 'Find stop or location...' })).toBeTruthy()

  await act(() => router.navigate('/stop/CP'))
  expect((await screen.findByRole('heading', { level: 1, name: 'Centre Point' })).textContent).toBe('Centre Point')
  expect(screen.getByText(/Timetable from 2025\/2026\. Times may change\. Timetable only\. No live bus positions\./)).toBeTruthy()
})

test('the plan page reads the trip from the URL', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/plan?from=me&to=stop:CP&profile=sheltered'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByRole('button', { name: 'From: Your Location' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'To: Stop CP' })).toBeTruthy()
  expect(screen.getByRole('radio', { name: 'Sheltered' }).getAttribute('aria-checked')).toBe('true')
})
