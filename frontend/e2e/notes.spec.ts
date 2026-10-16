// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import { noteEditor, writeNote } from './noteEditor'

test('existing notes remain readable and editable', async ({ page }, testInfo) => {
  const courses = await (await page.request.get('/api/courses')).json()
  const courseId = courses.courses.find((item: { name: string }) => item.name === 'Programmieren 1').id
  const created = await page.request.post('/api/__test__/legacy-note', { params: { course_id: courseId } })
  expect(created.ok()).toBeTruthy()
  const noteId = (await created.json()).id
  await page.goto(`/notes?id=${noteId}`)
  await expect(page.getByText('Historischer Markdown-Text')).toBeVisible()
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  let holdSaves = true
  await page.route(`**/api/notes/${noteId}`, async (route) => {
    if (route.request().method() === 'PUT' && holdSaves) return route.abort()
    await route.continue()
  })
  await noteEditor(page).getByText('Historischer Markdown-Text').click()
  await page.keyboard.press('End')
  await page.waitForTimeout(200)
  await page.keyboard.type(' mit Ergänzung')
  await expect(page.getByRole('status').filter({ hasText: 'Lokal auf diesem Gerät gesichert' })).toBeVisible()
  await page.reload()
  await expect(noteEditor(page)).toContainText('Historischer Markdown-Text mit Ergänzung')
  holdSaves = false
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('note-autosaved.png'), fullPage: true })
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.getByText('Historischer Markdown-Text mit Ergänzung')).toBeVisible()
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.goto(`/courses/${courseId}`)
  await expect(
    page.getByRole('navigation', { name: 'Kursansichten' }).getByRole('link', { name: /Notizen/ }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Frühere Frage' })).toBeVisible()
})

test('a new lecture note uses a template and remains searchable', async ({ page }, testInfo) => {
  await page.goto('/notes?new=1&course_id=1&title=Vorlesung%2004')
  await page.getByRole('button', { name: 'Vorlesungsmitschrift', exact: true }).click()
  await expect(noteEditor(page)).toContainText('Die Grundidee')
  await writeNote(page, ['## Kernkonzepte', 'Rekursionsbaum und Terminierung'])
  await page.getByRole('button', { name: 'Notiz anlegen' }).click()
  await expect(page).toHaveURL(/[?&]id=[0-9a-f-]{36}/)
  await expect(page.getByText('Rekursionsbaum und Terminierung')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('note-document.png'), fullPage: true })
  await page.goto('/search?q=Rekursionsbaum')
  await expect(page.getByRole('link', { name: 'Vorlesung 04' })).toBeVisible()
})

test('a sleeping device reconciles a local draft with a newer host version', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Rekursion', body: 'Selbstaufruf\n\nBasisfall\n\nBeispiel' },
  })
  expect(created.ok()).toBeTruthy()
  const noteId = (await created.json()).note.id
  let holdSaves = true
  await page.route(`**/api/notes/${noteId}`, async (route) => {
    if (route.request().method() === 'PUT' && holdSaves) return route.abort()
    await route.continue()
  })
  await page.goto(`/notes?id=${noteId}`)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await noteEditor(page).getByText('Basisfall', { exact: true }).click()
  await page.keyboard.press('End')
  await page.waitForTimeout(200)
  await page.keyboard.type(' beendet Rekursion')
  await expect(page.getByRole('status').filter({ hasText: 'Lokal auf diesem Gerät gesichert' })).toBeVisible()
  const remote = await page.request.put(`/api/notes/${noteId}`, {
    data: {
      expected_revision: 1,
      title: 'Rekursion',
      body: 'Selbstaufruf über Funktionen\n\nBasisfall\n\nBeispiel',
    },
  })
  expect(remote.ok()).toBeTruthy()
  holdSaves = false
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const latest = await (await page.request.get(`/api/notes/${noteId}`)).json()
  expect(latest.note.current_revision).toBe(3)
  // Both edits touched different blocks, so they merge without asking.
  expect(latest.body).toBe('Selbstaufruf über Funktionen\n\nBasisfall beendet Rekursion\n\nBeispiel')
})

test('overlapping device edits wait for an explicit conflict decision', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Basisfall', body: 'Der Basisfall ist wichtig.' },
  })
  expect(created.ok()).toBeTruthy()
  const noteId = (await created.json()).note.id
  let holdSaves = true
  await page.route(`**/api/notes/${noteId}`, async (route) => {
    if (route.request().method() === 'PUT' && holdSaves) return route.abort()
    await route.continue()
  })
  await page.goto(`/notes?id=${noteId}`)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await writeNote(page, ['Der Basisfall stoppt den Aufruf.'])
  await expect(page.getByRole('status').filter({ hasText: 'Lokal auf diesem Gerät gesichert' })).toBeVisible()
  const remote = await page.request.put(`/api/notes/${noteId}`, {
    data: { expected_revision: 1, title: 'Basisfall', body: 'Der Basisfall beendet die Rekursion.' },
  })
  expect(remote.ok()).toBeTruthy()
  holdSaves = false
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'Änderungskonflikt' })).toBeVisible()
  expect((await (await page.request.get(`/api/notes/${noteId}`)).json()).note.current_revision).toBe(2)
  await page.getByRole('button', { name: 'Beide behalten' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const latest = await (await page.request.get(`/api/notes/${noteId}`)).json()
  expect(latest.note.current_revision).toBe(3)
  expect(latest.body).toContain('Der Basisfall beendet die Rekursion.')
  expect(latest.body).toContain('Der Basisfall stoppt den Aufruf.')
})

test('links, tables and the slash menu make a note easy to write', async ({ page }) => {
  const source = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Verknüpfte Lernquelle', body: 'Eine eigenständige Quelle für diesen Linktest.' },
  })
  expect(source.ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 1180 })
  await page.goto('/notes?new=1&course_id=1&title=Lernnotiz')
  await writeNote(page, [
    '## Schleifen und Rekursion',
    'Wie verändert sich die Laufzeit bei verschachtelten Schleifen?',
    'Weiterlesen: [[Ver',
  ])
  await page
    .getByRole('listbox', { name: 'Notiz verlinken' })
    .getByRole('option', { name: 'Verknüpfte Lernquelle' })
    .click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('/tab')
  await expect(
    page.getByRole('listbox', { name: 'Block einfügen' }).getByRole('option', { name: 'Tabelle', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(noteEditor(page).locator('table')).toBeVisible()
  await page.screenshot({ path: screenshotPath('test-results/readme-notes-editor.png') })
  await page.getByRole('button', { name: 'Notiz anlegen' }).click()
  await expect(page.locator('.rendered-note .note-wikilink', { hasText: 'Verknüpfte Lernquelle' })).toBeVisible()
  await expect(page.locator('.rendered-note table')).toBeVisible()
})
