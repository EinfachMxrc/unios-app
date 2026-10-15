// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
})

test('disabled Moodle remains readable and cannot start a sync', async ({ page }) => {
  await page.goto('http://127.0.0.1:8176/')
  // Existing courses remain useful when Moodle is paused; no empty-collection welcome.
  await expect(page.locator('.today-workspace')).toBeVisible()
  await expect(page.locator('.welcome-panel')).toHaveCount(0)
  await page.goto('http://127.0.0.1:8176/courses')
  // Scoped to main: the sidebar's own "Aktuelle Kurse" list (populated once
  // /api/courses resolves) also renders a "Programmieren 1" link, and an
  // unscoped match against both is a race depending on when that fetch settles.
  await expect(page.getByRole('main').getByRole('link', { name: /Programmieren 1/ })).toBeVisible()
  await page.goto('http://127.0.0.1:8176/system')
  await expect(page.getByRole('button', { name: 'Moodle aktualisieren' })).toHaveCount(0)
  await expect(page.getByText('Moodle-Verbindung deaktiviert')).toBeVisible()
  await expect(page.getByText('Pausiert')).toBeVisible()
  await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
  const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
  await palette.getByRole('textbox', { name: 'Befehl suchen' }).fill('aktualisieren')
  await expect(palette.getByRole('button', { name: 'Daten aktualisieren' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Gerät prüfen' }).click()
  await expect(page.getByText('Moodle-Verbindung deaktiviert')).toHaveCount(1)
  await expect(page.getByText('Moodle-Connector deaktiviert')).toHaveCount(1)
  const blocked = await page.request.post('http://127.0.0.1:8176/api/sync')
  expect(blocked.status()).toBe(409)
  await page.setViewportSize({ width: 390, height: 850 })
  await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
  await page.reload()
  await expect(page.getByText('Moodle-Verbindung deaktiviert')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const screenshots = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
  await mkdir(screenshots, { recursive: true })
  await page.screenshot({ path: screenshotPath(path.join(screenshots, 'moodle-disabled-dark-390.png')), fullPage: true })
})
