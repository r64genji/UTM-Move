// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ShortcutFeedback } from './ShortcutFeedback.tsx'

test('Yes and No open the form prefilled with the shortcut id and answer', () => {
  render(<ShortcutFeedback shortcutId="sc-1" />)
  expect(screen.getByRole('link', { name: 'Yes' }).getAttribute('href')).toBe(
    'https://docs.google.com/forms/d/e/1FAIpQLSfwLOnLvRxB2sJnAHIDMqcKtaVTYy8OR3KrJ_beSJKOIYxj0Q/viewform?usp=pp_url&entry.1000000004=sc-1&entry.1000000005=Yes',
  )
  expect(screen.getByRole('link', { name: 'No' }).getAttribute('href')).toContain('entry.1000000005=No')
})
