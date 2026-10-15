// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })))
})

test.afterEach(async ({ page }) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/ai-adapter/disable')
})

test('the disabled adapter shows an explanatory text and no trigger controls', async ({ page }) => {
  await page.goto('/ai')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'KI-Adapter' }) })
  await expect(panel.getByText('Ausgeschaltet.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Vorschläge erstellen' })).toHaveCount(0)
})

test('an enabled adapter with a stub provider queues card proposals for review', async ({ page, request }) => {
  await request.post('http://127.0.0.1:8173/api/__test__/ai-adapter/enable')
  await page.goto('/ai')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'KI-Adapter' }) })
  await expect(panel.getByText(/Diesen Monat verbraucht/)).toBeVisible()
  await panel.getByLabel('Kurs für KI-Vorschläge').selectOption({ label: 'Programmieren 1' })
  await panel.getByLabel('Art der Vorschläge').selectOption('cards')
  await panel.getByRole('button', { name: 'Vorschläge erstellen' }).click()
  const result = panel.getByText(/Vorschl(ag|äge) zur Prüfung in der Warteschlange/)
  await expect(result).toBeVisible()
  await expect(result).toContainText('Tokens')
  await expect(panel.getByText(/noch geprüft werden/)).toBeVisible()
  await panel.getByRole('link', { name: 'Zur Karten-Warteschlange →' }).click()
  await expect(page).toHaveURL(/\/anki$/)
})

test('an enabled adapter can also propose exercises and link to the exercise queue', async ({ page, request }) => {
  await request.post('http://127.0.0.1:8173/api/__test__/ai-adapter/enable')
  await page.goto('/ai')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'KI-Adapter' }) })
  await panel.getByLabel('Kurs für KI-Vorschläge').selectOption({ label: 'Programmieren 1' })
  await panel.getByLabel('Art der Vorschläge').selectOption('exercises')
  await panel.getByRole('button', { name: 'Vorschläge erstellen' }).click()
  await expect(panel.getByText(/Vorschl(ag|äge) zur Prüfung in der Warteschlange/)).toBeVisible()
  await panel.getByRole('link', { name: 'Zur Übungs-Warteschlange →' }).click()
  await expect(page).toHaveURL(/\/exercises$/)
})
