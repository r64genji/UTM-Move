// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App.tsx'

test('renders the app title', () => {
  render(<App />)
  expect(screen.getByRole('heading').textContent).toBe('UTM Move')
})
