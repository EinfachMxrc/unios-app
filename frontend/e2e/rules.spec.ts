// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('Regel zeigt Vorschau, pinnt einen Treffer und lässt ihn entfernen', async ({ page }) => {
  await page.request.post('/api/__test__/upcoming-assignment')
  await page.goto('/rules')
  await page.getByRole('textbox', { name: 'Name' }).fill('Fristen im Blick')
  await page.getByRole('combobox', { name: 'Auslöser' }).selectOption('deadline_soon')
  await page.getByRole('button', { name: 'Trockenen Lauf ansehen' }).click()
  await expect(page.getByRole('heading', { name: 'Vorschau' })).toBeVisible()
  await expect(page.locator('.rules-preview')).toContainText('Schleifen üben')
  await page.getByRole('button', { name: 'Regel speichern' }).click()
  await expect(page.getByRole('status')).toContainText('Regel gespeichert')
  await page.getByRole('button', { name: 'Jetzt ausführen' }).click()
  await expect(page.getByRole('status')).toContainText('1 neue Treffer verarbeitet')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Von deinen Regeln' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Schleifen üben' })).toBeVisible()
  await page.goto('/rules')
  await page.getByRole('button', { name: 'Pin entfernen' }).click()
  await expect(page.getByText('Pin entfernt')).toBeVisible()
  await page.screenshot({ path: screenshotPath('test-results/rules-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('test-results/rules-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})
