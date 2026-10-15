// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('selected mail proposes a date and waits for explicit confirmation', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'marc-ui-preferences-v1',
      JSON.stringify({
        modules: { mail: true, deadlines: true },
      }),
    ),
  )
  await page.goto('/more')
  await page.getByRole('link', { name: 'Uni-Mail' }).click()
  await expect(page.getByRole('heading', { name: 'Uni-Mail', exact: true })).toBeVisible()
  await page.locator('.mail-settings > summary').click()
  await page.getByLabel('Gespeicherte Mail wählen').setInputFiles({
    name: 'synthetic.eml',
    mimeType: 'message/rfc822',
    buffer: Buffer.from(
      'From: Testbuero <office@example.test>\r\nSubject: Erfundene Prüfungsfrist\r\nDate: Tue, 01 Jan 2030 12:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDie Frist endet bis zum 14.10.2099. Bitte selbst prüfen.\r\n',
    ),
  })
  await page.getByRole('button', { name: 'Nachricht prüfen' }).click()
  await expect(page.getByText('Mögliches Fristdatum: 14.10.2099.')).toBeVisible()
  const before = await page.request.get('/api/deadlines')
  expect(
    (await before.json()).deadlines.some((item: { title: string }) => item.title === 'Erfundene Prüfungsfrist'),
  ).toBe(false)
  await page.getByRole('button', { name: 'Datum prüfen' }).click()
  await page.getByLabel('Datum und Uhrzeit').fill('2099-10-14T12:00')
  await page.getByRole('button', { name: 'Frist bestätigen' }).click()
  await expect(page.getByText('Frist nach deiner Bestätigung eingetragen.')).toBeVisible()
  await page.getByRole('link', { name: 'Termine' }).last().click()
  await page.getByRole('group', { name: 'Terminbereich' }).getByRole('button', { name: 'Abgaben', exact: true }).click()
  await expect(
    page
      .getByRole('table', { name: 'Fristen als Tabelle' })
      .getByRole('button', { name: 'Erfundene Prüfungsfrist', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
