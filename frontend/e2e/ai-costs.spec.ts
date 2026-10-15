// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('the cost calculator shows a local estimate and reacts to locked material', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })))
  await page.goto('/more')
  await page.locator('.more-tools > summary').click()
  await page.getByRole('link', { name: 'KI-Paket' }).click()
  const panel = page.locator('.data-row').filter({ hasText: 'Claude' }).first()
  await expect(panel).toContainText('Einmalig (aktueller Bestand)')
  await expect(panel).toContainText('älter als 90 Tage')

  await page.request.put('/api/ai/access/category/course_material', { data: { allowed: false } })
  await page.reload()
  const lockedPanel = page.locator('.data-row').filter({ hasText: 'Claude' }).first()
  await expect(lockedPanel).toContainText('Einmalig (aktueller Bestand): 0,00 €')
  await page.request.put('/api/ai/access/category/course_material', { data: { allowed: true } })
})
