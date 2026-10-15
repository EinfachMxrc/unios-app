// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
import { calendarNow } from './calendar-fixtures'

test('saved schedule section keeps next deadline reachable and the timetable deep link intentional', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(calendarNow) })
  await page.goto('/deadlines')
  const switcher = page.locator('.deadline-page-switch')
  await expect(switcher.getByRole('button', { name: 'Kalender', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.deadline-next')).toBeVisible()
  await switcher.getByRole('button', { name: 'Abgaben', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Fristen als Tabelle' })).toBeVisible()
  await page.reload()
  await expect(switcher.getByRole('button', { name: 'Abgaben', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/deadlines#timetable')
  await expect(page.locator('#timetable')).toBeVisible()
  await expect(switcher.getByRole('button', { name: 'Kalender', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await switcher.getByRole('button', { name: 'Abgaben', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Fristen als Tabelle' })).toBeVisible()
})

test('secondary source failure is distinct from setup and does not block the main deadline', async ({ page }) => {
  let fail = true
  await page.route('**/api/primuss/status', (route) =>
    fail
      ? route.fulfill({ status: 503, json: { detail: 'Fixture source unavailable' } })
      : route.fulfill({ json: { enrollment_available: false, session_available: false } }),
  )
  await page.route('**/api/public-periods', (route) =>
    route.fulfill({ json: { configured: false, state: 'never', last_success_at: null, periods: [] } }),
  )
  await page.goto('/deadlines')
  await page.locator('.deadline-sources > summary').click()
  const sources = page.locator('.deadline-sources')
  const failure = sources.getByRole('alert').filter({ hasText: 'Fixture source unavailable' })
  await expect(failure).toBeVisible()
  await expect(sources.getByRole('link', { name: 'PRIMUSS einrichten', exact: true })).toHaveCount(0)
  await expect(page.locator('.deadline-next')).toBeVisible()
  fail = false
  await failure.getByRole('button', { name: 'Daten erneut laden', exact: true }).click()
  await expect(sources.getByRole('link', { name: 'PRIMUSS einrichten', exact: true })).toBeVisible()
})

test.describe('coarse pointer targets', () => {
  test.use({ hasTouch: true, viewport: { width: 1440, height: 1000 } })
  test('sidebar actions and notifications have both 44px axes without hover', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'unios-sidebar-layout-v1',
        JSON.stringify({
          version: 1,
          workspace: ['today', 'courses', 'learning', 'notes', 'deadlines'],
          library: [],
          courseOrder: [],
          hiddenCourses: [],
          showCourses: true,
        }),
      ),
    )
    await page.goto('/deadlines')
    const action = page.locator('.sidebar-course-toggle').first()
    await expect(action).toBeVisible()
    await expect(action).toHaveCSS('opacity', '1')
    for (const target of [action, page.locator('.topbar-notifications')]) {
      const bounds = (await target.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
    await action.focus()
    await expect(action).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(action).toHaveAttribute('aria-expanded', 'true')
  })
})
