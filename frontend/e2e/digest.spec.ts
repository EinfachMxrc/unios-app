// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('weekly recap opens and Sunday message can be turned off', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('link', { name: 'Wochenüberblick' }).click()
  await expect(page.getByRole('heading', { name: 'Wochenüberblick' })).toBeVisible()
  await expect(page.getByText('Neue Unterlagen', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Nächste Fristen', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Offene Zuordnungen')).toBeVisible()

  await page.goto('/settings#reminders')
  const toggle = page.getByRole('switch', { name: 'Sonntags-Rückblick' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  let releaseSave = () => {}
  const waitForSave = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  await page.route('**/api/digest/preference', async (route) => {
    if (route.request().method() === 'PATCH') await waitForSave
    await route.continue()
  })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Einstellung wird gespeichert' })).toBeVisible()
  releaseSave()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('status').filter({ hasText: 'Sonntags-Rückblick ausgeschaltet.' })).toBeVisible()
  await page.goto('/digest')
  await expect(page.getByText('Sonntagsnachricht ist ausgeschaltet', { exact: false })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await page.goto('/settings#reminders')
  await page.getByRole('switch', { name: 'Sonntags-Rückblick' }).click()
  await expect(page.getByRole('switch', { name: 'Sonntags-Rückblick' })).toHaveAttribute('aria-checked', 'true')
})
