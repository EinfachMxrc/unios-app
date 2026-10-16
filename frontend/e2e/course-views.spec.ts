// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { emptyConfig } from '../src/pages/collections/collectionModel'

async function seed(page: Page) {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const noteResponse = await page.request.post('/api/notes', {
    data: {
      course_id: 1,
      title: 'Meine Zusammenfassung',
      body: '## Die Grundidee\n\nMeine eigene Erklärung aus dem Kurs.',
    },
  })
  expect(noteResponse.ok()).toBeTruthy()
  const note = (await noteResponse.json()).note
  async function collection(name: string, kind: 'notes' | 'materials', courseId: number) {
    const response = await page.request.post('/api/collections', {
      data: { name, config: { ...emptyConfig, kind, course_id: courseId, max_percent: null, sort: 'title' } },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  const notes = await collection('Meine Kursnotizen', 'notes', 1)
  const materials = await collection('Meine Unterlagen', 'materials', 1)
  const foreign = await collection('Anderer Kurs', 'notes', 2)
  return { note, notes, materials, foreign }
}

async function openViews(page: Page) {
  await page.goto('/courses/1')
  await page.locator('.course-tabs').getByRole('link', { name: 'Ansichten', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Gespeicherte Ansichten', exact: true })).toBeVisible()
}

test('course views keep shared filters and open notes in a side preview without leaving the course', async ({
  page,
}) => {
  const { note, notes, foreign } = await seed(page)
  await openViews(page)
  const picker = page.locator('.course-collection-picker select')
  await picker.selectOption(String(notes.id))
  await expect(picker.locator('option', { hasText: foreign.name })).toHaveCount(0)
  const preview = page.getByRole('button', { name: `Vorschau: ${note.title}`, exact: true })
  await preview.click()
  const dialog = page.getByRole('dialog', { name: `Vorschau: ${note.title}`, exact: true })
  await expect(dialog.getByText('Meine eigene Erklärung aus dem Kurs.', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/courses\/1$/)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(preview).toBeFocused()
  await page.locator('.course-collection-toolbar select').selectOption('table')
  await expect(page.locator('.collection-table')).toBeVisible()
  await page.reload()
  await expect(picker).toHaveValue(String(notes.id))
  await expect(page.locator('.collection-table')).toBeVisible()
  await page.getByRole('link', { name: 'Ansicht verwalten', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/collections\\?id=${notes.id}$`))
  await page.getByText('Filter und Ansicht anpassen').click()
  await expect(page.getByRole('textbox', { name: 'Name der Ansicht' })).toHaveValue(notes.name)
  expect(
    (await (await page.request.get('/api/collections')).json()).find((item: { id: number }) => item.id === notes.id)
      .config.view,
  ).toBe('list')
})

test('a PDF preview renders real pages and can open its source in another workspace tab', async ({ page }) => {
  const { materials } = await seed(page)
  await openViews(page)
  await page.locator('.course-collection-picker select').selectOption(String(materials.id))
  await page.locator('.collection-preview-button').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.react-pdf__Page canvas')).toBeVisible()
  await dialog.getByRole('button', { name: 'In neuem Tab öffnen', exact: true }).click()
  await expect(page).toHaveURL(/\/material\/\d+$/)
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2)
  await page.locator('[data-workspace-tab]').first().click()
  await expect(page).toHaveURL(/\/courses\/1$/)
  await expect(page.locator('.course-collection-picker select')).toHaveValue(String(materials.id))
})

test('an empty course view offers a course-scoped collection and handles an unavailable catalog locally', async ({
  page,
}) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  await openViews(page)
  await page.getByRole('link', { name: 'Ansicht für diesen Kurs erstellen', exact: true }).click()
  await expect(page).toHaveURL(/\/collections\?course_id=1$/)
  await expect(page.locator('.collections-builder').getByRole('combobox', { name: /^Kurs/ })).toHaveValue('1')
  await page.route('**/api/collections', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Synthetisch nicht verfügbar' } }),
  )
  await page.goto('/courses/1')
  await page.locator('.course-tabs').getByRole('link', { name: 'Ansichten', exact: true }).click()
  await expect(page.locator('.course-collections').getByRole('alert')).toBeVisible()
  await expect(page.locator('main > .page-heading h1')).toHaveText('Programmieren 1')
})

for (const width of [1440, 390]) {
  test(`inline views and side preview fit at ${width}px in both themes`, async ({ page }) => {
    const { note, notes } = await seed(page)
    await page.setViewportSize({ width, height: 960 })
    await openViews(page)
    await page.locator('.course-collection-picker select').selectOption(String(notes.id))
    const directory = path.resolve('..', 'docs/qa/notion-course-views-20261016')
    await mkdir(directory, { recursive: true })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: path.join(directory, `views-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      await page.getByRole('button', { name: `Vorschau: ${note.title}`, exact: true }).click()
      await expect(
        page.getByRole('dialog').getByText('Meine eigene Erklärung aus dem Kurs.', { exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
      await page.screenshot({
        path: path.join(directory, `preview-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      await page.getByRole('button', { name: 'Vorschau schließen', exact: true }).click()
    }
  })
}
