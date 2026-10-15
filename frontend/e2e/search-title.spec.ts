// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('material title absent from its text is searchable and opens the reader', async ({ page }) => {
  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('04_Schleifen.pdf')
  await page.getByRole('button', { name: 'Suchen', exact: true }).click()
  const result = page.locator('.search-result').getByRole('link', { name: '04_Schleifen.pdf', exact: true })
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(/\/material\/\d+\?page=1$/)
  await expect(page.locator('canvas').first()).toBeVisible()
})
