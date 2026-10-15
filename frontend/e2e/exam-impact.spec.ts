// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'
import type { ExamImpact } from '../src/components/ExamImpactDialog'

test('a changed exam offers an explicit old/new plan preview and updates accepted work only after confirmation', async ({ page }) => {
  const fixture = await page.request.post('/api/__test__/exam-impact-plan')
  expect(fixture.ok()).toBeTruthy()
  const ids = await fixture.json()
  const before = await (await page.request.get('/api/learning/blocks')).json()
  const original = before.find((block: { id: number }) => block.id === ids.block_id)
  await page.goto('/learning')
  const row = page.locator('.study-cycle').filter({ hasText: 'Synthetische Terminänderung' }).filter({ hasText: 'Anwenden und üben' })
  await expect(row).toContainText('Prüfungstermin geändert')
  await row.getByRole('button', { name: 'Lernplan prüfen', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Lernplan neu planen', exact: true })
  await expect(dialog.getByRole('button', { name: 'Diese Termine übernehmen', exact: true })).toBeEnabled()
  await expect(dialog).toContainText('45 Minuten')
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Lernplan prüfen', exact: true })).toBeFocused()
  const untouched = await (await page.request.get('/api/learning/blocks')).json()
  expect(untouched.find((block: { id: number }) => block.id === ids.block_id).starts_at).toBe(original.starts_at)
  await row.getByRole('button', { name: 'Lernplan prüfen', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Diese Termine übernehmen', exact: true })).toBeEnabled()
  const applied = page.waitForResponse(response => response.url().endsWith(`/api/learning/cycles/${ids.cycle_id}/exam-impact`) && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Diese Termine übernehmen', exact: true }).click()
  expect((await applied).ok()).toBeTruthy()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Dein Lernplan wurde angepasst.' })).toBeVisible()
  const blocks = await (await page.request.get('/api/learning/blocks')).json()
  const changed = blocks.find((block: { id: number }) => block.id === ids.block_id)
  expect(changed.starts_at).not.toBe(original.starts_at)
  expect(changed.duration_minutes).toBe(45)
  expect(changed.exam_id).toBe(original.exam_id)
  const cycles = await (await page.request.get('/api/learning/cycles')).json()
  expect(cycles.find((cycle: { id: number }) => cycle.id === ids.cycle_id).exam_changed).toBe(false)
})

test('a changed accepted plan rejects a stale preview and offers refresh without closing the dialog', async ({ page }) => {
  const fixture = await page.request.post('/api/__test__/exam-impact-plan')
  expect(fixture.ok()).toBeTruthy()
  const ids = await fixture.json()
  await page.goto('/learning')
  await page.locator('.study-cycle').filter({ hasText: 'Synthetische Terminänderung' }).filter({ hasText: 'Anwenden und üben' })
    .getByRole('button', { name: 'Lernplan prüfen', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Lernplan neu planen', exact: true })
  await expect(dialog.getByRole('button', { name: 'Diese Termine übernehmen', exact: true })).toBeEnabled()
  // Change an accepted block through an independently confirmed new plan, as another window could do.
  const preview = await (await page.request.get(`/api/learning/cycles/${ids.cycle_id}/exam-impact`)).json() as ExamImpact
  const updated = await page.request.post(`/api/learning/cycles/${ids.cycle_id}/exam-impact`, {
    data: { revision: preview.revision, planned_at: preview.planned_at },
  })
  expect(updated.ok()).toBeTruthy()
  await dialog.getByRole('button', { name: 'Diese Termine übernehmen', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Prüfung, Kalender oder Lernplan wurden verändert')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Vorschau aktualisieren', exact: true }).click()
  await expect(dialog).toContainText('Der Lernplan passt bereits zum aktuellen Prüfungstermin.')
  await expect(dialog.getByRole('button', { name: 'Diese Termine übernehmen', exact: true })).toBeDisabled()
})
