// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('PDF search finds text on another page and navigates between results', async ({ page }) => {
  await page.goto('/courses/1')
  await page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await page.locator('[data-reader-page="2"]').scrollIntoViewIfNeeded()
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await page.getByRole('button', { name: 'Vorherige Seite' }).click()
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()

  const search = page.getByRole('search')
  await search.getByRole('searchbox', { name: 'Im Dokument suchen' }).fill('Rekursionstiefe')
  await search.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.locator('.material-search-feedback')).toContainText('1 Treffer auf 1 Seiten')
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(page.locator('[data-material-page="2"] .react-pdf__Page__textContent')).toContainText('Rekursionstiefe')

  await search.getByRole('searchbox', { name: 'Im Dokument suchen' }).fill('und')
  await search.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.locator('.material-search-feedback')).toContainText('2 Treffer auf 2 Seiten')
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Fundseite' }).click()
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()

  await search.getByRole('searchbox', { name: 'Im Dokument suchen' }).fill('nicht-vorhanden')
  await search.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.locator('.material-search-feedback')).toContainText('Keine Texttreffer')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
