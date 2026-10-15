// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const sample =
  '# Rekursion verstehen\n\nEin Problem wird in kleinere Schritte zerlegt.\n\n:::callout {kind="definition"}\n\n**Basisfall:** Er beendet die Rekursion.\n\n:::\n\n## Ein kleines Beispiel\n\n```python\ndef summe(n):\n    if n <= 0:\n        return 0\n    return n + summe(n - 1)\n```\n\n## Was ich noch üben möchte\n\n- [x] Basisfall erkennen\n- [ ] Den Aufrufbaum zeichnen\n\n| Konzept | Merksatz |\n| --- | --- |\n| Basisfall | Stoppt den Aufruf |\n| Rekursionsschritt | Verkleinert das Problem |'

async function openEditor(page: Page, body = sample) {
  const result = await page.request.post('/api/notes', { data: { course_id: 1, title: 'Rekursion · Lernnotiz', body } })
  expect(result.ok()).toBeTruthy()
  const id = (await result.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.locator('.studio-document')).toBeVisible()
  return id
}

async function addBlock(page: Page, label: string) {
  await page.getByRole('button', { name: 'Bausteine', exact: true }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

test('rich text, heading levels, slash blocks, tables and source remain compatible', async ({ page }) => {
  const id = await openEditor(page, 'Erster Absatz\n\nZweiter Absatz')
  const editor = page.getByRole('textbox', { name: 'Notizinhalt' })
  await editor.locator('p').first().click()
  await page.getByRole('combobox', { name: 'Texttyp' }).selectOption('h6')
  await expect(editor.locator('h6')).toHaveText('Erster Absatz')
  await editor.locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('/def')
  await expect(page.getByRole('option', { name: 'Definition', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Ein erklärender Baustein.')
  await expect(editor.locator('.studio-callout')).toContainText('Ein erklärender Baustein.')
  await editor.press('ControlOrMeta+End')
  await editor.press('ArrowDown')
  await addBlock(page, 'Tabelle')
  const cell = editor.locator('td').first()
  await cell.click()
  await page.keyboard.insertText('Beispiel')
  await page.getByRole('button', { name: '+ Zeile', exact: true }).click()
  await expect(editor.locator('tr')).toHaveCount(4)
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(editor).toHaveValue(/###### Erster Absatz/)
  await expect(editor).toHaveValue(/kind="definition"/)
  await page.getByRole('button', { name: 'Editor', exact: true }).click()
  await expect(editor.locator('table')).toContainText('Beispiel')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.locator('.rendered-note h6')).toHaveText('Erster Absatz')
  expect((await (await page.request.get(`/api/notes/${id}`)).json()).body).toContain('Beispiel')
})

test('blocks move, duplicate, undo and focus without changing a note merely by opening it', async ({ page }) => {
  const id = await openEditor(page, '# Erster Abschnitt\n\nZweiter Absatz')
  expect((await (await page.request.get(`/api/notes/${id}`)).json()).note.current_revision).toBe(1)
  await page.locator('.studio-document h1').click()
  await page.getByRole('button', { name: 'Block nach unten', exact: true }).click()
  await expect(page.locator('.studio-document > :first-child')).toHaveText('Zweiter Absatz')
  await page.getByRole('button', { name: 'Block duplizieren', exact: true }).click()
  await expect(page.locator('.studio-document h1')).toHaveCount(2)
  await page.getByRole('button', { name: 'Rückgängig', exact: false }).click()
  await expect(page.locator('.studio-document h1')).toHaveCount(1)
  await page.getByRole('button', { name: 'Fokusmodus', exact: true }).click()
  await expect(page.locator('.note-index')).toBeHidden()
  await page.getByRole('textbox', { name: 'Notizinhalt' }).press('Escape')
  await expect(page.locator('.note-index')).toBeVisible()
  await page.locator('.studio-document h1').hover()
  await expect(page.locator('.studio-drag-handle')).toBeVisible()
})

test('drag handle reorders a whole block', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openEditor(page, '# Erster Abschnitt\n\nZweiter Absatz')
  const document = page.locator('.studio-document')
  await document.locator('h1').hover()
  const handle = page.locator('.studio-writing [draggable=true]').last()
  await expect(handle).toBeVisible()
  const bounds = await document.boundingBox()
  await handle.dragTo(document, { targetPosition: { x: 20, y: bounds!.height - 15 } })
  await expect(document.locator(':scope > :first-child')).toHaveText('Zweiter Absatz')
  await expect(document.locator('h1')).toHaveText('Erster Abschnitt')
})

test('custom blocks keep their name and checklist changes remain editable', async ({ page }) => {
  await openEditor(page, '## Merksätze\n\n- [ ] Aufrufbaum zeichnen')
  const checkbox = page.locator('.studio-document input[type=checkbox]')
  await checkbox.check()
  await expect(checkbox).toBeChecked()
  await page.getByRole('textbox', { name: 'Notizinhalt' }).press('ControlOrMeta+End')
  await addBlock(page, 'Eigener Baustein')
  await page.getByRole('textbox', { name: 'Name des Bausteins' }).fill('Mein Merksatz')
  await expect(page.locator('.studio-callout > strong')).toHaveText('Mein Merksatz')
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt' })).toHaveValue(/label="Mein Merksatz"/)
  await expect(page.getByRole('textbox', { name: 'Notizinhalt' })).toHaveValue(/- \[x\] Aufrufbaum/)
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.rendered-note .studio-callout > strong')).toHaveText('Mein Merksatz')
})

test('linked objects resolve their actual destination', async ({ page }) => {
  await openEditor(page, 'Eine Kursverknüpfung')
  await addBlock(page, 'UniOS-Inhalt verknüpfen')
  await page.getByRole('dialog').getByRole('combobox', { name: 'Bereich' }).selectOption('course')
  await page.getByRole('dialog').getByRole('button', { name: 'Programmieren 1', exact: true }).click()
  await expect(page.locator('.studio-entity a')).toHaveAttribute('href', '/courses/1')
  await page.locator('.studio-entity a').click()
  await expect(page).toHaveURL(/\/courses\/1$/)
})

function audioFixture() {
  const raw = Buffer.alloc(44 + 16000)
  raw.write('RIFF', 0)
  raw.writeUInt32LE(raw.length - 8, 4)
  raw.write('WAVEfmt ', 8)
  raw.writeUInt32LE(16, 16)
  raw.writeUInt16LE(1, 20)
  raw.writeUInt16LE(1, 22)
  raw.writeUInt32LE(8000, 24)
  raw.writeUInt32LE(16000, 28)
  raw.writeUInt16LE(2, 32)
  raw.writeUInt16LE(16, 34)
  raw.write('data', 36)
  raw.writeUInt32LE(16000, 40)
  return raw
}

test('private audio imports, actually plays, and survives save and reload', async ({ page }) => {
  await openEditor(page, 'Meine Erklärung')
  await addBlock(page, 'Bild, Audio oder Video')
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Erklärung als Audio')
  await page
    .getByLabel('Mediendatei wählen')
    .setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: audioFixture() })
  const audio = page.locator('.studio-document audio')
  await expect(audio).toHaveCount(1)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.duration)).toBe(1)
  await audio.evaluate((node: HTMLAudioElement) => node.play())
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(0)
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.rendered-note audio')).toHaveCount(1)
  await expect
    .poll(() => page.locator('.rendered-note audio').evaluate((node: HTMLAudioElement) => node.duration))
    .toBe(1)
})

for (const theme of ['light', 'dark'])
  for (const width of [1440, 390]) {
    test(`editor design ${theme} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 })
      await page.addInitScript((theme) => localStorage.setItem('unios-theme', theme), theme)
      await openEditor(page)
      await page.getByRole('button', { name: 'Fokusmodus', exact: true }).click()
      await page.getByRole('button', { name: 'Abschnitte', exact: true }).click()
      await expect(page.locator('.studio-document .hljs-keyword')).not.toHaveCount(0)
      await expect(page.locator('.studio-document .studio-callout')).toBeVisible()
      const row = page.locator('.studio-document li[data-type=taskItem]').first()
      const box = await row.locator('input').boundingBox()
      const text = await row.locator('p').boundingBox()
      expect(Math.abs(box!.y - text!.y)).toBeLessThan(16)
      expect(box!.x).toBeLessThan(text!.x)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
      await page.screenshot({ path: testInfo.outputPath(`editor-${theme}-${width}.png`), fullPage: true })
    })
  }
