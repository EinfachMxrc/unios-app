// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test('full-text search finds the right PDF page and respects course filters', async ({ page }) => {
  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Rekursionstiefe')
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page).toHaveURL(/q=Rekursionstiefe/)

  const result = page.locator('.search-result').filter({ hasText: '04_Schleifen.pdf' }).filter({ hasText: 'Version 1' })
  await expect(result).toHaveCount(1)
  await expect(result).toContainText('Seite/Folie 2')
  await expect(result).toContainText('Rekursionstiefe')
  const markdownLink = result.getByRole('link', { name: /Markdown öffnen/ })
  const markdownPath = await markdownLink.getAttribute('href')
  expect(markdownPath).toBeTruthy()
  const markdown = await page.request.get(markdownPath!)
  expect(markdown.ok()).toBeTruthy()
  expect(await markdown.text()).toContain('## Seite 2')

  await page.getByLabel('Kurs filtern').selectOption({ label: 'Mathematik' })
  await expect(page.getByText('Keine Treffer')).toBeVisible()
  await page.getByLabel('Kurs filtern').selectOption({ label: 'Alle Kurse' })
  await expect(result).toHaveCount(1)

  const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase2')
  await mkdir(output, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 850 })
      await page.reload()
      await expect(result).toContainText('Seite/Folie 2')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(path.join(output, `search-results-${theme}-${width}.png`)), fullPage: true })
    }
  }
})

test('search finds a question and course text with type filters', async ({ page }) => {
  await page.goto('/courses/1')
  const href = await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .getAttribute('href')
  const versionId = Number(href?.split('/').pop())
  expect(versionId).toBeGreaterThan(0)
  const mark = await page.request.post(`/api/material/${versionId}/annotations`, {
    data: {
      kind: 'question',
      quote: 'Schleifen und Python Beispiele',
      page: 1,
      comment: 'Nuancenfrage zur Schleife',
    },
  })
  expect(mark.ok()).toBeTruthy()
  const material = await (await page.request.get('/api/courses/1/material')).json()
  const saved = await page.request.put('/api/courses/1/material/scratchpad', {
    data: {
      expected_revision: material.scratchpad_revision,
      body: 'Sprechstundenfrage Mittwoch',
    },
  })
  expect(saved.ok()).toBeTruthy()
  const indexed = await (await page.request.get('/api/search?q=Sprechstundenfrage')).json()
  expect(indexed.course_note_results).toHaveLength(1)

  await page.goto('/search?q=Nuancenfrage')
  await expect(page.getByRole('heading', { name: 'Markierungen und Fragen' })).toBeVisible()
  const result = page.locator('.search-result').filter({ hasText: 'Nuancenfrage' })
  await expect(result).toContainText('04_Schleifen.pdf')
  await expect(result).toContainText('Seite 1')
  await page.getByLabel('Art filtern').selectOption('annotation')
  await expect(page).toHaveURL(/type=annotation/)
  await expect(result).toHaveCount(1)
  await page.getByLabel('Kurs filtern').selectOption({ label: 'Mathematik' })
  await expect(page.getByText('Keine Treffer')).toBeVisible()
  await page.getByLabel('Kurs filtern').selectOption({ label: 'Alle Kurse' })
  await expect(page).not.toHaveURL(/course_id=/)

  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Sprechstundenfrage')
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page).toHaveURL(/q=Sprechstundenfrage/)
  await page.getByLabel('Art filtern').selectOption('course_note')
  await expect(page.getByRole('heading', { name: 'Kursnotizen' })).toBeVisible()
  await expect(page.locator('.search-result').filter({ hasText: 'Sprechstundenfrage' })).toContainText(
    'Programmieren 1',
  )
})
