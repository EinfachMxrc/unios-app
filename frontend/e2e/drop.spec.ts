// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('own file is assigned to a course section and becomes searchable', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('link', { name: 'Eigene Dateien' }).click()
  await expect(page.getByText('Eigene_Frage.txt')).toBeVisible()
  await page.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  const section = page.getByRole('combobox', { name: 'Abschnitt' })
  await expect(section).toBeEnabled()
  const firstSection = await section.locator('option').nth(1).getAttribute('value')
  expect(firstSection).toBeTruthy()
  await section.selectOption(firstSection!)
  await page.getByRole('button', { name: 'Zuordnen' }).click()
  await expect(page.getByRole('status').getByRole('link', { name: 'Eigene_Frage.txt' })).toBeVisible()
  await page.getByRole('status').getByRole('link', { name: 'Eigene_Frage.txt' }).click()
  await expect(page.locator('.resource-row').filter({ hasText: 'Eigene_Frage.txt' })).toBeVisible()

  const original = await page.locator('.resource-row').filter({ hasText: 'Eigene_Frage.txt' })
    .getByRole('link', { name: 'Herunterladen', exact: true }).getAttribute('href')
  await page.locator('.resource-row').filter({ hasText: 'Eigene_Frage.txt' })
    .getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page.getByText('Seite 1 von 1')).toBeVisible()
  await expect(page.locator('.react-pdf__Page__textContent')).toContainText('Warum ist eine Testmatrix invertierbar?')
  const download = await page.request.get(original!)
  expect(await download.text()).toBe('Warum ist eine Testmatrix invertierbar?')
  await page.screenshot({ path: screenshotPath('../.tmp/txt-reader-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.react-pdf__Page__textContent')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: screenshotPath('../.tmp/txt-reader-mobile.png') })

  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Testmatrix')
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('link', { name: /Eigene_Frage.txt/ })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
