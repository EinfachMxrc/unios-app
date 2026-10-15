// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
})

test('planned handoff refuses incomplete Syncthing and then leaves the old host read only', async ({ page }) => {
  const backend = 'http://127.0.0.1:8178'
  const syncthing = 'http://127.0.0.1:8177'
  await page.goto('http://127.0.0.1:4178/system')
  await expect(page.getByText('Dieses Gerät schreibt')).toBeVisible()
  await page.request.post(`${syncthing}/__test__/folder-state`, { data: { need_files: 1 } })
  await page.getByRole('button', { name: 'Übergabe vorbereiten' }).click()
  const dialog = page.getByRole('dialog', { name: 'Staffelstab freigeben?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Staffelstab freigeben' }).click()
  await expect(dialog.getByRole('alert')).toContainText('nicht vollständig')
  expect((await (await page.request.get(`${backend}/api/host`)).json()).mode).toBe('host')

  await page.request.post(`${syncthing}/__test__/folder-state`, { data: { need_files: 0 } })
  await dialog.getByRole('button', { name: 'Staffelstab freigeben' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Hauptgerät wechselt · nur lesen')).toBeVisible()
  await expect(page.getByText(/Alter: \d+ Minuten · Generation 2/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Übergabe vorbereiten' })).toBeDisabled()
  const host = await (await page.request.get(`${backend}/api/host`)).json()
  expect(host.mode).toBe('released')
  expect(host.generation).toBe(2)
  expect(host.released_at).toBeTruthy()
  expect((await page.request.post(`${backend}/api/host/snapshot`)).status()).toBe(423)

  const screenshots = path.resolve(import.meta.dirname, '../test-results/screenshots/phase2')
  await mkdir(screenshots, { recursive: true })
  await page.screenshot({ path: screenshotPath(path.join(screenshots, 'handoff-released-light-1280.png')), fullPage: true })
  await page.setViewportSize({ width: 390, height: 850 })
  await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
  await page.reload()
  await expect(page.getByText('Hauptgerät wechselt · nur lesen')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: screenshotPath(path.join(screenshots, 'handoff-released-dark-390.png')), fullPage: true })
})
