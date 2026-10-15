// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

async function createTopic(page: import('@playwright/test').Page, topic: string, question: string) {
  const detail = await (await page.request.get('/api/courses/1')).json()
  const resource = detail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = detail.versions[resource.id][0].version
  const payload = {
    schema_version: 1, generated_by: 'browser-test', generated_at: new Date().toISOString(),
    source: { resource_id: resource.id, version },
    exercises: [{ question, topic, difficulty: 'easy',
      sample_solution: 'Antwort.', solution_steps: 'Schritt.', source_page: 1 }],
  }
  const created = await page.request.post('/api/ai/exercises/import', { data: payload })
  const item = (await created.json())[0]
  await page.request.put(`/api/ai/exercises/${item.id}`, { data: { ...payload.exercises[0], status: 'approved' } })
  // A topic only appears in the learning-status list once it has an attempt
  // (see frontend/e2e/learning-status.spec.ts), so practice it once here.
  await page.request.post(`/api/learning/practice/${item.id}/attempt`, {
    data: { answer: 'Antwort.', correct: true, duration_seconds: 5 },
  })
}

test('merging a topic folds it into the target and removes the duplicate row', async ({ page }) => {
  await createTopic(page, 'Merge-Quelle', 'Was ist eine Quelle-Frage?')
  await createTopic(page, 'Merge-Ziel', 'Was ist eine Ziel-Frage?')
  await page.goto('/learning')

  const sourceRow = page.locator('.data-row').filter({ hasText: 'Kartenbehaltensrate' }).filter({ hasText: 'Merge-Quelle' })
  await expect(sourceRow).toBeVisible()
  await sourceRow.getByRole('button', { name: 'Zusammenführen…' }).click()
  await sourceRow.getByLabel('Ziel für „Merge-Quelle" wählen').selectOption({ label: 'Merge-Ziel' })
  await sourceRow.getByRole('button', { name: 'Zusammenführen bestätigen' }).click()

  await expect(page.locator('.data-row').filter({ hasText: 'Kartenbehaltensrate' }).filter({ hasText: 'Merge-Quelle' })).toHaveCount(0)
  await expect(page.locator('.data-row').filter({ hasText: 'Kartenbehaltensrate' }).filter({ hasText: 'Merge-Ziel' })).toBeVisible()
})

test('a backend error while merging is shown instead of silently failing', async ({ page }) => {
  await createTopic(page, 'Merge-Fehlerfall-A', 'Was ist Fehlerfall A?')
  await createTopic(page, 'Merge-Fehlerfall-B', 'Was ist Fehlerfall B?')
  await page.goto('/learning')
  await page.route('**/api/learning/topics/*/merge', async (route) => {
    await route.fulfill({ status: 422, json: { detail: 'Themen gehören zu unterschiedlichen Kursen' } })
  })
  const row = page.locator('.data-row').filter({ hasText: 'Kartenbehaltensrate' }).filter({ hasText: 'Merge-Fehlerfall-A' })
  await row.getByRole('button', { name: 'Zusammenführen…' }).click()
  await row.getByLabel('Ziel für „Merge-Fehlerfall-A" wählen').selectOption({ label: 'Merge-Fehlerfall-B' })
  await row.getByRole('button', { name: 'Zusammenführen bestätigen' }).click()
  await expect(row.getByText('Themen gehören zu unterschiedlichen Kursen')).toBeVisible()
  // The row is still there: a failed merge must not silently remove anything.
  await expect(row).toBeVisible()
})
