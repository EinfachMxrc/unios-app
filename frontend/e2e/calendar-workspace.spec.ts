// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'
import { calendarNow, calendarStatus, calendarEvents, calendarDeadlines } from './calendar-fixtures'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(calendarNow) })
  await page.route('**/api/timetable/status', (route) => route.fulfill({ json: calendarStatus }))
  await page.route('**/api/timetable/events?**', (route) => route.fulfill({ json: calendarEvents }))
  await page.route('**/api/deadlines', (route) => route.fulfill({ json: calendarDeadlines }))
})

test('mini month navigates across months with the keyboard and opens weekends as a day', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/deadlines')
  const sidebar = page.locator('.calendar-sidebar')
  await sidebar.getByRole('button', { name: 'Nächster Monat', exact: true }).click()
  await expect(sidebar.locator('.calendar-mini-heading strong')).toHaveText('November 2026')
  await sidebar.getByRole('button', { name: 'Vorheriger Monat', exact: true }).click()
  await sidebar.getByRole('button', { name: 'Samstag, 31. Oktober 2026 auswählen', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(sidebar.locator('.calendar-mini-heading strong')).toHaveText('November 2026')
  await expect(sidebar.getByRole('button', { name: 'Sonntag, 1. November 2026 auswählen', exact: true })).toBeFocused()
  await expect(page.locator('#timetable').getByRole('button', { name: 'Tag', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('[data-calendar-day]')).toHaveAttribute('data-calendar-day', '2026-11-01')
  await sidebar.getByRole('button', { name: 'Sonntag, 6. Dezember 2026 auswählen', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(sidebar.locator('.calendar-mini-heading strong')).toHaveText('Dezember 2026')
  await expect(sidebar.getByRole('button', { name: 'Sonntag, 13. Dezember 2026 auswählen', exact: true })).toBeFocused()
  await page.locator('#timetable').getByRole('button', { name: 'Heute', exact: true }).click()
  await expect(
    sidebar.getByRole('button', { name: 'Mittwoch, 7. Oktober 2026 auswählen', exact: true }),
  ).toHaveAttribute('aria-current', 'date')
})

test('course visibility affects grid and day context, restores on mobile, and never writes to the server', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const writes: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/timetable') && request.method() !== 'GET')
      writes.push(request.method())
  })
  await page.goto('/deadlines')
  const filter = page.locator('.calendar-sidebar').getByRole('checkbox', { name: 'Mathematik', exact: true })
  const event = page.getByTestId('timetable-event-9004')
  await expect(event).toBeVisible()
  await filter.uncheck()
  await expect(event).toHaveCount(0)
  await expect(page.locator('.calendar-day-context')).not.toContainText('Mathematik')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(event).toBeVisible()
  await expect(page.locator('.calendar-sidebar')).toHaveCount(0)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect(event).toHaveCount(0)
  await filter.check()
  await expect(event).toBeVisible()
  await page
    .locator('.calendar-day-context')
    .getByRole('button', { name: /Mathematik/ })
    .click()
  await expect(page.locator('.calendar-event-dialog')).toContainText('R101, Fictional Campus')
  await page.keyboard.press('Escape')
  await expect(page.locator('.calendar-day-context').getByRole('button', { name: /Mathematik/ })).toBeFocused()
  expect(writes).toEqual([])
})

for (const width of [1920, 1440, 1024, 390]) {
  test(`calendar workspace remains readable at ${width}px in light and dark`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 })
    await page.goto('/deadlines#timetable')
    await expect(page.getByTestId('timetable-event-9004')).toBeVisible()
    const directory = path.resolve('..', 'docs/qa/calendar-workspace-20261016')
    await mkdir(directory, { recursive: true })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const destination = path.join(directory, `workspace-${theme}-${width}.png`)
      await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' })
      await testInfo.attach(`workspace-${theme}-${width}`, { path: destination, contentType: 'image/png' })
    }
  })
}
