// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { calendarNow } from './calendar-fixtures'

test.beforeEach(async ({ page }) => {
  // Pixel-specific gesture fixtures intentionally use the manual 100% scale.
  await page.addInitScript(() =>
    localStorage.setItem('unios-calendar-preferences-v1', JSON.stringify({ view: 'workweek', hourPx: 64, fit: false })),
  )
  await page.request.post('http://127.0.0.1:8173/api/__test__/reset')
  await page.clock.install({ time: new Date(calendarNow) })
  await page.setViewportSize({ width: 1440, height: 1000 })
})

async function create(page: Page, title = 'Mathe lernen') {
  const result = await page.request.post('/api/timetable/events', {
    data: {
      title,
      starts_at: '2026-10-07T12:00:00Z',
      ends_at: '2026-10-07T13:00:00Z',
    },
  })
  expect(result.status()).toBe(201)
  return (await result.json()).event as { id: number; revision: string }
}

async function beginDrag(page: Page, from: Locator, dx: number, dy: number) {
  await from.scrollIntoViewIfNeeded()
  const box = (await from.boundingBox())!
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 10 })
}

async function drag(page: Page, from: Locator, dx: number, dy: number) {
  await beginDrag(page, from, dx, dy)
  await page.mouse.up()
}

test('creates in free time without a subscription, saves and remains editable after reload', async ({ page }) => {
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  const column = schedule.locator('[data-calendar-day="2026-10-07"]')
  await expect(schedule.getByRole('button', { name: 'Neuer Termin', exact: true })).toBeEnabled()
  await schedule.scrollIntoViewIfNeeded()
  const bounds = (await column.boundingBox())!
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + 13 * 64 + 20)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Beginn', { exact: true })).toHaveValue('2026-10-07T13:15')
  await dialog.getByLabel('Titel', { exact: true }).fill('Mathe lernen')
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(schedule.locator('article')).toContainText('Mathe lernen')
  await page.reload()
  await schedule.locator('article [data-calendar-trigger]').click()
  await expect(page.getByRole('dialog')).toContainText('Dein eigener Termin.')
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByLabel('Titel', { exact: true }).fill('Mathe und Logik')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(schedule.locator('article')).toContainText('Mathe und Logik')
})

test('moves across days, snaps to quarters and resizes both edges with persistent undo', async ({ page }) => {
  await page.goto('/deadlines')
  const event = await create(page)
  await page.reload()
  const item = page.getByTestId(`timetable-event-${event.id}`)
  // Keep this exact-distance gesture away from the intentional edge auto-scroll zone.
  await page.locator('.calendar-time-scroll').evaluate((area) => {
    area.scrollTop = 10 * 64
  })
  const width = (await page.locator('[data-calendar-day="2026-10-07"]').boundingBox())!.width
  await drag(page, item.locator('[data-calendar-trigger]'), width, 64)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.locator('[data-calendar-day="2026-10-08"]').getByTestId(`timetable-event-${event.id}`),
  ).toBeVisible()
  await expect(item).toContainText('15:00 – 16:00')
  await page.locator('.calendar-time-scroll').evaluate((area) => {
    area.scrollTop = 10 * 64
  })
  await drag(page, item.getByRole('button', { name: 'Ende von Mathe lernen ändern' }), 0, 32)
  await expect(item).toContainText('15:00 – 16:30')
  await drag(page, item.getByRole('button', { name: 'Beginn von Mathe lernen ändern' }), 0, -16)
  await expect(item).toContainText('14:45 – 16:30')
  await page.locator('#timetable').getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(item).toContainText('15:00 – 16:30')
  await page.reload()
  await expect(item).toContainText('15:00 – 16:30')
})

test('Escape cancels a drag and a failed save restores the original position', async ({ page }) => {
  await page.goto('/deadlines')
  const event = await create(page)
  await page.reload()
  const item = page.getByTestId(`timetable-event-${event.id}`),
    trigger = item.locator('[data-calendar-trigger]')
  await beginDrag(page, trigger, 0, 64)
  await expect(page.locator('.calendar-drag-preview')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('.calendar-drag-preview')).toHaveCount(0)
  await expect(item).toContainText('14:00 – 15:00')
  await page.route(`**/api/timetable/events/${event.id}`, (route) =>
    route.fulfill({ status: 409, json: { detail: 'Termin wurde inzwischen geändert.' } }),
  )
  await drag(page, trigger, 0, 32)
  await expect(page.locator('#timetable').getByRole('alert')).toContainText('Termin wurde inzwischen geändert.')
  await expect(item).toContainText('14:00 – 15:00')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Escape cancels either resize edge without saving or opening the editor', async ({ page }) => {
  await page.goto('/deadlines')
  const event = await create(page)
  await page.reload()
  const item = page.getByTestId(`timetable-event-${event.id}`)
  let saves = 0
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/api/timetable/events/${event.id}`)) saves += 1
  })
  for (const [label, offset] of [
    ['Beginn von Mathe lernen ändern', -16],
    ['Ende von Mathe lernen ändern', 32],
  ] as const) {
    await beginDrag(page, item.getByRole('button', { name: label }), 0, offset)
    await expect(page.locator('.calendar-drag-preview')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.calendar-drag-preview')).toHaveCount(0)
    await expect(item).toContainText('14:00 – 15:00')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.reload()
  await expect(item).toContainText('14:00 – 15:00')
  expect(saves).toBe(0)
})

test('imported appointments get a reversible personal adjustment and never silently change the source', async ({
  page,
}) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/timetable-slots')
  await page.goto('/deadlines')
  const item = page.locator('[data-calendar-day="2026-10-05"] article').first()
  await expect(page.locator('#timetable').getByRole('button', { name: 'Neuer Termin', exact: true })).toBeEnabled()
  await item.locator('[data-calendar-trigger]').focus()
  await page.keyboard.press('Alt+ArrowRight')
  const moved = page.locator('[data-calendar-day="2026-10-06"] article').first()
  await expect(moved.locator('[data-calendar-trigger]')).toHaveAttribute('aria-label', /Persönlich angepasst/)
  await moved.locator('[data-calendar-trigger]').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Hochschultermin:')
  await dialog.getByRole('button', { name: 'Hochschultermin wiederherstellen', exact: true }).click()
  await expect(page.locator('[data-calendar-day="2026-10-05"] article')).toHaveCount(2)
  await expect(page.locator('[data-calendar-day="2026-10-06"] article')).toHaveCount(0)
})

test('mobile edits dates and removes an own event with undo, without horizontal overflow', async ({ page }) => {
  await page.goto('/deadlines')
  const event = await create(page)
  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId(`timetable-event-${event.id}`).locator('[data-calendar-trigger]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByLabel('Beginn', { exact: true }).fill('2026-10-07T14:30')
  await page.getByLabel('Ende', { exact: true }).fill('2026-10-07T16:00')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  const item = page.getByTestId(`timetable-event-${event.id}`)
  await expect(item).toContainText('14:30 – 16:00')
  await item.locator('[data-calendar-trigger]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Entfernen', exact: true }).click()
  await expect(item).toHaveCount(0)
  await page.locator('#timetable').getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(item).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('weekly series editor keeps weekdays separate and offers individual, future and whole-series scopes', async ({
  page,
}, testInfo) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/timetable-series')
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  const item = schedule.locator('[data-calendar-day="2026-10-06"] article').first()
  await item.locator('[data-calendar-trigger]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const scope = page.getByLabel('Änderung anwenden auf', { exact: true })
  await expect(scope.locator('option')).toHaveText([
    'Nur diesen Termin',
    'Diesen und folgende Termine',
    'Die ganze wöchentliche Serie',
  ])
  await page.getByLabel('Beginn', { exact: true }).fill('2026-10-06T14:00')
  await scope.selectOption('series')
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && response.url().includes('/api/timetable/events/'),
  )
  await page.screenshot({ path: testInfo.outputPath('calendar-series-desktop.png') })
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  expect((await saved).ok()).toBe(true)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(item).toContainText('14:00 – 15:30')
  const future = await (await page.request.get('/api/timetable/events?day=2026-10-26')).json()
  expect(future[0].starts_at).toBe('2026-10-27T13:00:00Z')
  const current = await (await page.request.get('/api/timetable/events?day=2026-10-05')).json()
  expect(current.find((value: { starts_at: string }) => value.starts_at.startsWith('2026-10-08')).starts_at).toBe(
    '2026-10-08T12:15:00Z',
  )
  await schedule.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(item).toContainText('14:15 – 15:30')
  const selectedId = await item.getAttribute('data-testid')
  await schedule.getByRole('button', { name: 'Liste', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId(selectedId!).locator('[data-calendar-trigger]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(scope).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('calendar-series-mobile.png') })
})
