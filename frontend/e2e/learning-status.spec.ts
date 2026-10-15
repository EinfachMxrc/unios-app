// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('a practiced exercise appears as a topic in the learning status panel', async ({ page }) => {
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
        question: 'Wie oft läuft die Schleife?',
        topic: 'Lernstand-Test-Thema',
        difficulty: 'easy',
        sample_solution: 'Bis die Bedingung falsch wird.',
        solution_steps: 'Bedingung prüfen.',
        source_page: 1,
      },
    ],
  }
  const created = await page.request.post('/api/ai/exercises/import', { data: payload })
  const item = (await created.json())[0]
  await page.request.put(`/api/ai/exercises/${item.id}`, { data: { ...payload.exercises[0], status: 'approved' } })

  await page.goto('/learning')
  const row = page.locator('.data-row').filter({ hasText: 'Wie oft läuft die Schleife?' })
  await row.getByRole('button', { name: 'Aufgabe üben' }).click()
  await row.getByRole('textbox', { name: 'Deine Antwort' }).fill('Bis die Bedingung falsch wird.')
  await row.getByRole('button', { name: 'Lösung ansehen' }).click()
  await row.getByRole('button', { name: 'Richtig · speichern' }).click()
  await expect(page.getByText('Versuch gespeichert.')).toBeVisible()

  await page.reload()
  const topicRow = page
    .locator('.data-row')
    .filter({ hasText: 'Kartenbehaltensrate' })
    .filter({ hasText: 'Lernstand-Test-Thema' })
  await expect(topicRow).toBeVisible()
  await expect(topicRow).toContainText('Übungs-Trefferquote: Zu wenig Daten (1 Versuche)')
  await page.getByLabel('Kurs für Lernmodul').selectOption('1')
  await page.getByLabel('Neues Lernmodul').fill('Kontrollstrukturen')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await topicRow.getByLabel('Lernmodul').selectOption({ label: 'Kontrollstrukturen' })
  await expect(page.getByRole('heading', { name: 'Kontrollstrukturen' })).toBeVisible()
  await expect(page.getByText('1 Themen · 0 mit Messwert')).toBeVisible()
})
