import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

test('fake GPS, search a place (with a typo), plan a trip, navigate and watch the step change', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-03-17T08:00:00+08:00') })
  await page.goto('/plan')

  // From: Your Location (fake GPS on campus). The device already allows it, so the fix arrives without a tap.
  await expect(page.getByRole('button', { name: 'From: Your Location' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Your start point/ })).toBeVisible()

  // To: search a place by name (offline index).
  await page.getByRole('button', { name: /^To:/ }).click()
  await page.getByRole('searchbox', { name: 'Search to' }).fill('perpustakan sultanah')
  await page.getByRole('button', { name: /Perpustakaan Sultanah Zanariah/ }).first().click()

  const options = page.getByRole('radiogroup', { name: 'Trip options' })
  await expect(options).toBeVisible()
  await expect(options.getByRole('radio').first()).toBeVisible()

  await page.getByRole('link', { name: 'Start' }).click()
  await expect(page).toHaveURL(/\/navigate/)
  const now = page.locator('.guide-now')
  await expect(now).toBeVisible()
  await expect(now).toHaveText('Head south')

  // Walk towards the library: the guidance has to move on to the next step.
  for (const [latitude, longitude] of [[1.5605, 103.6376], [1.5616, 103.6383], [1.5627, 103.639], [1.5638, 103.6397]]) {
    await context.setGeolocation({ latitude, longitude, accuracy: 10 })
    await page.waitForTimeout(500)
  }
  await expect(now).not.toHaveText('Head south')
})

test('home: greeting, the nearest stop with its next buses, and a route filter', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-03-17T08:00:00+08:00') })
  await page.goto('/')
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('heading', { name: 'Select a route' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Route F/ })).toBeVisible()
    await page.getByRole('button', { name: 'Show All Stops' }).click()
    await expect(page.getByRole('button', { name: 'Hide All Stops' })).toBeVisible()
    return
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Good Morning, Student')
  const nearest = page.getByRole('region', { name: 'Nearest stop' })
  await expect(nearest.getByRole('heading', { name: 'Jalan Amal 1' })).toBeVisible()
  await expect(nearest.getByText(/: \d+ min/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Route F' }).click()
  await expect(page.getByRole('button', { name: 'Route F' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'All Routes' })).toHaveAttribute('aria-pressed', 'false')
})
