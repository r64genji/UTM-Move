import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

test('fake GPS, search a place (with a typo), plan a trip, navigate and watch the step change', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-03-17T08:00:00+08:00') })
  await page.goto('/plan')

  // From: my location (fake GPS on campus).
  await page.getByRole('button', { name: /^From:/ }).click()
  await page.getByRole('button', { name: 'My location' }).click()
  await page.getByRole('button', { name: 'Use my location' }).click()
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
  await expect(now).toHaveText('Head northeast')

  // Walk towards the library: the guidance has to move on to the next step.
  for (const [latitude, longitude] of [[1.5605, 103.6376], [1.5616, 103.6383], [1.5627, 103.639], [1.5638, 103.6397]]) {
    await context.setGeolocation({ latitude, longitude, accuracy: 10 })
    await page.waitForTimeout(500)
  }
  await expect(now).not.toHaveText('Head northeast')
})
