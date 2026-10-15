// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('strukturierte Suche findet die tatsächliche PDF-Seite', async ({ page }) => {
  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Rekursionstiefe course:"Programmieren 1" type:document')
  await page.getByRole('button', { name: 'Suchen', exact: true }).click()
  const result = page.locator('.search-result').filter({ hasText: '04_Schleifen.pdf' })
  await expect(result).toContainText('Seite/Folie 2')
  await expect(result).toContainText('Rekursionstiefe')
})

test('Palette nutzt Registry und Texttasten bleiben im Eingabefeld', async ({ page }) => {
  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('n/jk')
  await expect(page).toHaveURL(/\/search/)
  await page.getByRole('heading', { name: 'Suche', exact: true }).click()
  await page.keyboard.press('/')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Objektaktionen' })).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Objekttyp', exact: true }).selectOption('assignment')
  await dialog.getByRole('combobox', { name: 'Objekt wählen', exact: true }).selectOption({ index: 1 })
  await dialog.getByRole('combobox', { name: 'Objektaktionen', exact: true }).selectOption('assignment.submission_status')
  await dialog.getByRole('button', { name: 'Ausführen', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Aktion ausgeführt')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/notes\?new=1/)
})

test('Notiz rückgängig erstellt eine neue Fassung', async ({ page }) => {
  await page.goto('/notes')
  const created = await page.request.post('/api/notes', { data: { course_id: 1, title: 'Undo-Beispiel', body: 'Erste Fassung' } })
  expect(created.ok()).toBe(true)
  const note = (await created.json()).note
  const changed = await page.request.put(`/api/notes/${note.id}`, { data: { expected_revision: 1, title: 'Undo-Beispiel', body: 'Zweite Fassung' } })
  expect(changed.ok()).toBe(true)
  await page.goto(`/notes?id=${note.id}`)
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(page.locator('.notes-layout')).toContainText('Erste Fassung')
  const restored = await page.request.get(`/api/notes/${note.id}`)
  expect((await restored.json()).note.current_revision).toBe(3)
})

test('Meldungen lassen sich lesen und je Kurs stummschalten', async ({ page }) => {
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Gespeicherte Meldungen aktualisieren' }).click()
  await expect(page.getByRole('button', { name: 'Als gelesen markieren' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Als gelesen markieren' }).first().click()
  await page.getByRole('combobox', { name: 'Anzeige' }).selectOption('all')
  await expect(page.getByRole('button', { name: 'Als ungelesen markieren' }).first()).toBeVisible()
  await page.getByText('Kurse stummschalten', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Programmieren 1', exact: true }).check()
  await page.getByRole('combobox', { name: 'Anzeige' }).selectOption('muted')
  await expect(page.locator('main article').filter({ hasText: '04_Schleifen.pdf' })).toBeVisible()
})
