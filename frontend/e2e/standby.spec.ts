// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
})

test('a second device shows standby and disables every Phase 1 write action', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/system')
  await expect(page.getByText('Auf diesem Gerät nur lesen')).toBeVisible()
  await expect(page.getByText('Dieses Gerät liest nur')).toBeVisible()
  await expect(page.getByText('Halter: Test-Mac')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Moodle aktualisieren' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
  const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
  await palette.getByRole('textbox', { name: 'Befehl suchen' }).fill('aktualisieren')
  await expect(palette.getByRole('button', { name: 'Daten aktualisieren' })).toBeDisabled()
  await palette.getByRole('button', { name: 'Befehlspalette schließen' }).click()
  await expect(page.getByRole('button', { name: 'Jetzt Sicherung erstellen' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Semester anlegen' })).toBeDisabled()
  await expect(page.getByLabel('Semestername')).toBeDisabled()
  const screenshots = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
  await mkdir(screenshots, { recursive: true })
  await page.screenshot({ path: screenshotPath(path.join(screenshots, 'standby-light-1280.png')), fullPage: true })
  await page.setViewportSize({ width: 390, height: 850 })
  await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
  await page.reload()
  await expect(page.getByText('Auf diesem Gerät nur lesen')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: screenshotPath(path.join(screenshots, 'standby-dark-390.png')), fullPage: true })
  const blocked = await page.request.post('http://127.0.0.1:8174/api/semesters', {
    data: { name: 'Gesperrt', starts_at: '2026-10-01T00:00:00Z', ends_at: '2027-03-31T00:00:00Z' },
  })
  expect(blocked.status()).toBe(423)
  expect((await page.request.post('http://127.0.0.1:8174/api/host/snapshot')).status()).toBe(423)
  await page.goto('http://127.0.0.1:4174/courses/1')
  await page.getByText('Kurseinstellungen', { exact: true }).click()
  await expect(page.getByLabel('Semester zuordnen')).toBeDisabled()
  await page.getByText('Kurseinstellungen', { exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Kursansichten' })
    .getByRole('link', { name: /Unterlagen/ })
    .click()
  await expect(page.getByRole('checkbox', { name: 'Material anderer Gruppen herunterladen' })).toBeDisabled()
})
