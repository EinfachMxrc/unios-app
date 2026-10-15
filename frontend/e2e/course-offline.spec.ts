// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from './fixtures'

test('explicit course preparation survives a reload and opens saved PDFs and note text without a connection', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  const course = await (await page.request.get('/api/courses/1')).json()
  const pdf = course.resources.find(
    (resource: { id: number; group_category: string; filename?: string }) =>
      resource.group_category !== 'other_group' &&
      course.versions[resource.id]?.[0] &&
      (course.versions[resource.id][0].mime_type === 'application/pdf' || /\.pdf$/i.test(resource.filename ?? '')),
  )
  expect(pdf).toBeTruthy()
  const versionId = course.versions[pdf.id][0].id
  const created = await page.request.post('/api/notes', {
    data: {
      course_id: 1,
      title: 'Synthetic offline course note',
      body: '# Offline source\n\nSynthetic saved note text.',
    },
  })
  expect(created.ok()).toBeTruthy()
  const noteId = (await created.json()).note.id
  const notes = await (await page.request.get('/api/notes?course_id=1')).json()
  await page.goto('/courses/1')
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const preparation = page.locator('.course-offline')
  await preparation.locator('summary').click()
  const prepare = preparation.getByRole('button', { name: 'PDFs und Notiztexte vorbereiten', exact: true })
  await expect(prepare).toBeEnabled()
  await prepare.click()
  await expect(prepare).toBeEnabled({ timeout: 30_000 })
  await expect(preparation).toContainText('Zuletzt vorbereitet:')
  await expect(preparation).toContainText(`${notes.notes.length} von ${notes.notes.length} gespeichert`)
  await expect(preparation).toContainText(
    'Notizbilder, externe Links, Übungen und der gesamte Kartenbestand sind damit nicht vorbereitet.',
  )
  await page.reload()
  await preparation.locator('summary').click()
  await expect(preparation).toContainText('Zuletzt vorbereitet:')
  await context.setOffline(true)
  try {
    await page.goto(`/material/${versionId}`)
    await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible()
    await page.reload()
    await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible()
    await page.goto(`/notes?id=${noteId}`)
    await expect(page.getByText('Synthetic saved note text.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Synthetic saved note text.', { exact: true })).toBeVisible()
    await page.goto('/courses/1')
    await preparation.locator('summary').click()
    await expect(prepare).toBeDisabled()
    await expect(preparation).toContainText('Zum Vorbereiten brauchst du eine Verbindung.')
  } finally {
    await context.setOffline(false)
  }
})
