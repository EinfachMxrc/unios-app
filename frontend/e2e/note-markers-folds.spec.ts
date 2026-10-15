// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const sample = `# Zahlensysteme

Ein =={green}Stellenwert== gehört zur Position einer Ziffer. ==Merkregel==: Von rechts beginnen.

:::fold {label="Beispielrechnung Schritt für Schritt"}

## Herleitung

$(10111)_2 = 16 + 4 + 2 + 1 = 23$

- Prüfe die Bitbreite.
- Lies von rechts nach links.

:::callout {kind="pitfall"}

Die führende Stelle kann ein Vorzeichenbit sein. [Quelle](/courses/1)

:::

| Stelle | Gewicht |
| --- | --- |
| 0 | 1 |
| 1 | 2 |

:::

Was ich bereits verstanden habe, bleibt sichtbar.
`

async function create(page: Page, body = sample) {
  const result = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Marker und Herleitungen', body },
  })
  expect(result.ok()).toBeTruthy()
  const id = (await result.json()).note.id
  await page.goto(`/notes?id=${id}`)
  return id
}

for (const theme of ['light', 'dark'])
  for (const width of [1440, 390]) {
    test(`folds and markers ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 })
      await page.addInitScript((theme) => localStorage.setItem('unios-theme', theme), theme)
      const id = await create(page)
      const fold = page.locator('.rendered-note .studio-fold')
      const toggle = fold.getByRole('button', { name: 'Beispielrechnung Schritt für Schritt', exact: true })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(fold.locator('.studio-fold-body')).toBeHidden()
      await expect(page.locator('.rendered-note mark[data-color="green"]')).toHaveText('Stellenwert')
      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(fold.locator('table')).toBeVisible()
      await expect(fold.locator('.katex').first()).toBeVisible()
      await expect(fold.locator('.studio-callout')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: screenshotPath(`../docs/qa/note-markers-folds-20261014/${theme}-${width}.png`),
        fullPage: true,
      })
      await toggle.click()
      await page.emulateMedia({ media: 'print' })
      await expect(fold.locator('.studio-fold-body')).toBeVisible()
      await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' })
      await expect(fold.locator('.studio-fold-body')).toBeHidden()
      expect((await (await page.request.get(`/api/notes/${id}`)).json()).note.current_revision).toBe(1)
      await page.reload()
      await expect(page.locator('.rendered-note .studio-fold button')).toHaveAttribute('aria-expanded', 'false')
    })
  }

test('selection, colour, remove and typed shortcut survive autosave and reload', async ({ page }) => {
  const id = await create(page, 'Ein Basisfall beendet die Rekursion.')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.locator('.studio-document')
  await editor
    .locator('p')
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.setStart(element.firstChild!, 4)
      range.setEnd(element.firstChild!, 13)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
  await page.getByRole('button', { name: 'Text markieren', exact: true }).click()
  await expect(editor.locator('mark')).toHaveText('Basisfall')
  await page.getByRole('combobox', { name: 'Markerfarbe', exact: true }).selectOption('pink')
  await expect(editor.locator('mark')).toHaveAttribute('data-color', 'pink')
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
    .toContain('=={pink}Basisfall==')
  await page.reload()
  await expect(page.locator('.rendered-note mark')).toHaveAttribute('data-color', 'pink')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.locator('.studio-document mark').click()
  await page.getByRole('button', { name: 'Markierung entfernen', exact: true }).click()
  await expect(page.locator('.studio-document mark')).toHaveCount(0)
  await page.locator('.studio-document').press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('==Schnell merken==')
  await expect(page.locator('.studio-document mark')).toHaveText('Schnell merken')
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
    .toContain('==Schnell merken==')
})

test('new folded section can be titled, edited and collapsed without a hidden typing cursor', async ({ page }) => {
  const id = await create(page, 'Meine Mitschrift')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.locator('.studio-document')
  await editor.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Bausteine', exact: true }).click()
  await page.getByRole('option', { name: 'Einklappbarer Abschnitt', exact: true }).click()
  await page.keyboard.insertText('Mein eigener Rechenweg.')
  await page.getByRole('textbox', { name: 'Abschnittstitel', exact: true }).fill('Lösung ansehen')
  const fold = editor.locator('.studio-fold')
  await expect(fold).toContainText('Mein eigener Rechenweg.')
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
    .toContain('label="Lösung ansehen"')
  await fold.getByRole('button', { name: 'Außerhalb weiterschreiben', exact: true }).click()
  await page.keyboard.insertText('Dieser Gedanke bleibt außerhalb.')
  await expect(editor.locator(':scope > p').last()).toHaveText('Dieser Gedanke bleibt außerhalb.')
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
    .toContain('Dieser Gedanke bleibt außerhalb.')
  const revision = (await (await page.request.get(`/api/notes/${id}`)).json()).note.current_revision
  await fold.locator('.studio-fold-body p').click()
  await fold.getByRole('button', { name: 'Lösung ansehen', exact: true }).click()
  await expect(fold.locator('.studio-fold-body')).toBeHidden()
  await page.waitForTimeout(700)
  expect((await (await page.request.get(`/api/notes/${id}`)).json()).note.current_revision).toBe(revision)
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toHaveValue(/:::fold/)
  await page.getByRole('button', { name: 'Editor', exact: true }).click()
  await expect(page.locator('.studio-fold-body')).toContainText('Mein eigener Rechenweg.')
  await page.reload()
  await page.locator('.rendered-note .studio-fold button').click()
  await expect(page.locator('.rendered-note .studio-fold-body')).toContainText('Mein eigener Rechenweg.')
})
