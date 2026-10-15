// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('global note links survive 51 notes, filters, duplicate titles and renames', async ({ page }) => {
  test.setTimeout(120_000)
  const courses = (await (await page.request.get('/api/courses')).json()).courses as { id: number; name: string }[]
  const courseId = courses.find((course) => course.name === 'Programmieren 1')!.id
  const otherCourseId = courses.find((course) => course.id !== courseId)!.id
  const create = async (title: string, body: string, course_id = courseId) => {
    const response = await page.request.post('/api/notes', { data: { course_id, title, body } })
    expect(response.ok()).toBeTruthy()
    return (await response.json()).note.id as string
  }
  const targetId = await create('Straße Katalogquelle', 'Erfundene Quelle für diese Regression.', otherCourseId)
  for (let index = 0; index < 51; index++) await create(`Zwischennotiz ${String(index).padStart(2, '0')}`, 'Lernstoff')
  const sourceId = await create('Aktueller Katalog-Lernplan', 'Weiterlesen: [[  STRASSE KATALOGQUELLE  ]]')
  const firstPage = await (await page.request.get('/api/notes')).json()
  expect(firstPage.notes).toHaveLength(50)
  expect(firstPage.notes.map((note: { id: string }) => note.id)).not.toContain(targetId)

  await page.goto(`/notes?id=${sourceId}`)
  const link = page.locator('.rendered-note .note-wikilink')
  await expect(link).toHaveAttribute('href', `/notes?id=${targetId}`)
  const pagination = page.getByRole('navigation', { name: 'Listenseiten' })
  await pagination.getByRole('button', { name: 'Weiter', exact: true }).click()
  await expect(page.locator('.note-index .note-list-item').filter({ hasText: 'Straße Katalogquelle' })).toBeVisible()
  await expect(link).toHaveAttribute('href', `/notes?id=${targetId}`)
  await page.getByRole('searchbox', { name: 'Notizen nach Titel suchen' }).fill('Zwischennotiz')
  await expect(page.locator('.note-index .note-list-item').filter({ hasText: 'Straße Katalogquelle' })).toHaveCount(0)
  await expect(page.locator('.note-index .note-list-item')).toHaveCount(50)
  await expect(link).toHaveAttribute('href', `/notes?id=${targetId}`)

  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Notizinhalt' })
  await editor.fill('[[Straße K')
  const option = page
    .getByRole('listbox', { name: 'Notizen verknüpfen' })
    .getByRole('option', { name: 'Straße Katalogquelle', exact: true })
  await expect(option).toBeVisible()
  await option.click()
  await expect(editor).toHaveValue('[[Straße Katalogquelle]]')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(link).toHaveAttribute('href', `/notes?id=${targetId}`)

  const duplicateId = await create('STRASSE KATALOGQUELLE', 'Erfundene zweite Quelle.')
  await page.evaluate(() => window.dispatchEvent(new Event('unios:sync-completed')))
  const unresolved = page.locator('.rendered-note .note-unresolved-link')
  await expect(unresolved).toHaveAttribute('title', /Mehrere Notizen/)
  await expect(link).toHaveCount(0)
  const renamedDuplicate = await page.request.put(`/api/notes/${duplicateId}`, {
    data: { expected_revision: 1, title: 'Andere Katalogquelle', body: 'Erfundene zweite Quelle.' },
  })
  expect(renamedDuplicate.ok()).toBeTruthy()
  await page.evaluate(() => window.dispatchEvent(new Event('unios:sync-completed')))
  await expect(link).toHaveAttribute('href', `/notes?id=${targetId}`)
  const renamedTarget = await page.request.put(`/api/notes/${targetId}`, {
    data: { expected_revision: 1, title: 'Umbenannte Katalogquelle', body: 'Erfundene Quelle für diese Regression.' },
  })
  expect(renamedTarget.ok()).toBeTruthy()
  await page.evaluate(() => window.dispatchEvent(new Event('unios:sync-completed')))
  await expect(unresolved).toHaveAttribute('title', 'Keine Notiz mit diesem Titel gefunden.')
  await expect(unresolved).toHaveText('[[Straße Katalogquelle]]')
  expect((await (await page.request.get(`/api/notes/${sourceId}`)).json()).body).toBe('[[Straße Katalogquelle]]')
})
