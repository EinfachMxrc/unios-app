// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
import { screenshotPath } from './artifacts'

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 960 })
})

test('course desk resumes its own PDF, page and draft after visiting another course', async ({ page, context }) => {
  const seed = await (await page.request.post('/api/__test__/focus-workspace')).json()
  await page.goto(`/material/${seed.version_id}?workspace=1&page=12`)
  const body = page.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.fill('Meine Mitschrift gehört zu diesem Kurs.')
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await page.goto(`/courses/${seed.foreign_course_id}`)
  await page.getByRole('link', { name: 'Arbeitsplatz öffnen', exact: true }).click()
  await expect(page.locator('[data-material-page="1"] canvas').first()).toBeVisible()
  const next = await context.newPage()
  await next.goto(`/courses/${seed.course_id}`)
  const desk = next.getByRole('region', { name: 'Dein Schreibtisch', exact: true })
  await expect(desk).toContainText('Seite 12')
  await desk.getByRole('link', { name: 'Arbeitsplatz öffnen', exact: true }).click()
  await expect(
    next.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true }),
  ).toHaveValue('Meine Mitschrift gehört zu diesem Kurs.')
  await expect(next.locator('[data-material-page="12"] canvas').first()).toBeInViewport()
  await next.close()
})

test('reading, split and writing views keep an unsaved note and the PDF position', async ({ page }) => {
  const seed = await (await page.request.post('/api/__test__/focus-workspace')).json()
  await page.goto(`/material/${seed.version_id}?workspace=1&page=12`)
  const modes = page.getByRole('navigation', { name: 'Arbeitsansicht' })
  const body = page.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.fill('Dieser Entwurf bleibt beim Wechsel erhalten.')
  const handle = page.getByRole('separator', { name: 'Breite des Lernbereichs ändern' })
  await expect(handle).toBeVisible()
  const before = await page.locator('.material-side-inline').evaluate((el) => el.getBoundingClientRect().width)
  const initialWidth = Number(await handle.getAttribute('aria-valuenow'))
  await handle.focus()
  await handle.press('ArrowLeft')
  await expect
    .poll(() => page.locator('.material-side-inline').evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(before)
  await modes.getByRole('button', { name: 'Schreiben', exact: true }).click()
  await expect(page.locator('.material-reader')).toBeHidden()
  await expect(body).toHaveValue('Dieser Entwurf bleibt beim Wechsel erhalten.')
  await expect
    .poll(() => page.locator('.material-side-inline').evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(1000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await modes.getByRole('button', { name: 'Nebeneinander', exact: true }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await expect(page.locator('[data-material-page="12"] canvas').first()).toBeInViewport()
  await modes.getByRole('button', { name: 'Lesen', exact: true }).click()
  await expect(page.locator('.material-side-inline')).toHaveCount(0)
  await modes.getByRole('button', { name: 'Nebeneinander', exact: true }).click()
  await expect(body).toHaveValue('Dieser Entwurf bleibt beim Wechsel erhalten.')
  await page.reload()
  await expect(body).toHaveValue('Dieser Entwurf bleibt beim Wechsel erhalten.')
  await expect(handle).toHaveAttribute('aria-valuenow', String(initialWidth + 20))
})

test('compact reader navigation restores the personal sidebar in the course', async ({ page }) => {
  await page.goto('/courses/1')
  const original = await page.locator('.app-sidebar').evaluate((el) => el.getBoundingClientRect().width)
  const visibility = await page.evaluate(() => localStorage.getItem('unios-sidebar-hidden'))
  await page.getByRole('link', { name: 'Arbeitsplatz öffnen', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-compact/)
  expect(await page.locator('.app-sidebar').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(80)
  await page.getByRole('button', { name: 'Seitenleiste einblenden', exact: true }).click()
  await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-compact/)
  await page.goto('/courses/1')
  expect(await page.locator('.app-sidebar').evaluate((el) => el.getBoundingClientRect().width)).toBe(original)
  expect(await page.evaluate(() => localStorage.getItem('unios-sidebar-hidden'))).toBe(visibility)
})

test('saved notes use the same large writing surface and keep their editor while changing layouts', async ({
  page,
}) => {
  const seed = await (await page.request.post('/api/__test__/focus-workspace')).json()
  await page.goto(`/material/${seed.version_id}?workspace=1&note=${seed.note_id}&page=12`)
  const editor = page.locator('.reader-continuous-note .note-prose')
  await expect(editor).toContainText('Meine eigene Begründung.')
  expect(await editor.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
  const saved = page.waitForResponse(
    (response) => response.url().endsWith(`/api/notes/${seed.note_id}`) && response.request().method() === 'PUT',
  )
  await editor.press('ControlOrMeta+End')
  await editor.pressSequentially(' Mein zusätzlicher Gedanke.')
  expect((await saved).ok()).toBeTruthy()
  await editor.evaluate((el) => el.setAttribute('data-editor-preserved', 'yes'))
  const modes = page.getByRole('navigation', { name: 'Arbeitsansicht' })
  await modes.getByRole('button', { name: 'Schreiben', exact: true }).click()
  await expect(editor).toHaveAttribute('data-editor-preserved', 'yes')
  await modes.getByRole('button', { name: 'Nebeneinander', exact: true }).click()
  await expect(editor).toContainText('Mein zusätzlicher Gedanke.')
  await expect(editor).toHaveAttribute('data-editor-preserved', 'yes')
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
})

test('a fresh phone workspace opens a full-height note and returns to the PDF', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/courses/1')
  await page.getByRole('link', { name: 'Arbeitsplatz öffnen', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Arbeitsansicht' })
    .getByRole('button', { name: 'Schreiben', exact: true })
    .click()
  const drawer = page.locator('.material-side-drawer')
  await expect(drawer).toBeVisible()
  expect(await drawer.evaluate((el) => el.getBoundingClientRect().height)).toBe(844)
  await drawer.getByRole('textbox', { name: 'Notizinhalt', exact: true }).fill('Mitschrift auf dem Handy.')
  await drawer.getByRole('button', { name: 'Markierungen schließen', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(page.locator('.material-reader')).toBeVisible()
})

for (const theme of ['light', 'dark']) {
  test(`course desk and PDF notes fit laptop and phone in ${theme}`, async ({ page }) => {
    const seed = await (await page.request.post('/api/__test__/focus-workspace')).json()
    await page.goto('/settings#appearance')
    await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption(theme)
    await page.goto(`/material/${seed.version_id}?page=12`)
    await expect(page.locator('[data-material-page="12"] canvas').first()).toBeInViewport()
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      await page.goto(`/courses/${seed.course_id}`)
      await expect(page.getByRole('region', { name: 'Dein Schreibtisch', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.screenshot({ path: screenshotPath(`course-desk-${theme}-${width}.png`), fullPage: true })
      await page.getByRole('link', { name: 'Arbeitsplatz öffnen', exact: true }).click()
      if (width === 390) await expect(page.locator('.material-side-drawer')).toBeVisible()
      const body = page.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true })
      await expect(body).toBeVisible()
      if (width !== 390) await expect(page.locator('[data-material-page="12"] canvas').first()).toBeInViewport()
      await body.fill('Die Mitschrift hat Platz für meine eigene Erklärung.\n\nPDF und Notizen bleiben zusammen.')
      expect(await body.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
      expect(await body.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(400)
      if (width !== 390) {
        expect(
          await page.locator('.material-side-inline').evaluate((el) => el.getBoundingClientRect().width),
        ).toBeGreaterThan(400)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.screenshot({ path: screenshotPath(`course-desk-reader-${theme}-${width}.png`) })
      if (width === 390) await page.getByRole('button', { name: 'Markierungen schließen', exact: true }).click()
    }
  })
}
