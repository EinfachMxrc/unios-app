// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('empty timetable is a compact row with space before the next sections', async ({ page }, testInfo) => {
  await page.route('**/api/timetable/status', (route) =>
    route.fulfill({
      json: {
        subscribed: true,
        name: 'Stundenplan',
        keyring_available: true,
        last_success_at: '2026-10-03T08:00:00Z',
        last_error: '',
        event_count: 0,
        session_link: false,
        through: null,
      },
    }),
  )
  await page.route('**/api/timetable/events?**', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/overview', async (route) => {
    const original = await route.fetch()
    await route.fulfill({ json: { ...(await original.json()), deadlines: [], changes: [] } })
  })
  for (const theme of ['dark', 'light']) {
    await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const row = page.locator('.timetable-summary-empty')
      await expect(row.getByText('Für heute bist du durch')).toBeVisible()
      const bounds = (await row.boundingBox())!
      expect(bounds.height).toBeLessThan(width === 390 ? 160 : 110)
      if (width === 390) {
        const text = (await row.locator(':scope > div').boundingBox())!
        const link = (await row.getByRole('link', { name: 'Vollständigen Stundenplan ansehen' }).boundingBox())!
        expect(text.width).toBeGreaterThanOrEqual(240)
        expect(link.y).toBeGreaterThanOrEqual(text.y + text.height - 1)
        expect(link.x + link.width).toBeLessThanOrEqual(bounds.x + bounds.width)
      }
      const following = (await page.locator('.today-workspace').boundingBox())!
      expect(bounds.y - (following.y + following.height)).toBeGreaterThanOrEqual(23)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`today-empty-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
})

test('a failed timetable read is not displayed as a free day', async ({ page }) => {
  await page.route('**/api/timetable/status', (route) =>
    route.fulfill({ json: { subscribed: true, last_error: '', keyring_available: true } }),
  )
  await page.route('**/api/timetable/events?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Kalender derzeit nicht erreichbar' } }),
  )
  await page.goto('/')
  await expect(page.getByText('Kalender derzeit nicht erreichbar')).toBeVisible()
  await expect(page.locator('.timetable-summary-empty')).toHaveCount(0)
})
