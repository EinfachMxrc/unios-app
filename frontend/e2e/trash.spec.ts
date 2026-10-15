// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('a deleted note can be undone, found in the trash and erased for good', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, resource_id: null, title: 'Papierkorb Probe', body: 'Ein Satz über Wegwerfgedanken.' },
  })
  expect(created.ok()).toBeTruthy()
  const { note } = await created.json()

  await page.goto(`/notes?id=${note.id}`)
  await page.getByRole('button', { name: '„Papierkorb Probe“ in den Papierkorb legen' }).click()
  const undo = page.getByRole('status').filter({ hasText: '„Papierkorb Probe“ liegt im Papierkorb.' })
  await expect(undo).toBeVisible()
  await expect(page.locator('.note-list-item', { hasText: 'Papierkorb Probe' })).toHaveCount(0)

  // Undo brings it straight back and opens it again.
  await undo.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(page.getByRole('heading', { name: 'Papierkorb Probe' })).toBeVisible()
  await expect(page.locator('.note-list-item', { hasText: 'Papierkorb Probe' })).toHaveCount(1)

  // Deleted again, it waits in the trash until it is erased.
  await page.getByRole('button', { name: '„Papierkorb Probe“ in den Papierkorb legen' }).click()
  await page.getByRole('link', { name: 'Papierkorb öffnen' }).click()
  await expect(page).toHaveURL(/\/trash$/)
  const row = page.getByRole('listitem').filter({ hasText: 'Papierkorb Probe' })
  await expect(row).toContainText('Notiz')
  const search = await (await page.request.get('/api/search?q=Wegwerfgedanken')).json()
  expect(search.note_results).toEqual([])

  await row.getByRole('button', { name: 'Endgültig löschen' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Endgültig löschen?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByText('„Papierkorb Probe“ ist endgültig gelöscht.')).toBeVisible()
  await expect(row).toHaveCount(0)
  expect((await page.request.get(`/api/notes/${note.id}`)).status()).toBe(404)
})

test('quick notes go to the same trash and come back from there', async ({ page }) => {
  const id = crypto.randomUUID()
  const saved = await page.request.post('/api/jots', {
    data: { id, kind: 'todo', body: 'Bibliotheksbuch zurückgeben', created_at: new Date().toISOString() },
  })
  expect(saved.ok()).toBeTruthy()
  await page.goto('/jots')
  await page.getByRole('button', { name: '„Bibliotheksbuch zurückgeben“ in den Papierkorb legen' }).click()
  await expect(page.getByText('„Bibliotheksbuch zurückgeben“ liegt im Papierkorb.')).toBeVisible()
  await expect(page.locator('.jot-body', { hasText: 'Bibliotheksbuch zurückgeben' })).toHaveCount(0)

  await page.goto('/more')
  await page.getByRole('link', { name: 'Papierkorb' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Bibliotheksbuch zurückgeben' })
  await expect(row).toContainText('Schnellnotiz')
  await row.getByRole('button', { name: 'Wiederherstellen' }).click()
  await expect(page.getByText('„Bibliotheksbuch zurückgeben“ ist wiederhergestellt.')).toBeVisible()
  await page.goto('/jots')
  await expect(page.locator('.jot-body', { hasText: 'Bibliotheksbuch zurückgeben' })).toBeVisible()
})
