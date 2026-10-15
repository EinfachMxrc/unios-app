// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('approved exercise can be answered and reviewed on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const detail = await (await page.request.get('/api/courses/1')).json()
  const resource = detail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = detail.versions[resource.id][0].version
  const payload = {
    schema_version: 1,
    generated_by: 'browser-test',
    generated_at: new Date().toISOString(),
    source: { resource_id: resource.id, version },
    exercises: [
      {
        question: 'Warum endet eine while-Schleife?',
        topic: 'Schleifen',
        difficulty: 'easy',
        sample_solution: 'Weil ihre Bedingung falsch wird.',
        solution_steps: 'Bedingung vor jedem Durchlauf prüfen.',
        source_page: 1,
      },
    ],
  }
  const created = await page.request.post('/api/ai/exercises/import', { data: payload })
  expect(created.ok()).toBeTruthy()
  const item = (await created.json())[0]
  await page.goto('/learning')
  await expect(page.getByText('Warum endet eine while-Schleife?')).toHaveCount(0)
  const approved = await page.request.put(`/api/ai/exercises/${item.id}`, {
    data: { ...payload.exercises[0], status: 'approved' },
  })
  expect(approved.ok()).toBeTruthy()
  await page.reload()
  const row = page.locator('.data-row').filter({ hasText: 'Warum endet eine while-Schleife?' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Weil ihre Bedingung falsch wird.')).toHaveCount(0)
  await row.getByRole('button', { name: 'Aufgabe üben' }).click()
  await row.getByRole('textbox', { name: 'Deine Antwort' }).fill('Die Bedingung wird falsch.')
  await row.getByRole('button', { name: 'Lösung ansehen' }).click()
  await expect(row.getByText('Weil ihre Bedingung falsch wird.')).toBeVisible()
  await row.getByRole('button', { name: 'Richtig · speichern' }).click()
  await expect(page.getByText('Versuch gespeichert.')).toBeVisible()
  await expect(row.getByText('Deine Antwort: Die Bedingung wird falsch.')).toBeVisible()
  const history = await (await page.request.get('/api/learning/practice/history')).json()
  expect(history[0].correct).toBe(true)
  expect(history[0].duration_seconds).toBeGreaterThanOrEqual(0)
})
