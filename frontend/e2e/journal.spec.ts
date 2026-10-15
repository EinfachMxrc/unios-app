// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('Studientag zeigt Daten und speichert die eigene Tagesnotiz', async ({ page }) => {
  await page.goto('/journal/2026-09-26')
  await expect(page.getByRole('heading', { name: 'Kursnotiz (optional)', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Neue Materialien' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Freiwilligen Kurseintrag hinzufügen' }).selectOption('1')
  await page.getByText('Eintrag ergänzen', { exact: true }).click()
  await page.locator('#covered-1').fill('Sortieren wiederholen')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByText('Eintrag lesen oder bearbeiten')).toBeVisible()

  const reflection = page.getByRole('textbox', { name: 'Meine Tagesnotiz' })
  await reflection.fill('Sortieren am Beispiel wiederholen.')
  await page.getByRole('button', { name: 'Tagesnotiz speichern' }).click()
  await expect(page.getByRole('button', { name: 'Tagesnotiz speichern' })).toBeDisabled()
  await page.reload()
  await expect(reflection).toHaveValue('Sortieren am Beispiel wiederholen.')
  await page.getByRole('link', { name: 'Vorheriger Tag' }).click()
  await expect(page.getByRole('textbox', { name: 'Meine Tagesnotiz' })).toHaveValue('')
})
