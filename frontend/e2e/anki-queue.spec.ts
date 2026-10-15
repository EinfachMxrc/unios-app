// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('card proposal stays in the queue until explicitly approved', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })),
  )
  const detail = await (await page.request.get('/api/courses/1')).json()
  const resource = detail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = detail.versions[resource.id][0].version
  const payload = {
    schema_version: 1,
    generated_by: 'browser-test',
    generated_at: new Date().toISOString(),
    source: { resource_id: resource.id, version },
    cards: [
      {
        card_type: 'basic',
        front: 'Was ist eine Schleife?',
        back: 'Eine Wiederholung.',
        course: 'wird-lokal-gesetzt',
        topic: 'schleifen',
        source_page: 1,
        confidence: 'high',
      },
    ],
  }
  await page.goto('/more')
  await expect(page.getByRole('heading', { name: 'Mehr', exact: true })).toBeVisible()
  await page.locator('.more-tools > summary').click()
  await page.getByRole('link', { name: 'Kartenvorschläge' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'antwort.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  })
  await expect(page.getByRole('textbox', { name: 'JSON-Antwort aus einem KI-Paket einfügen' })).toHaveValue(
    /schema_version/,
  )
  await page.getByRole('button', { name: 'Vorschläge prüfen' }).click()
  await expect(page.locator('article[id^="card-"]').getByRole('textbox', { name: 'Vorderseite' })).toHaveValue(
    'Was ist eine Schleife?',
  )
  const queue = await (await page.request.get('/api/anki/queue')).json()
  expect(queue[0].status).toBe('proposed')
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await expect(
    page.locator(`#card-${queue[0].id}`).getByText('KI-Vorschlag · Frage und Antwort · Freigegeben', { exact: true }),
  ).toBeVisible()
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/anki/queue')).json()).find(
          (item: { id: number }) => item.id === queue[0].id,
        )?.status,
    )
    .toBe('approved')
})
