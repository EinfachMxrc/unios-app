// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('a document date reaches the calendar only after review', async ({ page }) => {
  const created = await page.request.post('/api/__test__/document-date-proposal')
  expect(created.ok()).toBeTruthy()
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  await expect(page.getByText('Terminvorschlag prüfen')).toBeVisible()
  await expect(page.getByText(/Anmeldefrist bis zum/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quelle: Seite/Folie 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Kalender aktualisieren' }).click()
  await expect(page.getByText('Terminvorschlag prüfen')).toHaveCount(0)
  await expect(page.locator('.deadline-table-row').getByText('04_Schleifen: Frist', { exact: true })).toBeVisible()
  await expect(page.locator('.deadline-table-row').filter({ hasText: '04_Schleifen: Frist' })
    .getByRole('link', { name: 'Quelle' })).toHaveAttribute('href', /\/material\/\d+\?page=2/)
})
