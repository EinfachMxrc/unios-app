// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('gespeicherte Sammlung behält Filter und Ansicht', async ({ page }) => {
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: 'Eine Frage an deine Studieninhalte.' })).toBeVisible()
  await page.getByRole('button', { name: 'Neue Sammlung' }).click()
  await page.getByRole('combobox', { name: /^Inhalte/ }).selectOption('materials')
  await page.getByRole('button', { name: 'Tabelle' }).click()
  await page.getByRole('button', { name: 'Ergebnisse anzeigen' }).click()
  await expect(page.locator('.collection-table')).toBeVisible()
  await page.getByRole('textbox', { name: 'Name der Ansicht' }).fill('Meine Fristen')
  await page.getByRole('button', { name: 'Ansicht speichern' }).click()
  await expect(page.locator('.collections-message')).toContainText('Ansicht gespeichert')
  await page.reload()
  await page.getByText('Filter und Ansicht anpassen').click()
  await expect(page.getByRole('textbox', { name: 'Name der Ansicht' })).toHaveValue('Meine Fristen')
  await expect(page.getByRole('button', { name: 'Tabelle' })).toHaveClass(/active/)
  await page.screenshot({ path: screenshotPath('test-results/collections-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('test-results/collections-mobile.png'), fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('gemischte Ansicht speichert ODER-Filter und Gruppierung', async ({ page }) => {
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Neue Sammlung' }).click()
  await page.getByRole('combobox', { name: /^Inhalte/ }).selectOption('all')
  await page.getByLabel('Gruppieren nach').selectOption('kind')
  await page.getByText('ODER-Bedingungen (0)').click()
  await page.getByRole('button', { name: '+ ODER-Bedingung' }).click()
  await page.getByRole('button', { name: '+ ODER-Bedingung' }).click()
  await page.locator('.collection-or-row').nth(0).getByLabel('Inhalt').selectOption('materials')
  await page.locator('.collection-or-row').nth(1).getByLabel('Inhalt').selectOption('deadlines')
  await page.getByRole('button', { name: 'Ergebnisse anzeigen' }).click()
  await page.getByRole('textbox', { name: 'Name der Ansicht' }).fill('Unterlagen und Fristen')
  await page.getByRole('button', { name: 'Ansicht speichern' }).click()
  await expect(page.locator('.collections-message')).toContainText('Ansicht gespeichert')
  await page.reload()
  await page.getByText('Filter und Ansicht anpassen').click()
  await expect(page.getByRole('combobox', { name: /^Inhalte/ })).toHaveValue('all')
  await expect(page.getByLabel('Gruppieren nach')).toHaveValue('kind')
  await expect(page.locator('.collection-or-row')).toHaveCount(2)
})

test('sichtbare Spalten und Reihenfolge bleiben nach Neustart erhalten', async ({ page }) => {
  await page.goto('/collections')
  await page.getByRole('button', { name: 'Neue Sammlung' }).click()
  await page.getByRole('combobox', { name: /^Inhalte/ }).selectOption('materials')
  await page.getByRole('button', { name: 'Tabelle', exact: true }).click()
  await page
    .getByRole('group', { name: 'Sichtbare Felder' })
    .getByRole('checkbox', { name: 'Kurs', exact: true })
    .uncheck()
  await page.getByLabel('Reihenfolge', { exact: true }).selectOption('desc')
  await page.getByRole('textbox', { name: 'Name der Ansicht' }).fill('Meine Spalten')
  await page.getByRole('button', { name: 'Ansicht speichern' }).click()
  await expect(page.locator('.collections-message')).toContainText('Ansicht gespeichert')
  await expect(page.locator('.collection-table').getByRole('columnheader', { name: 'Kurs', exact: true })).toHaveCount(
    0,
  )
  await page.reload()
  await page.getByText('Filter und Ansicht anpassen').click()
  await expect(page.getByLabel('Reihenfolge', { exact: true })).toHaveValue('desc')
  await expect(
    page.getByRole('group', { name: 'Sichtbare Felder' }).getByRole('checkbox', { name: 'Kurs', exact: true }),
  ).not.toBeChecked()
})
