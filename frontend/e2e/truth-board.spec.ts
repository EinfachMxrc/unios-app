// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const expression = '!x1*!x2*!x3 + !x1*x2*!x3 + x1*!x2*!x3'
async function open(page: Page) {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Tafelansicht · Test', body: 'Vorlesung' },
  })
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notizinhalt', exact: true }).focus()
  await page.getByRole('button', { name: 'Wahrheitstabelle', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Wahrheitstabelle', exact: true })
  await dialog.getByRole('textbox', { name: 'Logischer Ausdruck' }).fill(expression)
  return { dialog, id }
}

test('board minterms and mathematical notation survive insertion and reload', async ({ page }) => {
  const { dialog, id } = await open(page)
  await expect(dialog.locator('.truth-board-table tbody tr')).toHaveCount(8)
  await expect(dialog.locator('.truth-row-one')).toHaveCount(3)
  await expect(dialog.locator('.truth-board-sum .truth-sum-term')).toHaveCount(3)
  await expect(dialog.locator('.truth-board-table th')).toHaveCount(5)
  await expect(dialog.locator('.truth-board-table th').last()).toHaveText('Y')
  await expect(dialog.locator('.truth-board-table .overline-line').first()).toBeVisible()
  await dialog.getByRole('checkbox', { name: 'Ergebnisse zeigen' }).uncheck()
  await expect(dialog.locator('.truth-row-one')).toHaveCount(0)
  await expect(dialog.locator('.truth-board-sum')).toHaveCount(0)
  for (const output of await dialog.locator('tbody .truth-result').all()) await expect(output).toHaveText('—')
  await dialog.getByRole('checkbox', { name: 'Ergebnisse zeigen' }).check()
  await dialog.getByRole('button', { name: 'Tabelle einfügen' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const body = (await (await page.request.get(`/api/notes/${id}`)).json()).body
  expect(body).toContain('\\overline{x_{1}}')
  expect(body.match(/\*\*1\*\*/g)).toHaveLength(3)
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.reload()
  await expect(page.locator('.rendered-note table th .katex')).toHaveCount(4)
  await expect(page.locator('.rendered-note table td .katex')).toHaveCount(8)
  await expect(page.locator('.rendered-note table')).toContainText('UND-Term')
})

for (const theme of ['dark', 'light'])
  for (const width of [1440, 390]) {
    test(`board layout is readable in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      const { dialog } = await open(page)
      await expect(dialog.locator('.truth-row-one')).toHaveCount(3)
      await expect(dialog.getByRole('button', { name: 'Tabelle einfügen' })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const directory = '/tmp/unios-truth-board-20261013'
      await mkdir(directory, { recursive: true })
      await page.screenshot({ path: screenshotPath(`${directory}/${theme}-${width}.png`) })
      if (width === 390) {
        await dialog.locator('.truth-sum-term').last().scrollIntoViewIfNeeded()
        await expect(dialog.locator('.truth-board-sum')).toBeInViewport()
        const last = await dialog.locator('.truth-sum-term').last().boundingBox()
        const actions = await dialog.locator('.study-insert-actions').boundingBox()
        expect(last!.y + last!.height).toBeLessThanOrEqual(actions!.y + 1)
        await page.screenshot({ path: screenshotPath(`${directory}/${theme}-${width}-sum.png`) })
      }
    })
  }
