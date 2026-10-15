// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('a PDF opens the direct course workspace and Today resumes its page and draft', async ({ page }) => {
  const response = await page.request.post('/api/__test__/focus-workspace')
  expect(response.ok()).toBeTruthy()
  const seed = await response.json()
  await page.goto(`/material/${seed.version_id}?page=12`)
  await expect(page.locator('[data-material-page="12"] canvas')).toBeVisible()
  await page.getByRole('link', { name: 'Arbeitsbereich öffnen', exact: true }).click()
  await expect(page).toHaveURL(
    new RegExp(`/learning/focus/course/${seed.course_id}\\?mode=source&version=${seed.version_id}&page=12`),
  )
  await expect(page.locator('.focus-exam')).toHaveCount(0)
  const note = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await note.fill('Meine direkte Mitschrift ohne Lernplan.')
  await page.getByRole('link', { name: 'Heute', exact: true }).first().click()
  await page.getByRole('link', { name: 'Hier weitermachen', exact: true }).click()
  await expect(note).toHaveValue('Meine direkte Mitschrift ohne Lernplan.')
  await expect(page.locator('[data-material-page="12"] canvas')).toBeInViewport()
  await page.reload()
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
})

test('source and notes adapt to the actual available width with a keyboard divider', async ({ page }) => {
  const response = await page.request.post('/api/__test__/focus-workspace')
  const seed = await response.json()
  await page.goto(`/learning/focus/course/${seed.course_id}?version=${seed.version_id}&page=12`)
  const handle = page.locator('.reader-split-handle')
  await expect(handle).toBeVisible()
  await handle.focus()
  await handle.press('End')
  await expect
    .poll(() => page.locator('.material-reader').evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThanOrEqual(319)
  await handle.dblclick()
  await page.setViewportSize({ width: 960, height: 900 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.material-side-drawer')).toBeVisible()
  await expect(handle).toHaveCount(0)
})

test('a new app tab resumes a local draft and source page from device storage', async ({ page, context }) => {
  const response = await page.request.post('/api/__test__/focus-workspace')
  const seed = await response.json()
  await page.goto(`/learning/focus/course/${seed.course_id}?mode=source&version=${seed.version_id}&page=80`)
  await expect(page.locator('[data-material-page="80"] canvas')).toBeInViewport()
  await page
    .getByRole('textbox', { name: 'Notizinhalt', exact: true })
    .fill('Mein lokaler Entwurf bleibt beim Neustart erhalten.')
  const next = await context.newPage()
  await next.goto('/')
  await next.getByRole('link', { name: 'Hier weitermachen', exact: true }).click()
  await expect(next.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toHaveValue(
    'Mein lokaler Entwurf bleibt beim Neustart erhalten.',
  )
  await expect(next.locator('.material-pager')).toContainText('Seite 80 von 120')
  await expect(next.locator('[data-material-page="80"] canvas')).toBeInViewport()
  await next.close()
})

test('a fresh note-first session retains the explicit source page when returning to the PDF', async ({ page }) => {
  const response = await page.request.post('/api/__test__/focus-workspace')
  const seed = await response.json()
  await page.goto(
    `/learning/focus/course/${seed.course_id}?mode=notes&version=${seed.version_id}&note=${seed.note_id}&page=80`,
  )
  await expect(page.locator('.note-canvas')).toContainText('Meine eigene Begründung.')
  await page.getByRole('button', { name: 'Quelle & Mitschrift', exact: true }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 80 von 120')
  await expect(page.locator('[data-material-page="80"] canvas')).toBeInViewport()
})

test('Today quick note focuses the capture field and leaves one clear save action', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Schnelle Notiz', exact: true }).click()
  const capture = page.getByRole('textbox', { name: 'Schnell erfassen', exact: true })
  await expect(capture).toBeFocused()
  await capture.fill('Kurzer Gedanke aus der Vorlesung.')
  await page.getByRole('button', { name: 'Festhalten', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Gesichert.' })).toBeVisible()
})
