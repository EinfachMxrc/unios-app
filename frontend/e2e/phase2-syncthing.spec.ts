// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
})

test('Syncthing folder status is visible and blocks an incomplete folder', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/system')
  try {
    const completeResponse = page.waitForResponse((response) => response.url().endsWith('/api/doctor'))
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    const complete = await completeResponse
    const completeBody = await complete.text()
    expect(completeBody).not.toContain('fixture-syncthing-key')
    await expect(page.getByText('Syncthing-Ordner und Tailscale-Bindung sind passend eingestellt')).toBeVisible()
    await expect(page.getByText('Syncthing meldet den lokalen Ordner vollständig synchron')).toBeVisible()

    const changed = await page.request.post('http://127.0.0.1:8177/__test__/folder-state', {
      data: { need_files: 1 },
    })
    expect(changed.ok()).toBeTruthy()
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    await expect(page.getByText('Syncthing-Ordner ist noch nicht vollständig synchron')).toBeVisible()
    await expect(page.getByText('Mehrgeräte-Übernahme: noch nicht eingerichtet')).toBeVisible()

    const conflict = await page.request.post('http://127.0.0.1:8173/api/__test__/syncthing-conflict?present=true')
    expect(conflict.ok()).toBeTruthy()
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    await expect(page.getByText('Syncthing-Konfliktdatei gefunden; Datenstand manuell prüfen')).toBeVisible()
    const screenshots = path.resolve(import.meta.dirname, '../test-results/screenshots/phase2')
    await mkdir(screenshots, { recursive: true })
    await page.screenshot({
      path: screenshotPath(path.join(screenshots, 'syncthing-conflict-light-1280.png')),
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 850 })
    await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
    await page.reload()
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    await expect(page.getByText('Syncthing-Konfliktdatei gefunden; Datenstand manuell prüfen')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({
      path: screenshotPath(path.join(screenshots, 'syncthing-conflict-dark-390.png')),
      fullPage: true,
    })
  } finally {
    await page.request.post('http://127.0.0.1:8177/__test__/folder-state', {
      data: { need_files: 0 },
    })
    const restored = await page.request.get('http://127.0.0.1:8173/__test__/syncthing-conflict-reset')
    expect(restored.ok()).toBeTruthy()
    expect(await restored.json()).toMatchObject({ restored: true, is_writer: true })
  }
})
