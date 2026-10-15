// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('Notiz bekommt Tags und erscheint in einer gefilterten Sammlung', async ({ page }) => {
  await page.goto('/notes?new=1&course_id=1&title=Markierte%20Vorlesung')
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notizinhalt' }).fill('## Rekursion\n\nDieses Thema wird geprüft.')
  await page.getByRole('button', { name: 'Notiz anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Markierte Vorlesung' })).toBeVisible()
  await page.locator('.note-context-details > summary').click()
  // "Tags & Eigenschaften" is nested inside the collapsed "Kontext & Eigenschaften"
  // <details> (see EntityProperties.tsx, which only renders its body — including
  // the MetadataEditor — once opened), so that outer panel must be expanded first.
  await page.getByText('Kontext & Eigenschaften', { exact: true }).click()
  await page.getByText('Tags & Eigenschaften', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Tags, mit Komma getrennt' }).fill('#Prüfung, #Nacharbeiten')
  await page.getByRole('combobox', { name: 'Priorität' }).selectOption('high')
  await page.getByRole('combobox', { name: 'Prüfungsrelevant' }).selectOption('true')
  await page.getByRole('button', { name: 'Eigenschaften speichern' }).click()
  // The "Notiz angelegt." toast from creating the note can still be visible,
  // so scope to the metadata editor's own status message specifically.
  await expect(page.getByRole('status').filter({ hasText: 'Eigenschaften gespeichert' })).toBeVisible()
  await page.getByText('Aktivität', { exact: true }).click()
  await expect(page.getByText('Notizversion gespeichert')).toBeVisible()
  await expect(page.getByText('Quelle: Lokale Notiz')).toBeVisible()
  await page.screenshot({ path: screenshotPath('test-results/note-activity-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('test-results/note-activity-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.setViewportSize({ width: 1280, height: 720 })
  const noteId = new URL(page.url()).searchParams.get('id')
  expect(noteId).toBeTruthy()
  const metadata = await (await page.request.get(`/api/metadata/note/${noteId}`)).json()
  expect(metadata.tags).toContain('prüfung')
  expect(metadata.priority).toBe('high')
  const filtered = await (
    await page.request.get('/api/collections/preview?kind=notes&tag=prüfung&priority=high')
  ).json()
  expect(filtered.total).toBe(1)
  await page.goto('/collections')
  await page.getByText('Filter und Ansicht anpassen', { exact: false }).click()
  await page.getByRole('combobox', { name: 'Inhalte' }).selectOption('notes')
  await page.getByText('Tags & Eigenschaften filtern').click()
  await page.getByRole('textbox', { name: 'Tag' }).fill('prüfung')
  await page.getByRole('combobox', { name: 'Priorität' }).selectOption('high')
  await page.getByRole('button', { name: 'Ergebnisse anzeigen' }).click()
  await expect(page.getByRole('link', { name: 'Markierte Vorlesung' })).toBeVisible()
  await page.screenshot({ path: screenshotPath('test-results/metadata-collections-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('test-results/metadata-collections-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})
