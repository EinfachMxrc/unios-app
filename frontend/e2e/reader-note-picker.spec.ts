// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Page } from '@playwright/test'
import type { Material, NoteDetail } from '../src/types'
import { expect, test } from './fixtures'

async function reader(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/courses/1')
  const link = page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
  const version = Number((await link.getAttribute('href'))!.split('/').pop())
  await link.click()
  await expect(page.locator('[data-material-page="1"] canvas').first()).toBeVisible()
  const response = await page.request.get(`/api/material/${version}`)
  expect(response.ok()).toBeTruthy()
  const material = (await response.json()) as Material
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  return material
}

async function note(page: Page, material: Material, title: string, linked = true) {
  const response = await page.request.post('/api/notes', {
    data: {
      course_id: material.course_id,
      resource_id: linked ? material.resource_id : null,
      title,
      body: `${title}: eigene Erklärung`,
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json() as Promise<NoteDetail>
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
})

test('existing notes open beside the PDF, preserve a draft and resume after a new browser context', async ({
  page,
  browser,
}) => {
  const material = await reader(page)
  const older = await note(page, material, 'Frühere Vorlesung')
  const newer = await note(page, material, 'Neuere Kursnotiz', false)
  const draft = page.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await draft.fill('Meine neue ungespeicherte Mitschrift')
  await page.getByRole('button', { name: 'Mitschrift öffnen', exact: true }).click()
  const picker = page.getByRole('region', { name: 'Vorhandene Mitschrift auswählen', exact: true })
  await expect(picker).toContainText('Frühere Vorlesung')
  await expect(picker).toContainText('Neuere Kursnotiz')
  const choices = picker.locator('.reader-note-picker-list button')
  await expect(choices.first()).toContainText('Zu dieser PDF')
  await picker.getByRole('button', { name: /Neuere Kursnotiz/ }).click()
  await expect(page.locator('.reader-continuous-note .note-title-input')).toHaveValue(newer.note.title)
  // React-PDF can retain the previous canvas briefly while resizing beside a note.
  await expect(page.locator('[data-material-page="1"] canvas').first()).toBeVisible()
  await page.getByRole('button', { name: 'Neue Mitschrift', exact: true }).click()
  await expect(draft).toHaveValue('Meine neue ungespeicherte Mitschrift')
  await page.getByRole('button', { name: 'Mitschrift öffnen', exact: true }).click()
  await picker.getByRole('button', { name: /Frühere Vorlesung/ }).click()
  const canvas = page.locator('.reader-continuous-note .note-canvas')
  await canvas.getByRole('button', { name: 'Markdown', exact: true }).click()
  const content = canvas.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  const body = `${older.body}\n\nHeute weitergeschrieben.`
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/notes/${older.note.id}`) &&
      response.request().method() === 'PUT' &&
      response.request().postDataJSON().body === body,
  )
  await content.fill(body)
  expect((await saved).ok()).toBeTruthy()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('unios-source-note-targets-v1')))
    .toContain(older.note.id)
  // A fresh context has no sessionStorage or module RAM, like closing the app for an update.
  const storageState = await page.context().storageState({ indexedDB: true })
  const restarted = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } })
  try {
    const next = await restarted.newPage()
    await next.goto(`/material/${material.version_id}`)
    await expect(next.locator('[data-material-page="1"] canvas').first()).toBeVisible()
    await next.getByRole('button', { name: 'Mitschrift', exact: true }).click()
    await expect(next.locator('.reader-continuous-note .note-title-input')).toHaveValue(older.note.title)
    const nextCanvas = next.locator('.reader-continuous-note .note-canvas')
    await nextCanvas.getByRole('button', { name: 'Markdown', exact: true }).click()
    await expect(nextCanvas.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toHaveValue(body)
    const detail = (await (await next.request.get(`/api/notes/${older.note.id}`)).json()) as NoteDetail
    expect(detail.note.current_revision).toBeGreaterThan(older.note.current_revision)
    expect(detail.body).toBe(body)
  } finally {
    await restarted.close()
  }
})

test('a missing older note leaves the picker available to choose another note', async ({ page }) => {
  const material = await reader(page)
  const available = await note(page, material, 'Verfügbare Mitschrift')
  const missing = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  await page.route('**/api/notes?*', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('course_id') !== String(material.course_id) || url.searchParams.get('limit') !== '20')
      return route.continue()
    await route.fulfill({
      json: {
        notes: [{ ...available.note, id: missing, title: 'Verschwundene Mitschrift' }, available.note],
        courses: [],
      },
    })
  })
  await page.route(`**/api/notes/${missing}`, (route) =>
    route.fulfill({ status: 404, json: { detail: 'Notiz nicht gefunden' } }),
  )
  await page.getByRole('button', { name: 'Mitschrift öffnen', exact: true }).click()
  const picker = page.getByRole('region', { name: 'Vorhandene Mitschrift auswählen', exact: true })
  await picker.getByRole('button', { name: /Verschwundene Mitschrift/ }).click()
  await expect(page.locator('.reader-continuous-note')).toContainText('Notiz nicht gefunden')
  await expect(page.locator('.reader-continuous-note .note-canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mitschrift öffnen', exact: true }).click()
  await picker.getByRole('button', { name: /Verfügbare Mitschrift/ }).click()
  await expect(page.locator('.reader-continuous-note .note-title-input')).toHaveValue(available.note.title)
  await expect(page.locator('[data-material-page="1"] canvas').first()).toBeVisible()
})
