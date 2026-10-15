// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('reader rebuilds the index through its registered and confirmed action', async ({ page }) => {
  await page.goto('/courses/1')
  await page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' }).click()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await page.locator('.reader-connections > summary').click()
  const actions = page.getByRole('region', { name: 'Textindex', exact: true })
  await actions.locator('summary').click()
  await actions.getByRole('button', { name: 'Textindex erneuern' }).click()
  await expect(actions.getByRole('button', { name: 'Bestätigen', exact: true })).toBeVisible()
  const posted = page.waitForResponse((response) => response.url().endsWith('/actions/resource.reextract')
    && response.request().method() === 'POST')
  await actions.getByRole('button', { name: 'Bestätigen', exact: true }).click()
  expect((await posted).status()).toBe(200)
  await expect(actions.getByText('Textindex aktualisiert.', { exact: true })).toBeVisible()
})
