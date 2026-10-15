// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('Erwähnung wird per Klick zu einem versionierten Rückverweis', async ({ page }) => {
  const courses = await (await page.request.get('/api/courses')).json()
  const courseId = courses.courses.find((item: { name: string }) => item.name === 'Programmieren 1').id
  const target = await page.request.post('/api/notes', { data: {
    course_id: courseId, title: 'Stapelrekursion', body: 'Basisfall und rekursiver Aufruf.',
  } })
  expect(target.ok()).toBeTruthy()
  const targetId = (await target.json()).note.id
  const source = await page.request.post('/api/notes', { data: {
    course_id: courseId, title: 'Vorlesung zur Rekursion', body: 'Heute haben wir Stapelrekursion verwendet.',
  } })
  expect(source.ok()).toBeTruthy()
  const sourceId = (await source.json()).note.id

  await page.goto(`/notes?id=${targetId}`)
  await page.locator('.note-context-details > summary').click()
  const references = page.getByRole('region', { name: 'Verweise auf diese Notiz' })
  await expect(references.getByText('Ohne Link erwähnt')).toBeVisible()
  await expect(references.getByText('Heute haben wir Stapelrekursion verwendet.')).toBeVisible()
  await references.getByRole('button', { name: 'Verknüpfen' }).click()
  await expect(references.getByText('Keine unverknüpften Erwähnungen.')).toBeVisible()
  await page.goto(`/notes?id=${sourceId}`)
  const wiki = page.locator('.rendered-note').getByRole('link', { name: 'Stapelrekursion' })
  await expect(wiki).toBeVisible()
  await wiki.hover()
  const preview = page.getByRole('dialog', { name: 'Vorschau: Stapelrekursion' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Basisfall und rekursiver Aufruf.')).toBeVisible()
  await expect(preview.getByText('Noch kein gleichnamiges Lernthema vorhanden.')).toBeVisible()
  await expect(page.getByText('Version 2', { exact: false }).first()).toBeVisible()
  await preview.getByRole('link', { name: 'Notiz öffnen' }).click()
  await expect(page).toHaveURL(new RegExp(`id=${targetId}`))
})
