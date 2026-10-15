// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('AI explanation returns to a marked question only after review', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })))
  await page.goto('/courses')
  await page.locator('.course-list-row').filter({ hasText: 'Programmieren 1' }).click()
  const resource = page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
  await resource.getByRole('link', { name: 'PDF öffnen' }).click()
  const versionId = Number(new URL(page.url()).pathname.split('/').pop())
  const created = await page.request.post(`/api/material/${versionId}/annotations`, { data: {
    kind: 'question', quote: 'Schleifen und Python Beispiele', page: 1,
    comment: 'Warum endet die Schleife?',
  } })
  expect(created.ok()).toBeTruthy()
  const questionId = (await created.json()).id as string

  await page.goto('/more')
  await page.locator('.more-tools > summary').click()
  await page.getByRole('link', { name: 'KI-Erklärungen' }).click()
  await expect(page.getByRole('heading', { name: 'KI-Erklärungen' })).toBeVisible()
  await page.getByRole('textbox', { name: 'JSON-Antwort aus einem Fragenpaket einfügen' }).fill(JSON.stringify({
    schema_version: 1, generated_by: 'fixture', generated_at: new Date().toISOString(),
    explanations: [{ question_id: questionId, answer: 'Die Bedingung wird falsch.' }],
  }))
  await page.getByRole('button', { name: 'Erklärungen prüfen' }).click()
  await expect(page.getByText('Warum endet die Schleife?')).toBeVisible()
  await page.goto('/learning')
  await expect(page.getByText('Die Bedingung wird falsch.')).toHaveCount(0)
  await page.goto('/explanations')
  await page.getByRole('button', { name: 'Freigeben' }).click()
  await page.goto('/learning')
  await expect(page.getByText('Geprüfte KI-Erklärung')).toBeVisible()
  await expect(page.getByText('Die Bedingung wird falsch.')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
