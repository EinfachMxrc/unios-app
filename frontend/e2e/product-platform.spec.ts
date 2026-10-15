// SPDX-License-Identifier: AGPL-3.0-or-later

import path from 'node:path'
import { expect, test } from './fixtures'

test('WASM-Paket wird erst nach Freigabe ausgeführt', async ({ page }) => {
  await page.goto('/addons')
  await page
    .locator('input[type=file]')
    .setInputFiles(path.resolve(import.meta.dirname, '../../examples/addons/isolated-tool.unios-addon.json'))
  await expect(page.getByRole('status')).toContainText('Manifest')
  const row = page.locator('.addon-catalog-card').filter({ hasText: 'Isoliertes Beispiel' })
  await row.getByRole('button', { name: 'Installieren', exact: true }).click()
  await row.getByRole('button', { name: 'Rechte freigeben', exact: true }).click()
  await row.getByRole('button', { name: 'Aktivieren', exact: true }).click()
  await page.goto('/addons/org.example.isolated-tool')
  await page.getByRole('button', { name: 'Werkzeug ausführen' }).click()
  await expect(page.getByRole('status')).toContainText('WASM bereit')
})

test('Auftragsseite erstellt eine geprüfte Sicherung im Hintergrund', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/jobs')
  await page.getByRole('button', { name: 'Auftrag starten' }).click()
  await expect(page.locator('main article').first()).toContainText('Fertig')
  const rows = await (await page.request.get('/api/jobs')).json()
  expect(rows[0].kind).toBe('backup')
  expect(rows[0].state).toBe('completed')
  expect(rows[0].completed).toBe(1)
})

test('Katalog zeigt reale Profile und Rechte ohne Python-Code freizugeben', async ({ page }) => {
  await page.goto('/marketplace')
  await page.getByRole('searchbox', { name: 'Katalog durchsuchen' }).fill('Hochschule Coburg')
  await expect(page.getByRole('heading', { name: 'Hochschule Coburg' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Katalog durchsuchen' }).fill('')
  await page.getByText('Rechte und Paketdetails', { exact: true }).click()
  await expect(page.getByText('courses.read', { exact: true })).toBeVisible()
  await expect(page.getByText(/Referenz für Entwickler/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Installieren', exact: true })).toHaveCount(0)
})

test('Schrift, Kontrast, Tastatur und reduzierte Bewegung bleiben erhalten', async ({ page }) => {
  await page.goto('/settings#appearance')
  await page.getByRole('combobox', { name: 'Schriftgröße' }).selectOption('150')
  await page.getByRole('switch', { name: 'Hoher Kontrast', exact: true }).click()
  await page.getByRole('switch', { name: 'Bewegung reduzieren', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
  await expect(page.getByRole('combobox', { name: 'Schriftgröße' })).toHaveValue('150')
  await page.goto('/marketplace')
  await expect(page.getByRole('heading', { name: 'Verbindungskatalog', exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await page.setViewportSize({ width: 650, height: 600 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await page.screenshot({ path: test.info().outputPath(`accessibility-200-${theme}.png`), fullPage: true })
  }
})

test('neue Hauptansichten passen auf Desktop und Mobilgerät in beiden Designs', async ({ page }, info) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/')
    await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 850 })
      for (const route of ['notifications', 'jobs', 'marketplace', 'activity', 'addons']) {
        await page.goto(`/${route}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.locator('[data-slot=skeleton]')).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.screenshot({ path: info.outputPath(`${route}-${theme}-${width}.png`), fullPage: true })
      }
    }
  }
})
