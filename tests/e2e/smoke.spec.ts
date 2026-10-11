import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

test('fake GPS, pick a stop, plan a trip, navigate and watch the step change', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-03-17T08:00:00+08:00') })
  await page.goto('/plan')

  // From: my location (fake GPS on campus).
  await page.getByRole('button', { name: /^From:/ }).click()
  await page.getByRole('button', { name: 'My location' }).click()
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByRole('img', { name: /Your start point/ })).toBeVisible()

  // To: search a stop by name.
  await page.getByRole('button', { name: /^To:/ }).click()
  await page.getByRole('searchbox', { name: 'Search to' }).fill('Centre Point')
  await page.getByRole('button', { name: /Centre Point/ }).first().click()

  const options = page.getByRole('radiogroup', { name: 'Trip options' })
  await expect(options).toBeVisible()
  await expect(options.getByRole('radio').first()).toBeVisible()

  await page.getByRole('link', { name: 'Start' }).click()
  await expect(page).toHaveURL(/\/navigate/)
  const now = page.locator('.guide-now')
  await expect(now).toBeVisible()
  await expect(now).toHaveText('Head south')

  // Walk along the route: the guidance has to move on to the next step.
  for (const [latitude, longitude] of [[1.5598, 103.6368], [1.5606, 103.6365], [1.5614, 103.6362], [1.5622, 103.6359]]) {
    await context.setGeolocation({ latitude, longitude, accuracy: 10 })
    await page.waitForTimeout(500)
  }
  await expect(now).toHaveText('Turn left after Bengkel Kayu')
})
