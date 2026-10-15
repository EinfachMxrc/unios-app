// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('palette reopens a recently read note and supports clearing this window history', async ({ page }, info) => {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Vorlesung zur Rekursion', body: 'Ein Basisfall beendet die Rekursion.' },
  })
  expect(response.ok()).toBeTruthy()
  const id = (await response.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await expect(page.locator('.rendered-note')).toContainText('Basisfall')
  await page.locator('.app-nav a[href="/courses"]').click()
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
  await page.keyboard.press('Control+k')
  const recent = page.getByRole('region', { name: 'Zuletzt geöffnet' })
  await expect(recent.getByRole('button', { name: 'Vorlesung zur Rekursion', exact: true })).toBeVisible()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      localStorage.setItem('unios-theme', value)
      dispatchEvent(new StorageEvent('storage', { key: 'unios-theme' }))
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`recent-${theme}-${width}.png`), animations: 'disabled' })
    }
  }
  await recent.getByRole('button', { name: 'Vorlesung zur Rekursion', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/notes\\?id=${id}`))
  await page.keyboard.press('Control+k')
  await page.getByRole('button', { name: 'Verlauf leeren', exact: true }).click()
  await expect(recent).toHaveCount(0)
})

test('Ctrl arrows navigate history while text fields retain their editing shortcuts', async ({ page }) => {
  await page.goto('/')
  await page.locator('.app-nav a[href="/courses"]').click()
  await expect(page).toHaveURL(/\/courses$/)
  await page.locator('main h1').focus()
  await page.keyboard.press('Control+ArrowLeft')
  await expect(page).toHaveURL(/\/$/)
  await page.locator('main h1').focus()
  await page.keyboard.press('Control+ArrowRight')
  await expect(page).toHaveURL(/\/courses$/)
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Befehl suchen' }).fill('Programmieren')
  await page.keyboard.press('Control+ArrowLeft')
  await expect(page).toHaveURL(/\/courses$/)
  await expect(page.getByRole('textbox', { name: 'Befehl suchen' })).toHaveValue('Programmieren')
})

test('recent PDF preserves its last page and disappears when its module is disabled', async ({ page }) => {
  const fixture = await page.request.get('/api/__test__/long-reader.pdf?pages=3')
  const pdf = await fixture.body()
  await page.route('**/files/*/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
  await page.goto('/courses/1')
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 3')
  await page.locator('.app-nav a[href="/courses"]').click()
  await page.keyboard.press('Control+k')
  const recent = page.getByRole('region', { name: 'Zuletzt geöffnet' })
  await recent.getByRole('button', { name: '04_Schleifen.pdf', exact: true }).click()
  await expect(page).toHaveURL(/\/material\/\d+\?page=2$/)
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 3')
  await page.locator('.app-sidebar a[href="/settings"]').click()
  await page.getByRole('switch', { name: 'Kurse', exact: true }).click()
  await page.keyboard.press('Control+k')
  await expect(recent.getByRole('button', { name: '04_Schleifen.pdf', exact: true })).toHaveCount(0)
})
