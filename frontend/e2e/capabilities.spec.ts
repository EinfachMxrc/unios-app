// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('system explains optional integrations without hiding the core', async ({ page }) => {
  await page.goto('/system')
  await expect(page.getByRole('heading', { name: 'Verbindungen und Extras' })).toBeVisible()
  await expect(page.locator('.capability-row').filter({ hasText: 'Studienraum' })).toContainText('Bereit')
  await expect(page.locator('.capability-row').filter({ hasText: 'Moodle' })).toBeVisible()
  await expect(page.locator('.capability-row').filter({ hasText: 'Anki' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
