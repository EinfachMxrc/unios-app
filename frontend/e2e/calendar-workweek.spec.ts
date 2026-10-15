// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
import { calendarNow } from './calendar-fixtures'

test.beforeEach(async ({ page }) => {
  // Editing geometry is fixed here; calendar-visibility covers automatic fitting.
  await page.addInitScript(() => {
    if (!localStorage.getItem('unios-calendar-preferences-v1')) localStorage.setItem('unios-calendar-preferences-v1', JSON.stringify({ view: 'workweek', hourPx: 64, fit: false }))
  })
  await page.request.post('http://127.0.0.1:8173/api/__test__/reset')
  await page.clock.install({ time: new Date(calendarNow) })
  await page.setViewportSize({ width: 1440, height: 1000 })
})

test('defaults to the teaching week, shows weekend appointments explicitly and remembers view and zoom', async ({ page, context }) => {
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  await expect(schedule.getByRole('button', { name: 'Arbeitswoche', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(schedule.locator('[data-calendar-day]')).toHaveCount(5)
  await page.request.post('/api/timetable/events', { data: {
    title: 'Synthetic weekend revision', starts_at: '2026-10-10T09:00:00Z', ends_at: '2026-10-10T10:00:00Z',
  } })
  await page.reload()
  await expect(schedule.locator('.calendar-weekend-notice')).toContainText('1 Termin am Wochenende')
  await schedule.getByRole('button', { name: 'Wochenende anzeigen', exact: true }).click()
  await expect(schedule.locator('[data-calendar-day]')).toHaveCount(7)
  await expect(schedule.getByRole('button', { name: 'Woche', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await schedule.getByRole('button', { name: 'Größere Stundenhöhe', exact: true }).click()
  await schedule.getByRole('button', { name: 'Größere Stundenhöhe', exact: true }).click()
  await expect(schedule.getByRole('button', { name: 'Stundenhöhe zurücksetzen', exact: true })).toHaveText('125%')
  await page.reload()
  await expect(schedule.locator('[data-calendar-day]')).toHaveCount(7)
  await expect(schedule.getByRole('button', { name: 'Stundenhöhe zurücksetzen', exact: true })).toHaveText('125%')
  const anotherWindow = await context.newPage()
  await anotherWindow.clock.install({ time: new Date(calendarNow) })
  await anotherWindow.goto('/deadlines')
  await expect(anotherWindow.locator('#timetable').getByRole('button', { name: 'Woche', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(anotherWindow.getByRole('button', { name: 'Stundenhöhe zurücksetzen', exact: true })).toHaveText('125%')
  await anotherWindow.close()
})

test('keeps resize handles reachable and short appointments editable through the full form', async ({ page }) => {
  await page.goto('/deadlines')
  const long = await page.request.post('/api/timetable/events', { data: {
    title: 'Synthetic lecture', starts_at: '2026-10-07T12:00:00Z', ends_at: '2026-10-07T13:00:00Z',
  } })
  const short = await page.request.post('/api/timetable/events', { data: {
    title: 'Synthetic quick review', starts_at: '2026-10-07T14:00:00Z', ends_at: '2026-10-07T14:15:00Z',
  } })
  const longId = (await long.json()).event.id, shortId = (await short.json()).event.id
  await page.reload()
  const start = page.getByTestId(`timetable-event-${longId}`).getByRole('button', { name: 'Beginn von Synthetic lecture ändern' })
  const end = page.getByTestId(`timetable-event-${longId}`).getByRole('button', { name: 'Ende von Synthetic lecture ändern' })
  await start.scrollIntoViewIfNeeded()
  for (const handle of [start, end]) {
    const rect = (await handle.boundingBox())!
    expect(rect.height).toBeGreaterThanOrEqual(24)
    expect(rect.width).toBeGreaterThanOrEqual(24)
  }
  await start.focus(); await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByTestId(`timetable-event-${longId}`)).toContainText('13:45 – 15:00')
  await expect(page.getByTestId(`timetable-event-${longId}`)).toHaveAttribute('aria-busy', 'false')
  const quick = page.getByTestId(`timetable-event-${shortId}`)
  await expect(quick.locator('.calendar-resize')).toHaveCount(0)
  await expect(quick.locator('[data-calendar-trigger]')).toBeEnabled()
  await quick.locator('[data-calendar-trigger]').focus(); await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByLabel('Ende', { exact: true }).fill('2026-10-07T16:30')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(quick.locator('[data-calendar-trigger]')).toHaveAttribute('aria-label', /16:00 – 16:30/)
  await expect(quick.locator('time')).toHaveCount(0)
})

test('offers a revision guarded retry after a temporary save failure and restores with Undo', async ({ page }) => {
  await page.goto('/deadlines')
  const created = await page.request.post('/api/timetable/events', { data: {
    title: 'Synthetic saved work', starts_at: '2026-10-07T12:00:00Z', ends_at: '2026-10-07T13:00:00Z',
  } })
  const id = (await created.json()).event.id
  await page.reload()
  let attempts = 0
  await page.route(`**/api/timetable/events/${id}`, route => {
    if (route.request().method() !== 'PATCH') return route.continue()
    if (++attempts === 1) return route.fulfill({ status: 503, json: { detail: 'Synthetic temporary failure' } })
    return route.continue()
  })
  const item = page.getByTestId(`timetable-event-${id}`)
  const schedule = page.locator('#timetable')
  // A visible cached appointment can precede writable-host verification after reload.
  await expect(schedule.getByRole('button', { name: 'Neuer Termin', exact: true })).toBeEnabled()
  const trigger = item.locator('[data-calendar-trigger]')
  await trigger.focus()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => attempts).toBe(1)
  await expect(page.locator('#timetable').getByRole('alert')).toContainText('Synthetic temporary failure')
  await expect(item).toContainText('14:00 – 15:00')
  await page.locator('#timetable').getByRole('button', { name: 'Erneut versuchen', exact: true }).click()
  await expect(item).toContainText('14:15 – 15:15')
  await expect(page.locator('#timetable').getByRole('alert')).toHaveCount(0)
  await page.locator('#timetable').getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(item).toContainText('14:00 – 15:00')
})

test('reveals weekend appointments on mobile without squeezing editing controls', async ({ page }) => {
  await page.goto('/deadlines')
  await page.request.post('/api/timetable/events', { data: {
    title: 'Synthetic Saturday work', starts_at: '2026-10-10T09:00:00Z', ends_at: '2026-10-10T10:00:00Z',
  } })
  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  const showWeekend = page.locator('#timetable').getByRole('button', { name: 'Wochenende anzeigen', exact: true })
  expect((await showWeekend.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await showWeekend.click()
  await expect(page.locator('.calendar-agenda')).toContainText('Synthetic Saturday work')
  await expect(page.locator('#timetable').getByRole('button', { name: 'Tag', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
