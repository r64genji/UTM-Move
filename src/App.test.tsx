// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test } from 'vitest'
import { routes } from './App.tsx'

afterEach(cleanup)

test('home renders, and /stop/CP shows the stop page', async () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Where to?')

  await act(() => router.navigate('/stop/CP'))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stop CP')
  expect(screen.getByText('Bus stop')).toBeTruthy()
})

test('the plan page reads the trip from the URL', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/plan?from=me&to=stop:CP&profile=sheltered'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByText('Your location')).toBeTruthy()
  expect(screen.getByText('Stop CP')).toBeTruthy()
  expect(screen.getByRole('radio', { name: 'Sheltered' }).getAttribute('aria-checked')).toBe('true')
})
