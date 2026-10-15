// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
import { calendarNow, calendarStatus, calendarEvents, calendarDeadlines } from './calendar-fixtures'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(calendarNow) })
  await page.route('**/api/timetable/status', (route) => route.fulfill({ json: calendarStatus }))
  await page.route('**/api/timetable/events?**', (route) => {
    const start = new URL(route.request().url()).searchParams.get('day')!
    const end = new Date(`${start}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() + 7)
    return route.fulfill({
      json: calendarEvents.filter(
        (event) =>
          event.starts_at.slice(0, 10) >= start && event.starts_at.slice(0, 10) < end.toISOString().slice(0, 10),
      ),
    })
  })
  await page.route('**/api/deadlines', (route) => route.fulfill({ json: calendarDeadlines }))
})

test('work week places overlaps side by side, opens event details with keyboard and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  await expect(schedule.getByRole('button', { name: 'Arbeitswoche', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(schedule.locator('.timetable-navigation')).toContainText('5. Oktober – 9. Oktober 2026')
  const lecture = schedule.getByTestId('timetable-event-9004'),
    overlap = schedule.getByTestId('timetable-event-9005')
  await expect(lecture).toBeVisible()
  await expect(overlap).toBeVisible()
  const a = (await lecture.boundingBox())!,
    b = (await overlap.boundingBox())!
  expect(a.x + a.width).toBeLessThanOrEqual(b.x)
  const trigger = lecture.getByRole('button')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('R101, Fictional Campus')
  await expect(page.getByRole('dialog')).toContainText('10:00')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('day navigation crosses a week boundary, remembers the view and returns to today', async ({ page }) => {
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  await schedule.getByRole('button', { name: 'Tag', exact: true }).click()
  await schedule.getByRole('button', { name: /Sonntag, 11\. Oktober 2026$/ }).click()
  await schedule.getByRole('button', { name: 'Nächster Tag', exact: true }).click()
  await expect(schedule.locator('.timetable-navigation strong')).toContainText('12. Oktober')
  await page.goto('/courses')
  await page.goBack()
  await expect(schedule.getByRole('button', { name: 'Tag', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(schedule.locator('.timetable-navigation strong')).toContainText('12. Oktober')
  await schedule.getByRole('button', { name: 'Heute', exact: true }).click()
  await expect(schedule.getByTestId('timetable-event-9004')).toBeVisible()
})

test('mobile selects one readable day with arrow keys and offers the full week as a list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  await expect(schedule.locator('article')).toHaveCount(3)
  const wednesday = schedule.getByRole('button', { name: /Mittwoch, 7\. Oktober 2026$/ })
  await wednesday.focus()
  await page.keyboard.press('ArrowRight')
  await expect(schedule.getByRole('button', { name: /Donnerstag, 8\. Oktober 2026$/ })).toBeFocused()
  await expect(schedule.locator('article')).toHaveCount(1)
  await expect(schedule.locator('article')).toContainText('English Workshop')
  await schedule.getByRole('button', { name: 'Liste', exact: true }).click()
  await expect(schedule.locator('article')).toHaveCount(9)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('month preserves all deadline titles on mobile and supports keyboard month transitions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  await page
    .locator('.view-switch[aria-label="Fristenansicht"]')
    .getByRole('button', { name: 'Kalender', exact: true })
    .click()
  const calendar = page.locator('.deadline-calendar'),
    agenda = calendar.getByRole('region', { name: 'Fristen am ausgewählten Tag' })
  await expect(agenda.getByRole('button')).toHaveCount(3)
  await expect(agenda).toContainText('Mathematik Übungsblatt')
  await expect(agenda).toContainText('23:59')
  await calendar.getByRole('button', { name: 'Samstag, 31. Oktober 2026', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(calendar.locator('.deadline-calendar-header strong')).toHaveText('November 2026')
  await expect(calendar.getByRole('button', { name: 'Sonntag, 1. November 2026', exact: true })).toBeFocused()
  await calendar.getByRole('button', { name: 'Heute', exact: true }).click()
  await expect(agenda.getByRole('button')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
