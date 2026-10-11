import { expect, test } from '@playwright/test'
import sharp from 'sharp'

test('after one visit the app plans walk and bus trips with no network, map included', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-03-17T08:00:00+08:00') })
  const PLAN = '/plan?when=depart&at=2026-03-17T08:00'

  // Online: load once and wait until the service worker controls the page and has precached everything.
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
  })
  // The precache is filled during install; `ready` resolves after activation, so it is complete.
  const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length)
  expect(cached).toBeGreaterThan(60)

  await context.setOffline(true)
  const tiles: { status: number; fromSw: boolean }[] = []
  page.on('response', (r) => {
    if (r.url().endsWith('.pmtiles')) tiles.push({ status: r.status(), fromSw: r.fromServiceWorker() })
  })

  // Walk only: two stops a few minutes apart.
  await page.goto(`${PLAN}&from=stop:CP&to=stop:AM`)
  const options = page.getByRole('radiogroup', { name: 'Trip options' })
  await expect(options.getByText('Walk only').first()).toBeVisible()

  // Bus: across campus.
  await page.goto(`${PLAN}&from=stop:CP&to=stop:K10`)
  await expect(options.locator('.route-chip').first()).toBeVisible()

  // The map still draws from the cached PMTiles (range requests answered by the service worker).
  await expect.poll(() => tiles.filter((t) => t.status === 206 && t.fromSw).length).toBeGreaterThan(0)
  const shot = await page.locator('.map canvas').screenshot()
  const { data } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
  const colours = new Set<number>()
  for (let i = 0; i < data.length; i += 4 * 7) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
  expect(colours.size).toBeGreaterThan(40)
})
