// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'
import { noteEditor, writeNote } from './noteEditor'

type StoredBlock = {
  type: string
  props: Record<string, unknown>
  content: { text?: string; marks?: string[] }[]
  children: StoredBlock[]
}

async function stored(page: import('@playwright/test').Page, id: string) {
  const detail = await (await page.request.get(`/api/notes/${id}`)).json()
  if (!detail.document) throw new Error(`Notiz ${id} ohne Dokument: ${JSON.stringify(detail).slice(0, 300)}`)
  return detail.document.blocks as StoredBlock[]
}
async function createViaUi(page: import('@playwright/test').Page, title: string): Promise<string> {
  await page.getByRole('textbox', { name: 'Notiztitel' }).fill(title)
  await page.getByRole('button', { name: 'Notiz anlegen' }).click()
  await expect(page).toHaveURL(/[?&]id=[0-9a-f-]{36}/)
  return new URL(page.url()).searchParams.get('id')!
}

test('Markdown shortcuts and the slash menu build blocks, saved as a block document', async ({ page }) => {
  await page.goto('/notes?new=1&course_id=1')
  await writeNote(page, ['# Rekursion', 'Eine Funktion ruft sich selbst auf.', '/aufz'])
  const menu = page.getByRole('listbox', { name: 'Block einfügen' })
  await expect(menu.getByRole('option', { name: 'Aufzählung' })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Basisfall')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Rekursionsschritt')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/def')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ein Basisfall beendet die Rekursion.')
  const editor = noteEditor(page)
  await expect(editor.locator('h1')).toHaveText('Rekursion')
  await expect(editor.locator('ul > li')).toHaveCount(2)
  await expect(editor.locator('.note-callout[data-kind="definition"]')).toContainText('Ein Basisfall beendet')
  const id = await createViaUi(page, 'Block-Notiz')
  const blocks = await stored(page, id)
  expect(blocks.map((block) => block.type).slice(0, 5)).toEqual(['heading', 'paragraph', 'bullet', 'bullet', 'callout'])
  expect(blocks[2].content[0].text).toBe('Basisfall')
  expect(blocks[4].props.kind).toBe('definition')
  await page.reload()
  await expect(page.locator('.rendered-note h1')).toHaveText('Rekursion')
})

test('selected text is formatted from the toolbar and linked notes resolve', async ({ page }) => {
  const source = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Verknüpfte Lernquelle', body: 'Eine eigenständige Quelle.' },
  })
  expect(source.ok()).toBeTruthy()
  await page.goto('/notes?new=1&course_id=1')
  await writeNote(page, ['Wichtig ist der Basisfall'])
  // Selecting a whole line with the pointer, as a reader would.
  await noteEditor(page).getByText('Wichtig ist der Basisfall').click({ clickCount: 3 })
  const toolbar = page.getByRole('toolbar', { name: 'Text formatieren' })
  // The toolbar appears a moment after the selection settles.
  await expect.poll(() => toolbar.count()).toBe(1)
  await toolbar.getByRole('button', { name: /^Fett/ }).click()
  await expect(noteEditor(page).locator('strong')).toHaveText('Wichtig ist der Basisfall')
  await page.keyboard.press('ArrowRight')
  // The editor reads the browser's moved caret asynchronously; wait for it like a person would.
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Siehe [[Verkn')
  await page
    .getByRole('listbox', { name: 'Notiz verlinken' })
    .getByRole('option', { name: 'Verknüpfte Lernquelle' })
    .click()
  await expect(noteEditor(page).locator('.note-wiki')).toContainText('Verknüpfte Lernquelle')
  const id = await createViaUi(page, 'Formatierung')
  const blocks = await stored(page, id)
  expect(blocks[0].content[0]).toMatchObject({ text: 'Wichtig ist der Basisfall', marks: ['bold'] })
  expect(JSON.stringify(blocks[1].content)).toContain('"wikilink"')
  await expect(page.locator('.rendered-note .note-wikilink', { hasText: 'Verknüpfte Lernquelle' })).toBeVisible()
})

test('blocks move, duplicate and are removed from their handle menu', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Reihenfolge', body: 'Erster Absatz\n\nZweiter Absatz\n\nDritter Absatz' },
  })
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  const editor = noteEditor(page)
  const second = editor.getByText('Zweiter Absatz')
  await second.hover()
  await page.getByRole('button', { name: 'Blockaktionen' }).click()
  await page.getByRole('menuitem', { name: 'Nach oben' }).click()
  await expect(editor.locator('p').first()).toHaveText('Zweiter Absatz')
  await editor.getByText('Dritter Absatz').hover()
  await page.getByRole('button', { name: 'Blockaktionen' }).click()
  await page.getByRole('menuitem', { name: 'Duplizieren' }).click()
  await expect(editor.getByText('Dritter Absatz')).toHaveCount(2)
  await editor.getByText('Erster Absatz').hover()
  await page.getByRole('button', { name: 'Blockaktionen' }).click()
  await page.getByRole('menuitem', { name: 'Entfernen' }).click()
  await expect(editor.getByText('Erster Absatz')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const blocks = await stored(page, id)
  expect(blocks.map((block) => block.content[0].text)).toEqual(['Zweiter Absatz', 'Dritter Absatz', 'Dritter Absatz'])
})

test('a block is dragged by its grip to a new position', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Ziehen', body: 'Eins\n\nZwei\n\nDrei' },
  })
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  const editor = noteEditor(page)
  await editor.getByText('Eins', { exact: true }).hover()
  await page.waitForTimeout(300)
  const height = (await editor.boundingBox())!.height
  await page.locator('.note-editor-page [draggable=true]').dragTo(editor, { targetPosition: { x: 20, y: height - 15 } })
  await expect(editor.locator('p')).toHaveText(['Zwei', 'Drei', 'Eins'])
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  expect((await stored(page, id)).map((block) => block.content[0].text)).toEqual(['Zwei', 'Drei', 'Eins'])
})

test('a toggle folds its content and to-dos stay checkable', async ({ page }) => {
  await page.goto('/notes?new=1&course_id=1')
  await writeNote(page, ['/aufkl'])
  await page.keyboard.press('Enter')
  await page.keyboard.type('Beweis')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Der geheime Beweisschritt')
  const editor = noteEditor(page)
  await expect(editor.getByText('Der geheime Beweisschritt')).toBeVisible()
  await page.getByRole('button', { name: 'Zuklappen' }).click()
  await expect(editor.getByText('Der geheime Beweisschritt')).toBeHidden()
  await page.getByRole('button', { name: 'Aufklappen' }).click()
  await expect(editor.getByText('Der geheime Beweisschritt')).toBeVisible()
  await editor.getByText('Der geheime Beweisschritt').click()
  await page.keyboard.press('End')
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/check')
  await expect(
    page.getByRole('listbox', { name: 'Block einfügen' }).getByRole('option', { name: 'Checkliste' }),
  ).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Aufgabe erledigen')
  await editor.getByRole('checkbox').check()
  const id = await createViaUi(page, 'Toggle')
  const blocks = await stored(page, id)
  expect(blocks.find((block) => block.type === 'toggle')?.children[0].content[0].text).toBe('Der geheime Beweisschritt')
  expect(blocks.find((block) => block.type === 'todo')?.props.checked).toBe(true)
})

test('a note written before blocks existed opens, is editable and saves as a block document', async ({ page }) => {
  const courses = await (await page.request.get('/api/courses')).json()
  const courseId = courses.courses.find((item: { name: string }) => item.name === 'Programmieren 1').id
  const created = await page.request.post('/api/__test__/legacy-note', { params: { course_id: courseId } })
  const id = (await created.json()).id
  await page.goto(`/notes?id=${id}`)
  await expect(page.getByText('Historischer Markdown-Text')).toBeVisible()
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  const editor = noteEditor(page)
  await editor.getByText('Historischer Markdown-Text').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' mit Ergänzung')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const detail = await (await page.request.get(`/api/notes/${id}`)).json()
  expect(detail.note.current_revision).toBe(2)
  expect(JSON.stringify(detail.document)).toContain('mit Ergänzung')
  expect(detail.versions.map((item: { relative_path: string }) => item.relative_path.endsWith('.json'))).toEqual([
    true,
    false,
  ])
  // The original Markdown revision is untouched and still readable.
  const first = await (await page.request.get(`/api/notes/${id}?revision=1`)).json()
  expect(first.body).toBe('Historischer Markdown-Text')
})
