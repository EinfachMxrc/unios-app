// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T10:00:00Z') })
})

async function openReader(page: Page) {
  await page.goto('/courses/1')
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  const version = Number(new URL(page.url()).pathname.split('/').pop())
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  return version
}

test('an otherwise empty lecture records exact PDF pages and keeps multiple dates after saving and reload', async ({
  page,
}) => {
  const version = await openReader(page)
  const draft = page.locator('.reader-note-draft')
  const body = draft.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(body).toHaveText('')
  const coverage = draft.locator('.lecture-coverage-panel')
  await coverage.locator('summary').click()
  await coverage.getByLabel('Vorlesungsdatum', { exact: true }).fill('2026-10-14')
  await coverage.getByLabel('Bearbeitete PDF-Seiten', { exact: true }).fill('1-2')
  await coverage.getByRole('button', { name: 'Seiten festhalten', exact: true }).click()
  await expect(body.locator(`a[href="/material/${version}?page=1"]`)).toHaveCount(1)
  await expect(body.locator(`a[href="/material/${version}?page=2"]`)).toHaveCount(1)
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/notes') && response.request().method() === 'POST',
  )
  await draft.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  const result = await saving
  expect(result.ok()).toBeTruthy()
  const created = await result.json()
  expect(created.body).toContain('Vorlesung · 2026-10-14')
  expect(created.body).not.toContain('Kernkonzepte')
  const canvas = page.locator('.reader-continuous-note .note-canvas')
  const savedCoverage = canvas.locator('.lecture-coverage-panel')
  await savedCoverage.locator('summary').click()
  await expect(savedCoverage.getByLabel('Bearbeitete PDF-Seiten', { exact: true })).toHaveValue('1–2')
  await savedCoverage.getByLabel('Vorlesungsdatum', { exact: true }).fill('2026-10-15')
  await savedCoverage.getByLabel('Bearbeitete PDF-Seiten', { exact: true }).fill('2')
  await savedCoverage.getByRole('button', { name: 'Seiten festhalten', exact: true }).click()
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${created.note.id}`)).json()).body)
    .toContain('Vorlesung · 2026-10-15')
  await page.reload()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await expect(canvas).toContainText('Vorlesung · 2026-10-14')
  await expect(canvas).toContainText('Vorlesung · 2026-10-15')
  const detail = await (await page.request.get(`/api/notes/${created.note.id}`)).json()
  expect(detail.body).toContain(`/material/${version}?page=1`)
  expect(detail.body).toContain(`/material/${version}?page=2`)
})

test('out-of-range pages do not alter an empty lecture draft', async ({ page }) => {
  await openReader(page)
  const draft = page.locator('.reader-note-draft')
  const coverage = draft.locator('.lecture-coverage-panel')
  await coverage.locator('summary').click()
  await coverage.getByLabel('Bearbeitete PDF-Seiten', { exact: true }).fill('0, 3')
  await coverage.getByRole('button', { name: 'Seiten festhalten', exact: true }).click()
  await expect(coverage.getByRole('alert')).toContainText('Die Seiten müssen im geöffneten PDF liegen')
  await expect(draft.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toHaveText('')
})

test('Enter records lecture pages without creating a note', async ({ page }) => {
  let creates = 0
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') creates += 1
    await route.continue()
  })
  const version = await openReader(page)
  const draft = page.locator('.reader-note-draft')
  const coverage = draft.locator('.lecture-coverage-panel')
  await coverage.locator('summary').click()
  const pages = coverage.getByLabel('Bearbeitete PDF-Seiten', { exact: true })
  await pages.fill('1-2')
  await pages.press('Enter')
  await expect(
    draft
      .getByRole('textbox', { name: 'Notizinhalt', exact: true })
      .locator(`a[href="/material/${version}?page=2"]`),
  ).toHaveCount(1)
  await expect(coverage.getByRole('status')).toContainText('Seitenangaben in die Mitschrift übernommen')
  expect(creates).toBe(0)
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`lecture pages and existing note picker ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript((theme) => localStorage.setItem('unios-theme', theme), theme)
      const version = await openReader(page)
      const coverage = page.locator('.reader-note-draft .lecture-coverage-panel')
      await coverage.locator('summary').click()
      await coverage.getByLabel('Bearbeitete PDF-Seiten', { exact: true }).fill('1-2')
      await expect(coverage.getByRole('button', { name: 'Seiten festhalten', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: screenshotPath(`../docs/qa/lecture-notes-20261014/coverage-${theme}-${width}.png`),
      })
      const material = await (await page.request.get(`/api/material/${version}`)).json()
      const title = `Vorlesung vom 12.10. · ${theme} ${width}`
      const created = await page.request.post('/api/notes', {
        data: {
          course_id: material.course_id,
          resource_id: material.resource_id,
          title,
          body: 'Meine frühere Erklärung zum Basisfall.',
        },
      })
      expect(created.ok()).toBeTruthy()
      await page.getByRole('button', { name: 'Mitschrift öffnen', exact: true }).click()
      const picker = page.getByRole('region', { name: 'Vorhandene Mitschrift auswählen', exact: true })
      await expect(picker.getByRole('searchbox')).toBeVisible()
      await expect(picker.getByRole('button', { name: new RegExp(title) })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: screenshotPath(`../docs/qa/lecture-notes-20261014/picker-${theme}-${width}.png`) })
    })
  }
}
