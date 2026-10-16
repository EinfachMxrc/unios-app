// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'

const qaDirectory = path.resolve(import.meta.dirname, '../../docs/qa/note-latex-20261010')
const formulaDialog = (page: Page) => page.getByRole('dialog', { name: 'Formel schreiben', exact: true })
const savedStatus = (page: Page) => page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })

async function createNote(page: Page, body: string) {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetische LaTeX-Mitschrift', body },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).note.id as number
}

async function openEditor(page: Page, body = 'Vorlesung:') {
  const id = await createNote(page, body)
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.locator('.note-prose')).toBeVisible()
  const editor = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await editor.press('ControlOrMeta+End')
  return { id, editor }
}

async function expectFits(page: Page) {
  await expect
    .poll(() => page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth })))
    .toEqual({ page: page.viewportSize()!.width, viewport: page.viewportSize()!.width })
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await mkdir(qaDirectory, { recursive: true })
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 0)
  })
  const destination = path.join(qaDirectory, `${name}-${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath(destination), animations: 'disabled', fullPage: true })
  await info.attach(name, { path: screenshotPath(destination), contentType: 'image/png' })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('inline LaTeX transforms on the last delimiter, keeps surrounding prose and remains undoable and editable', async ({
  page,
}) => {
  const { id, editor } = await openEditor(page)
  await editor.pressSequentially(String.raw` vor \(\frac{1}{2}\) danach `)
  await expect(editor.locator('.studio-math-inline .katex')).toHaveCount(1)
  await expect(formulaDialog(page)).toHaveCount(0)
  await expect(editor).toContainText('Vorlesung: vor')
  await expect(editor).toContainText('danach')
  // Complete the first autosave before the next formula, so Undo has a
  // separate real writing step rather than one merged rapid typing group.
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
    .toContain(String.raw`$\frac{1}{2}$`)
  await editor.pressSequentially('$x^2$')
  await expect(editor.locator('.studio-math-inline .katex')).toHaveCount(2)
  await page.getByRole('button', { name: 'Rückgängig (Strg/⌘+Z)', exact: true }).click()
  await expect(editor.locator('.studio-math-inline .katex')).toHaveCount(1)
  await page.getByRole('button', { name: 'Wiederholen (Strg/⌘+Shift+Z)', exact: true }).click()
  await expect(editor.locator('.studio-math-inline .katex')).toHaveCount(2)
  await editor.press('ControlOrMeta+End')
  await editor.pressSequentially(' Ende.')
  await expect(editor).toContainText('Ende.')
  await editor.getByRole('button', { name: 'Formel bearbeiten', exact: true }).first().click()
  const dialog = formulaDialog(page)
  await expect(dialog.locator('math-field')).toBeVisible()
  const original = await dialog
    .locator('math-field')
    .evaluate((field) => (field as HTMLElement & { value: string }).value)
  expect(original).toMatch(/\\frac/)
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(editor.locator('.studio-math-inline .katex')).toHaveCount(2)
  await expect(savedStatus(page)).toBeVisible()
  const saved = (await (await page.request.get(`/api/notes/${id}`)).json()).body as string
  expect(saved).toContain(String.raw`$\frac{1}{2}$`)
  expect(saved).toContain('$x^2$')
  expect(saved).toContain('danach')
  expect(saved).toContain('Ende.')
  await page.reload()
  await expect(page.locator('.rendered-note .studio-math-inline .katex')).toHaveCount(2)
  await expect(page.locator('.rendered-note')).toContainText('Ende.')
})

test('escaped dollar signs behave like normal text with Delete, Backspace and Undo', async ({ page }) => {
  const { editor } = await openEditor(page, String.raw`A\$B`)
  await editor.press('ControlOrMeta+Home')
  await editor.press('ArrowRight')
  expect(
    await page.evaluate(() => {
      const selection = window.getSelection()
      return { node: selection?.anchorNode?.textContent, offset: selection?.anchorOffset }
    }),
  ).toEqual({ node: 'A$B', offset: 1 })
  await editor.press('Delete')
  await expect(editor).toHaveText('AB')
  await page.getByRole('button', { name: 'Rückgängig (Strg/⌘+Z)', exact: true }).click()
  await expect(editor).toHaveText('A$B')
  await editor.press('ControlOrMeta+End')
  await editor.press('ArrowLeft')
  await editor.press('Backspace')
  await expect(editor).toHaveText('AB')
  await expect(editor.locator('.studio-math')).toHaveCount(0)
  await editor.press('ControlOrMeta+End')
  await editor.press('ControlOrMeta+Shift+Home')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('AB')
})

const visualBody = [
  '# Logik und Mathematik · Mitschrift',
  String.raw`Direkt im Satz: \(\frac{1}{2}\) und $A\oplus B$.`,
  String.raw`\[\begin{pmatrix}1&0\\0&1\end{pmatrix}\]`,
  String.raw`$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$`,
  '| Eingangszustand A | Eingangszustand B | A UND B | A ODER B | A XOR B | NICHT A | NICHT B |\n| --- | --- | --- | --- | --- | --- | --- |\n| 0 | 0 | 0 | 0 | 0 | 1 | 1 |\n| 0 | 1 | 0 | 1 | 1 | 1 | 0 |\n| 1 | 0 | 0 | 1 | 1 | 0 | 1 |\n| 1 | 1 | 1 | 1 | 0 | 0 | 0 |',
  `\`\`\`java\nString explanation = "${'synthetic '.repeat(32)}";\nfor (int index = 0; index < 4; index++) {\n    total += index;\n}\n\`\`\``,
  'Alle Inhalte bleiben erreichbar: breite Tabellen und Code scrollen innerhalb der Notiz.',
].join('\n\n')

test('PDF margin comments preview LaTeX on demand and keep their original source when saved', async ({ page }) => {
  const comment = String.raw`Randnotiz: \(x^2\).` + '\n\n' + String.raw`\[\frac{1}{2}\]`
  const created = await page.request.post('/api/material/1/annotations', {
    data: { kind: 'highlight', quote: 'Schleifen und Python Beispiele', page: 1, comment },
  })
  expect(created.ok()).toBeTruthy()
  await page.goto('/material/1')
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  const row = page
    .locator('.material-annotation')
    .filter({ has: page.getByRole('textbox', { name: 'Kommentar', exact: true }) })
    .first()
  const source = row.getByRole('textbox', { name: 'Kommentar', exact: true })
  await expect(source).toHaveValue(comment)
  await expect(row.locator('.assessment-question-document')).toHaveCount(0)
  await row.getByText('Kommentar mit Formeln ansehen', { exact: true }).click()
  await expect(row.locator('.katex')).toHaveCount(2)
  const updated = comment + '\nEigener Gedanke.'
  await source.fill(updated)
  await expect(row.locator('.assessment-question-document')).toContainText('Eigener Gedanke.')
  await row.getByRole('button', { name: 'Kommentar speichern', exact: true }).click()
  await expect
    .poll(async () => {
      const detail = await (await page.request.get('/api/material/1')).json()
      return detail.annotations.find((item: { quote: string }) => item.quote === 'Schleifen und Python Beispiele')
        ?.comment
    })
    .toBe(updated)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Kommentar', exact: true }).first()).toHaveValue(updated)
})

for (const theme of ['light', 'dark'] as const)
  for (const width of [1280, 390]) {
    test(`LaTeX notes retain readable code, formulas and scrollable truth tables in ${theme} at ${width}px and large text`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 720 })
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      const id = await createNote(page, visualBody)
      await page.goto(`/notes?id=${id}`)
      if (width === 1280) await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
      const document = page.locator(width === 1280 ? '.note-prose' : '.rendered-note').first()
      await expect(document.locator('.katex')).toHaveCount(4)
      await expect(document.locator('table th').last()).toHaveText('NICHT B')
      await expect(document.locator('pre code')).toContainText('    total += index;')
      const code = document.locator('pre')
      const table = document.locator('.tableWrapper')
      for (const fontSize of ['100%', '150%']) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value
        }, fontSize)
        await expectFits(page)
        if (width === 390) {
          const edit = page.getByRole('button', { name: 'Bearbeiten', exact: true })
          await expect(edit).toBeVisible()
          const bounds = await edit.boundingBox()
          const header = await page.locator('.note-canvas-toolbar').boundingBox()
          expect(
            bounds && header && bounds.x >= header.x && bounds.x + bounds.width <= header.x + header.width + 1,
          ).toBeTruthy()
        }
        expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
        await code.evaluate((element) => {
          element.scrollLeft = element.scrollWidth
        })
        expect(await code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        if (width === 390) {
          expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
          await expect(table).toHaveAttribute('tabindex', '0')
          await table.evaluate((element) => {
            element.scrollLeft = 0
          })
          await table.focus()
          await table.press('ArrowRight')
          await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        }
        await code.evaluate((element) => {
          element.scrollLeft = 0
        })
        await table.evaluate((element) => {
          element.scrollLeft = 0
        })
      }
      await screenshot(page, info, `note-latex-${theme}-${width}${width === 390 ? '-font150-readonly' : '-editor'}`)
      expect((await (await page.request.get(`/api/notes/${id}`)).json()).note.current_revision).toBe(1)
    })
  }
