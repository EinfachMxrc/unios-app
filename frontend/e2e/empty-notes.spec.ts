// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'
import { writeNote } from './noteEditor'

test('a named blank lecture note is explicitly created and later filled without losing its empty revision', async ({
  page,
}, testInfo) => {
  let creates = 0
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') creates += 1
    await route.continue()
  })
  await page.goto('/notes?new=1&course_id=1&title=Leere%20Vorlesung')
  const composition = page.locator('.note-new-canvas').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(composition).toHaveText('')
  await expect(page.getByRole('button', { name: 'Vorlesungsmitschrift', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Notiz anlegen', exact: true })).toBeEnabled()
  expect(creates).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('blank-note-ready.png'), fullPage: true })
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/notes') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  const created = await saving
  expect(created.ok(), await created.text()).toBeTruthy()
  expect(created.request().postDataJSON().document.blocks).toEqual([])
  const detail = await created.json()
  const noteId = detail.note.id
  expect(detail.body).toBe('')
  expect(detail.note.current_revision).toBe(1)
  await expect(page).toHaveURL(new RegExp(`/notes\\?[^#]*id=${noteId}`))
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const content = '## Spätere eigene Erklärung\n\nEin Basisfall beendet die Rekursion.'
  await writeNote(page, ['## Spätere eigene Erklärung', 'Ein Basisfall beendet die Rekursion.'])
  await expect.poll(async () => (await (await page.request.get(`/api/notes/${noteId}`)).json()).body).toBe(content)
  await writeNote(page, [])
  await expect
    .poll(async () => {
      const latest = await (await page.request.get(`/api/notes/${noteId}`)).json()
      return { body: latest.body, revision: latest.note.current_revision }
    })
    .toEqual({ body: '', revision: 3 })
  expect((await (await page.request.get(`/api/notes/${noteId}?revision=1`)).json()).body).toBe('')
  expect((await (await page.request.get(`/api/notes/${noteId}?revision=2`)).json()).body).toBe(content)
  expect(creates).toBe(1)
})

test('opening an empty PDF composition never creates a note until its create button is used', async ({ page }) => {
  let creates = 0
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') creates += 1
    await route.continue()
  })
  await page.goto('/courses/1')
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  const composition = page.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(composition).toHaveText('')
  expect(creates).toBe(0)
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  await expect(page.locator('.reader-continuous-note .note-canvas')).toBeVisible()
  expect(creates).toBe(1)
})
