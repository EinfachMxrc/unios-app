// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('host preferences save without restart and remain readable on mobile', async ({ page }) => {
  await page.goto('/settings#reminders')
  await page.getByText('Details: Sync und Sicherung', { exact:true }).click()
  const interval = page.getByLabel('Synchronisation alle Minuten')
  await expect(interval).toHaveValue('60')
  await interval.fill('30')
  await page.getByLabel('Fristwarnung (Tage vorher)').fill('7, 2')
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click()
  await expect(page.getByRole('status')).toContainText('aktiv')
  await interval.fill('31')
  await expect(page.getByRole('status').filter({ hasText: 'aktiv' })).toHaveCount(0)
  await page.reload()
  await page.getByText('Details: Sync und Sicherung', { exact:true }).click()
  await expect(page.getByLabel('Synchronisation alle Minuten')).toHaveValue('30')
  await expect(page.getByLabel('Fristwarnung (Tage vorher)')).toHaveValue('7, 2')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
