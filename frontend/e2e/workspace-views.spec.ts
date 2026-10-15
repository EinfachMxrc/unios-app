// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('deadline views share the same records and palette opens an exact PDF page', async ({ page }) => {
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  const views = page.locator('.view-switch[aria-label="Fristenansicht"]')
  await expect(page.getByRole('button', { name: 'Tabelle' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Board' }).click()
  await expect(page.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Zeitleiste' }).click()
  await expect(page.getByRole('button', { name: 'Zeitleiste' })).toHaveAttribute('aria-pressed', 'true')
  await views.getByRole('button', { name: 'Kalender', exact: true }).click()
  await expect(views.getByRole('button', { name: 'Kalender', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Befehl suchen' }).fill('Rekursionstiefe')
  const hit = page.getByRole('button', { name: /04_Schleifen.pdf.*Folie\/Seite 2/ })
  await expect(hit).toBeVisible()
  await hit.click()
  await expect(page).toHaveURL(/\/material\/\d+\?page=2/)
  await expect(page.locator('[data-material-page="2"]')).toBeVisible()
})

test('study time budget shows its calculation from entered hours', async ({ page }) => {
  const created = await page.request.post('/api/__test__/budget-deadline')
  expect(created.ok()).toBeTruthy()
  await page.goto('/learning')
  await page.getByRole('combobox', { name: 'Frist' }).selectOption(String((await created.json()).id))
  await page.getByRole('spinbutton', { name: 'Freie Lernstunden pro Woche' }).fill('14')
  await page.getByRole('spinbutton', { name: 'Geschätzter Aufwand für diese Aufgabe' }).fill('4')
  await expect(page.getByText(/14 Stunden\/Woche ×/)).toBeVisible()
  await expect(page.getByText(/Stunden Puffer|Stunden fehlen/)).toBeVisible()
})
