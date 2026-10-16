// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import { insertFromMenu } from './noteEditor'
import { mkdir } from 'node:fs/promises'

test('fixed cells keep following columns and rows still, with Tab, math and saved edits', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Raster · Test', body: 'Vorher' },
  })
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notizinhalt', exact: true }).press('ControlOrMeta+End')
  await insertFromMenu(page, page, 'Rechenraster')
  const dialog = page.getByRole('dialog', { name: 'Rechenraster', exact: true })
  await expect(dialog.getByRole('textbox', { name: 'Zeile 1, Spalte 1', exact: true })).toBeFocused()
  await page.keyboard.type('2^5')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('textbox', { name: 'Zeile 2, Spalte 1', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Enter')
  await expect(dialog.getByRole('textbox', { name: 'Zeile 1, Spalte 1', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('textbox', { name: 'Zeile 1, Spalte 2', exact: true })).toBeFocused()
  await page.keyboard.type('(-9)10')
  await page.keyboard.press('Tab')
  await page.keyboard.type('(10111)2')
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('textbox', { name: 'Zeile 1, Spalte 2', exact: true })).toBeFocused()
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
  const following = await dialog.getByRole('cell').nth(2).boundingBox()
  const nextRow = await dialog.getByRole('cell').nth(3).boundingBox()
  const middle = dialog.getByRole('textbox', { name: 'Zeile 1, Spalte 2', exact: true })
  await middle.press('Home')
  await middle.pressSequentially('Längerer Zusatz: ')
  expect(await dialog.getByRole('cell').nth(2).boundingBox()).toEqual(following)
  expect(await dialog.getByRole('cell').nth(3).boundingBox()).toEqual(nextRow)
  await dialog.getByRole('textbox', { name: 'Zeile 4, Spalte 3', exact: true }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.type('Nächste Zeile')
  await expect(dialog.getByRole('textbox', { name: 'Zeile 5, Spalte 1', exact: true })).toHaveValue('Nächste Zeile')
  await dialog.getByRole('button', { name: 'Raster übernehmen', exact: true }).click()
  const first = page.getByRole('textbox', { name: 'Zeile 1, Spalte 1', exact: true })
  await first.fill('2^15')
  await first.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Zeile 1, Spalte 2', exact: true })).toBeFocused()
  await expect(page.locator('.writing-grid .katex annotation').first()).toHaveText('2^{15}')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.reload()
  await expect(page.locator('.writing-grid [role=row]')).toHaveCount(5)
  await expect(page.locator('.writing-grid')).toContainText('Längerer Zusatz:')
  await expect(page.locator('.writing-grid .katex annotation').first()).toHaveText('2^{15}')
  await expect(page.locator('.rendered-note')).toContainText('Vorher')
  await mkdir('/tmp/unios-writing-grid-20261014', { recursive: true })
  await page.screenshot({ path: screenshotPath('/tmp/unios-writing-grid-20261014/desktop.png'), fullPage: true })
})
