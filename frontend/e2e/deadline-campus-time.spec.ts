// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

for (const timezoneId of ['UTC', 'Europe/Berlin']) {
  test.describe(`campus deadlines on ${timezoneId}`, () => {
    test.use({ timezoneId })

    test('project rejects a missing hour and round-trips the campus deadline', async ({ page }) => {
      await page.addInitScript(() =>
        localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { projects: true } })),
      )
      await page.goto('/projects')
      await page.getByRole('button', { name: 'Neues Projekt' }).click()
      await page.getByLabel('Projektname').fill('Erfundene Campus-Projektfrist')
      await page.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
      const field = page.getByLabel('Abgabefrist', { exact: true })
      await expect(page.getByText('Campuszeit: Europe/Berlin')).toBeVisible()
      await field.fill('2026-03-29T02:30')
      await page.getByRole('button', { name: 'Projekt anlegen' }).click()
      await expect(page.getByText(/Bitte eine gültige Campus-Uhrzeit wählen/)).toBeVisible()
      await expect(field).toHaveValue('2026-03-29T02:30')
      await field.fill('2026-10-26T09:15')
      const sent = page.waitForRequest(
        (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
      )
      await page.getByRole('button', { name: 'Projekt anlegen' }).click()
      expect((await sent).postDataJSON().deadline_at).toBe('2026-10-26T08:15:00.000Z')
      await expect(page.getByRole('heading', { name: 'Erfundene Campus-Projektfrist', exact: true })).toBeVisible()
      await page.reload()
      await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
      await expect(page.getByLabel('Abgabefrist', { exact: true })).toHaveValue('2026-10-26T09:15')
    })

    test('mail confirmation uses campus time and keeps a spring-gap correction', async ({ page }) => {
      await page.addInitScript(() =>
        localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { mail: true, deadlines: true } })),
      )
      const subject = `Erfundene Campus-Mailfrist (${timezoneId})`
      const imported = await page.request.post('/api/mail/import', {
        multipart: {
          file: {
            name: 'synthetic-campus-time.eml',
            mimeType: 'message/rfc822',
            // Imports are idempotent. Each timezone needs an independent unconfirmed message.
            buffer: Buffer.from(
              `From: Test <office@example.invalid>\r\nSubject: ${subject}\r\nDate: Tue, 01 Jan 2030 12:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDie Frist endet bis zum 14.10.2099. Bitte selbst pruefen.\r\n`,
            ),
          },
        },
      })
      expect(imported.ok()).toBe(true)
      await page.goto('/mail')
      const row = page.locator('.data-row').filter({ has: page.getByText(subject, { exact: true }) })
      await row.getByRole('button', { name: 'Datum prüfen' }).click()
      const field = row.getByLabel('Datum und Uhrzeit', { exact: true })
      await expect(field).toHaveValue('')
      await expect(row.getByText('Campuszeit: Europe/Berlin')).toBeVisible()
      await field.fill('2026-03-29T02:30')
      await row.getByRole('button', { name: 'Frist bestätigen' }).click()
      await expect(page.getByText(/Bitte eine gültige Campus-Uhrzeit wählen/)).toBeVisible()
      await expect(field).toHaveValue('2026-03-29T02:30')
      await field.fill('2026-10-26T09:15')
      const sent = page.waitForRequest(
        (request) => request.method() === 'POST' && /\/api\/mail\/\d+\/confirm$/.test(new URL(request.url()).pathname),
      )
      await row.getByRole('button', { name: 'Frist bestätigen' }).click()
      expect((await sent).postDataJSON().due_at).toBe('2026-10-26T08:15:00.000Z')
      await expect(page.getByText('Frist nach deiner Bestätigung eingetragen.')).toBeVisible()
    })
  })
}
