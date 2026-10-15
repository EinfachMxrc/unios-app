// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('exercise package returns proposals that need explicit approval', async ({ page }) => {
  const detail = await (await page.request.get('/api/courses/1')).json()
  const resource = detail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = detail.versions[resource.id][0].version
  const initialCards = (await (await page.request.get('/api/anki/queue')).json()).length
  const payload = {
    schema_version: 1,
    generated_by: 'browser-test',
    generated_at: new Date().toISOString(),
    source: { resource_id: resource.id, version },
    exercises: [
      {
        question: 'Erkläre eine while-Schleife.',
        topic: 'schleifen',
        difficulty: 'easy',
        sample_solution: 'Sie wiederholt einen Block.',
        solution_steps: 'Bedingung prüfen, Block ausführen, erneut prüfen.',
        source_page: 1,
      },
    ],
  }

  await page.goto('/more')
  await expect(page.getByRole('link', { name: 'Übungsaufgaben' })).toHaveCount(0)
  await page.getByRole('main').getByRole('link', { name: 'Einstellungen' }).click()
  await page.getByRole('switch', { name: 'KI und Lernvorschläge' }).click()
  await page.goto('/more')
  await page.locator('.more-tools > summary').click()
  await page.getByRole('link', { name: 'KI-Paket' }).click()
  const materialAccess = page.getByRole('checkbox', { name: 'Kursmaterial für KI-Pakete freigeben' })
  if (!(await materialAccess.isChecked())) await materialAccess.check()
  await page.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Übungsaufgaben vorschlagen' }).click()
  expect((await download).suggestedFilename()).toMatch(/ki-exercises-kurs-\d+\.zip/)

  await page.goto('/more')
  await page.locator('.more-tools > summary').click()
  await page.getByRole('link', { name: 'Übungsaufgaben' }).click()
  await page.locator('details > summary').filter({ hasText: 'Vorschläge importieren' }).click()
  await page.getByRole('textbox', { name: 'JSON-Antwort aus einem Übungspaket einfügen' }).fill(JSON.stringify(payload))
  await page.getByRole('button', { name: 'Vorschläge prüfen' }).click()
  await page
    .locator('article')
    .filter({ has: page.getByText('Erkläre eine while-Schleife.', { exact: true }) })
    .getByRole('button', { name: 'Vorschlag öffnen', exact: true })
    .click()
  await expect(page.getByRole('textbox', { name: 'Aufgabe' })).toHaveValue('Erkläre eine while-Schleife.')
  const queue = await (await page.request.get('/api/ai/exercises')).json()
  expect(queue[0].status).toBe('proposed')
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await expect(page.getByText('Leicht · Freigegeben')).toBeVisible()
  expect((await (await page.request.get('/api/anki/queue')).json()).length).toBe(initialCards)
})
