// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { expect, test } from './fixtures'

const quote = 'Eine Bijektion ist injektiv und surjektiv.'
async function seed(page: import('@playwright/test').Page) {
  const created = await page.request.post('/api/notes', {
    data: {
      course_id: 1,
      title: 'Synthetische Abbildungen',
      body: `# Abbildungen\n\n${quote}\n\nEigene offene Frage.`,
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  return (await created.json()).note.id as string
}
async function openSelection(page: import('@playwright/test').Page, noteId: string, recovering = false) {
  await page.goto(`/notes?id=${noteId}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const passage = page.locator('.studio-document').getByText(quote, { exact: true })
  await expect(passage).toBeVisible()
  await passage.click()
  await passage.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await expect(page.getByRole('button', { name: 'Lernkarte aus Auswahl', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Lernkarte aus Auswahl', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Lernkarte aus Mitschrift', exact: true })
  await expect(dialog).toBeVisible()
  if (recovering)
    await expect(dialog.getByRole('button', { name: 'Dieselbe Karte erneut prüfen', exact: true })).toBeEnabled()
  else await expect(dialog.getByRole('textbox', { name: 'Frage', exact: true })).toBeEnabled()
  return dialog
}

test('a note selection becomes an explicitly confirmed own card with a historical source link', async ({ page }) => {
  const noteId = await seed(page),
    dialog = await openSelection(page, noteId)
  await expect(dialog.getByRole('textbox', { name: 'Antwort', exact: true })).toHaveValue(quote)
  await expect(dialog.getByRole('textbox', { name: 'Frage', exact: true })).toHaveValue('')
  await dialog.getByRole('textbox', { name: 'Frage', exact: true }).fill('Was ist eine Bijektion?')
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/anki/note-cards') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Karte speichern', exact: true }).click()
  const result = await saving
  expect(result.status(), await result.text()).toBe(201)
  const saved = await result.json()
  expect(saved.source).toMatchObject({ kind: 'note', note_id: noteId, revision: 1, quote })
  expect(saved.source).not.toHaveProperty('page')
  await dialog.getByRole('link', { name: 'Gespeicherte Karte öffnen', exact: true }).click()
  const row = page.locator(`#card-${saved.queue_id}`)
  await expect(row).toContainText('Was ist eine Bijektion?')
  await expect(row).toContainText(quote)
  const update = await page.request.put(`/api/notes/${noteId}`, {
    data: { expected_revision: 1, title: 'Synthetische Abbildungen', body: 'Eine später überarbeitete Mitschrift.' },
  })
  expect(update.ok(), await update.text()).toBeTruthy()
  await row.getByRole('link', { name: 'Quelle öffnen', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`notes\\?id=${noteId}&revision=1`))
  await expect(page.locator('.note-document')).toContainText(quote)
  await expect(page.locator('.note-document')).not.toContainText('Eine später überarbeitete Mitschrift.')
})

test('a lost save response retries the same note card without a duplicate', async ({ page }) => {
  const noteId = await seed(page)
  let sentId = '',
    calls = 0
  await page.route('**/api/anki/note-cards', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const input = route.request().postDataJSON()
    calls += 1
    if (!sentId) sentId = input.mutation_id
    expect(input.mutation_id).toBe(sentId)
    const response = await route.fetch()
    if (calls === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  let dialog = await openSelection(page, noteId)
  await dialog.getByRole('textbox', { name: 'Frage', exact: true }).fill('Was bedeutet Bijektion?')
  await dialog.getByRole('button', { name: 'Karte speichern', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Dieselbe Karte erneut prüfen', exact: true })).toBeVisible()
  await page.reload()
  dialog = await openSelection(page, noteId, true)
  await expect(dialog.getByRole('textbox', { name: 'Frage', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Dieselbe Karte erneut prüfen', exact: true }).click()
  await expect(dialog.getByRole('link', { name: 'Gespeicherte Karte öffnen', exact: true })).toBeVisible()
  const cards = await (await page.request.get('/api/anki/queue?origin=manual')).json()
  expect(cards.filter((item: { guid: string }) => item.guid === sentId)).toHaveLength(1)
  expect(calls).toBe(2)
})

test('an edited source is rejected before saving a new note card', async ({ page }) => {
  const noteId = await seed(page),
    dialog = await openSelection(page, noteId)
  await dialog.getByRole('textbox', { name: 'Frage', exact: true }).fill('Was ist eine Bijektion?')
  const update = await page.request.put(`/api/notes/${noteId}`, {
    data: { expected_revision: 1, title: 'Synthetische Abbildungen', body: 'Die Auswahl ist jetzt anders.' },
  })
  expect(update.ok()).toBeTruthy()
  await dialog.getByRole('button', { name: 'Karte speichern', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Notiz oder Auswahl wurde inzwischen geändert')
  await expect(dialog.getByRole('button', { name: 'Karte speichern', exact: true })).toBeDisabled()
  const cards = await (await page.request.get('/api/anki/queue?origin=manual')).json()
  expect(cards.filter((item: { source?: { note_id?: string } }) => item.source?.note_id === noteId)).toHaveLength(0)
})

test('formula selections preserve their LaTeX and Markdown selection also creates cards', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetische Formelquelle', body: 'Der Wert $a+b$ bleibt erhalten.' },
  })
  expect(created.ok()).toBeTruthy()
  const noteId = (await created.json()).note.id
  await page.goto(`/notes?id=${noteId}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.locator('.studio-document')
  await editor.click()
  await editor.press('ControlOrMeta+a')
  await page.getByRole('button', { name: 'Lernkarte aus Auswahl', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Lernkarte aus Mitschrift', exact: true })
  await expect(dialog.getByRole('textbox', { name: 'Antwort', exact: true })).toHaveValue(
    'Der Wert $a+b$ bleibt erhalten.',
  )
  await dialog.locator('.manual-card-header').getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  const formulaStart = (await source.inputValue()).indexOf('$a+b$')
  expect(formulaStart).toBeGreaterThanOrEqual(0)
  await source.press('ControlOrMeta+a')
  await source.press('ArrowLeft')
  for (let i = 0; i < formulaStart; i++) await source.press('ArrowRight')
  for (let i = 0; i < '$a+b$'.length; i++) await source.press('Shift+ArrowRight')
  await page.getByRole('button', { name: 'Lernkarte aus Auswahl', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Lernkarte aus Mitschrift', exact: true })
  await expect(dialog.getByRole('textbox', { name: 'Antwort', exact: true })).toHaveValue('$a+b$')
  await dialog.getByRole('textbox', { name: 'Frage', exact: true }).fill('Wie lautet der Ausdruck?')
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/anki/note-cards') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Karte speichern', exact: true }).click()
  const result = await saving
  expect(result.status()).toBe(201)
  expect((await result.json()).source).toMatchObject({ kind: 'note', note_id: noteId, quote: '$a+b$' })
  await dialog.screenshot({ path: screenshotPath('../docs/qa/comparison-improvements-20261014/note-card-formula.png') })
})
