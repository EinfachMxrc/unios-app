// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
test.use({ timezoneId: 'Europe/Berlin' })

test('Lokales Transkript entsteht nach der Audioauswahl ohne Browser-Sprachpaket', async ({ page }) => {
  await page.route('**/api/voice/transcription/status', (route) => route.fulfill({ json: { available: true, local: true, language: 'de' } }))
  await page.route('**/api/voice/transcribe', (route) => route.fulfill({ json: { transcript: 'Das Arbeitsblatt gemeinsam durchgehen.', local: true } }))
  await page.goto('/voice')
  await expect(page.getByText('Nach dem Stoppen erstellt UniOS das Transkript auf diesem Gerät.')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVEtest') })
  await expect(page.getByRole('textbox', { name: 'Transkript' }).first()).toHaveValue('Das Arbeitsblatt gemeinsam durchgehen.')
  await expect(page.getByRole('status')).toContainText('Transkript bereit')
  await expect(page.getByText('Lokale deutsche Spracherkennung ist auf diesem Gerät nicht verfügbar.')).toHaveCount(0)
})

test('Unklare Abgabe erscheint und lässt sich mit Uhrzeit und Abgabeort bestätigen', async ({ page }) => {
  let confirmed = false
  const task = { id: 701, title: 'Fiktives Gruppenprojekt', course_id: 1, due_at: null, url: null,
    removed_upstream: false, description: 'Abgabe am zweiten Tag um 14.45 Uhr vor Ort.', due_note: 'Abgabe am zweiten Tag um 14.45 Uhr vor Ort.',
    delivery: 'in_person', due_origin: 'unknown' }
  await page.route('**/api/assignments/unresolved', (route) => route.fulfill({ json: confirmed ? [] : [task] }))
  await page.route('**/api/deadlines', (route) => route.fulfill({ json: { deadlines: confirmed ? [{
    id: 701, assignment_id: 701, title: task.title, course_id: 1, due_at: '2027-03-10T13:45:00Z', url: null,
  }] : [], events: [], courses: { 1: 'Beispielkurs' } } }))
  await page.route('**/api/assignments/701/deadline', (route) => {
    const payload = route.request().postDataJSON()
    expect(payload.delivery).toBe('in_person')
    expect(payload.due_at).toBe('2027-03-10T13:45:00.000Z')
    confirmed = true
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Abgaben mit offenem Datum' })).toBeVisible()
  await page.getByText('Termin bestätigen', { exact: true }).first().click()
  await page.locator('input[type=datetime-local]').fill('2027-03-10T14:45')
  await page.getByRole('button', { name: 'Termin bestätigen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Abgaben mit offenem Datum' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: task.title, exact: true })).toBeVisible()
})
