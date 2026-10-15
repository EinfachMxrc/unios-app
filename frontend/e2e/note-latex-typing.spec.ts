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
  await expect(page.locator('.studio-document')).toBeVisible()
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

test('single-line block typing and multiline source import agree in editor, preview, portable source and reload', async ({
  page,
}) => {
  const { id, editor } = await openEditor(page)
  await editor.press('Enter')
  await editor.pressSequentially(String.raw`$$\sum_{i=1}^{3}i$$`)
  await expect(editor.locator('.studio-math-block .katex')).toHaveCount(1)
  await expect(formulaDialog(page)).toHaveCount(0)
  await editor.press('ControlOrMeta+End')
  await editor.press('ArrowDown')
  await editor.press('Enter')
  await editor.pressSequentially(String.raw`\[x^2+y^2=1\]`)
  await expect(editor.locator('.studio-math-block .katex')).toHaveCount(2)
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(source).toBeFocused()
  const imported = [
    '## Mitschrift mit mehreren Schreibweisen',
    String.raw`Im Satz: \(\frac{1}{2}\) und $A\land B$.`,
    String.raw`$$\sum_{i=1}^{3}i$$`,
    '$$\n\\int_0^1 x\\,dx\n$$',
    String.raw`\[x^2+y^2=1\]`,
    '\\[\n\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}\n\\]',
    'Nach allen Formeln bleibt dieser Satz erhalten.',
  ].join('\n\n')
  await source.fill(imported)
  const caret = imported.indexOf('Nach allen Formeln')
  await source.evaluate((field: HTMLTextAreaElement, position) => field.setSelectionRange(position, position), caret)
  await page.getByRole('button', { name: 'Lesen', exact: true }).click()
  await expect(page.locator('.note-studio .rendered-note .katex')).toHaveCount(6)
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(source).toBeFocused()
  await expect
    .poll(() => source.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd]))
    .toEqual([caret, caret])
  await source.pressSequentially('Fortsetzung: ')
  const resumedSource = `${imported.slice(0, caret)}Fortsetzung: ${imported.slice(caret)}`
  await expect(source).toHaveValue(resumedSource)
  await page
    .getByRole('toolbar', { name: 'Markdown formatieren' })
    .getByRole('button', { name: 'Vorschau', exact: true })
    .click()
  await expect(page.locator('.note-writing-preview .katex')).toHaveCount(6)
  await expect(page.locator('.note-writing-preview')).toContainText('Nach allen Formeln bleibt dieser Satz erhalten.')
  await page.getByRole('button', { name: 'Editor', exact: true }).click()
  await expect(editor).toBeFocused()
  await expect(editor.locator('.studio-math-inline .katex')).toHaveCount(2)
  await expect(editor.locator('.studio-math-block .katex')).toHaveCount(4)
  await expect(savedStatus(page)).toBeVisible()
  expect((await (await page.request.get(`/api/notes/${id}`)).json()).body).toBe(resumedSource)
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.locator('.rendered-note .katex')).toHaveCount(6)
  await page.reload()
  await expect(page.locator('.rendered-note .katex')).toHaveCount(6)
  await expect(page.locator('.rendered-note .studio-math-button')).toHaveCount(0)
})

test('unfinished formulas, escaped dollars, prices and code stay literal while invalid TeX stays recoverable without opening writes', async ({
  page,
}) => {
  const original = [
    'Preis: $5 und $10.',
    String.raw`Literal: \$x^2\$ und nicht fertig: \(x+1.`,
    String.raw`Fehler bleibt lesbar: \(\definitelyUnknown{x}\).`,
    'Inline-Code: `$x$` und `\\(y\\)`.',
    '```tex\n\\(x+1\\)\n$$\\frac{1}{2}$$\n```',
    '<script>window.__unexpectedNoteAction=true</script>',
    'Schutztext.',
  ].join('\n\n')
  const { id, editor } = await openEditor(page, original)
  await expect(editor.locator('.katex')).toHaveCount(0)
  await expect(editor.locator('.studio-math-error')).toContainText(String.raw`\definitelyUnknown{x}`)
  await expect(editor.locator('pre code')).toHaveText('\\(x+1\\)\n$$\\frac{1}{2}$$')
  await expect(editor.locator('script, iframe, img')).toHaveCount(0)
  expect(await page.evaluate(() => Object.hasOwn(window, '__unexpectedNoteAction'))).toBe(false)
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toHaveValue(original)
  await page.getByRole('button', { name: 'Editor', exact: true }).click()
  const unchanged = await (await page.request.get(`/api/notes/${id}`)).json()
  expect(unchanged.note.current_revision).toBe(1)
  expect(unchanged.body).toBe(original)
  await editor.press('ControlOrMeta+End')
  await editor.pressSequentially(String.raw` Ergänzung: \$z^2\$ und \(noch offen.`)
  await expect(editor.locator('.katex')).toHaveCount(0)
  await expect(editor).toContainText('$z^2$')
  await expect(editor).toContainText(String.raw`\(noch offen.`)
  await expect(savedStatus(page)).toBeVisible()
  const saved = (await (await page.request.get(`/api/notes/${id}`)).json()).body as string
  expect(saved).toContain(String.raw`\$z^2\$`)
  expect(saved).toContain('Preis: $5 und $10.')
  expect(saved).toContain(String.raw`\definitelyUnknown{x}`)
  await page.reload()
  await expect(page.locator('.rendered-note .katex')).toHaveCount(0)
  await expect(page.locator('.rendered-note')).toContainText('$z^2$')
  await expect(page.locator('.rendered-note')).toContainText(String.raw`\(noch offen.`)
})

test('PDF lecture-note source uses the same LaTeX delimiters in preview and preserves its exact local draft after reload', async ({
  page,
}) => {
  await page.goto('/material/1')
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  const tools = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  await tools.getByRole('tab', { name: 'Mitschrift', exact: true }).click()
  const body = tools.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  const source = [
    String.raw`Am Rand: \(A\lor B\) und $\frac{1}{2}$.`,
    String.raw`$$x^2+y^2=1$$`,
    '\\[\n\\sum_{i=1}^3 i\n\\]',
    'Dieser Quellenbezug bleibt erhalten.',
  ].join('\n\n')
  await body.fill(source)
  await tools.getByRole('button', { name: 'Vorschau', exact: true }).click()
  await expect(tools.locator('.reader-note-preview .katex')).toHaveCount(4)
  await expect(tools.locator('.reader-note-preview')).toContainText('Dieser Quellenbezug bleibt erhalten.')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toHaveValue(source)
  const restored = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  await restored.getByRole('button', { name: 'Vorschau', exact: true }).click()
  await expect(restored.locator('.reader-note-preview .katex')).toHaveCount(4)
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
  ).toEqual({ node: 'A', offset: 1 })
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
      const document = page.locator(width === 1280 ? '.studio-document' : '.rendered-note').first()
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
      if (width === 1280) {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '100%'
        })
        await page.getByText('LaTeX direkt tippen', { exact: true }).click()
        await expect(
          page
            .locator('.note-studio details')
            .filter({ has: page.locator('summary').filter({ hasText: 'LaTeX direkt tippen' }) }),
        ).toHaveAttribute('open', '')
      }
      await screenshot(page, info, `note-latex-${theme}-${width}${width === 390 ? '-font150-readonly' : '-editor'}`)
      expect((await (await page.request.get(`/api/notes/${id}`)).json()).note.current_revision).toBe(1)
    })
  }
