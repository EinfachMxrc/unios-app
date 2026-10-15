// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('quiet home shows next steps, new material, and five navigation choices', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
  await expect(page.getByText('Als Nächstes', { exact: true })).toBeVisible()
  await expect(page.getByText('Zuletzt passiert', { exact: true })).toBeVisible()
  await expect(page.locator('.today-primary-action')).toBeVisible()
  await expect(page.getByText(/Neue Datei: 04_Schleifen\.pdf/)).toBeVisible()
  await expect(page.locator('.metric-grid')).toHaveCount(0)
  await expect(page.getByText('Anki fällig')).toHaveCount(0)
  // Simple mode keeps the five primary study destinations in the workspace.
  await expect(page.locator('.sidebar-group').filter({ hasText: 'Arbeitsbereich' }).getByRole('link')).toHaveCount(5)
  expect(await page.locator('main').innerText()).not.toMatch(
    /\b(?:Lease|Sicherung|Hash|Generation|Connector|Sidecar|MCP|Token)\b/i,
  )
  await page.getByRole('button', { name: 'Schnellnotizen …' }).click()
  await expect(page.getByRole('textbox', { name: 'Schnell erfassen' })).toBeVisible()
  await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
  const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
  await expect(palette).toBeVisible()
  await palette.getByRole('textbox', { name: 'Befehl suchen' }).fill('Schleifen')
  await palette.getByRole('textbox', { name: 'Befehl suchen' }).press('Enter')
  await expect(page).toHaveURL(/\/search\?q=Schleifen$/)
  await page.goto('/')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link')).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  // Below 900px the header's own "Mehr" shortcut (.more-top-link) also becomes
  // visible alongside the bottom Mobile Navigation's "Mehr" link, so an
  // unscoped match is ambiguous — use the bottom nav's, which is what this
  // test is actually exercising.
  await page.locator('.more-top-link').click()
  await expect(page.getByRole('heading', { name: 'Mehr', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Aktivitätsverlauf' })).toBeVisible()
})
