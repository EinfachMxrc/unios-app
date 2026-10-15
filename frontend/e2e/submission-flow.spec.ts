// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('Moodle file submission needs file preview, statement and explicit confirmation', async ({ page }) => {
  await page.request.post('/api/__test__/submission-write-reset')
  await page.goto('/settings#data')
  await page.getByText('Details zu Verbindung, Sicherung und Export').click()
  await page.getByRole('switch', { name: 'Abgabe über die App' }).click()
  const response = await page.request.get('/api/courses')
  const courses = (await response.json()) as { courses: { id: number; name: string }[] }
  const courseId = courses.courses.find((item) => item.name === 'Programmieren 1')?.id
  expect(courseId).toBeDefined()
  await page.goto(`/courses/${courseId}`)
  await page
    .getByRole('button', { name: /Schleifen üben/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Dateiabgabe vorbereiten' }).first().click()
  await page
    .getByLabel('Dateien für Moodle auswählen')
    .first()
    .setInputFiles({
      name: 'Antwort.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Erfundene PDF-Abgabe'),
    })
  await page.getByLabel('Nach dem Speichern final einreichen').first().check()
  await page.getByRole('button', { name: 'Vorgaben und Dateien prüfen' }).first().click()
  await expect(page.getByText('Erfundene Erklärung zur eigenen Arbeit.')).toBeVisible()
  await expect(page.getByText(/Antwort.pdf · .*SHA-256/)).toBeVisible()
  const send = page.getByRole('button', { name: 'Jetzt an Moodle senden' })
  await expect(send).toBeDisabled()
  await page.getByLabel('Ich akzeptiere diese Erklärung selbst').check()
  await page.getByLabel('Ich habe Kurs, Aufgabe und Dateien geprüft').check()
  await expect(send).toBeDisabled()
  await page.getByLabel('Bestehenden Moodle-Entwurf ausdrücklich ersetzen').check()
  await send.click()
  await expect(page.getByText('Moodle-Abgabe geprüft: eingereicht.')).toBeVisible()
  await expect(page.getByText('1 Abgabedateien im lokalen Archiv gesichert.')).toBeVisible()
  await page.request.put('/api/submissions/control', { data: { enabled: false } })
  await page.request.post('/api/__test__/submission-write-reset')
})
