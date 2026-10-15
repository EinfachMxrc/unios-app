// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('gescannte PDF-Seiten lassen sich gezielt für die Suche erkennen', async ({ page }) => {
  const course = await (await page.request.get('/api/courses/1')).json()
  const resource = course.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const versionId = course.versions[resource.id][0].id
  let processed = false
  await page.route(`**/api/ocr/material/${versionId}`, async (route) => {
    if (route.request().method() === 'POST') processed = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      pending_pages: processed ? 0 : 1, recognized_pages: processed ? 1 : 0,
      empty_pages: 0, available: true, language: 'deu+eng',
    }) })
  })
  await page.goto(`/material/${versionId}`)
  await page.getByRole('button', { name: 'Text für Suche erkennen' }).click()
  await expect(page.getByText('Text erkannt. Die Seiten sind jetzt in der Suche auffindbar.')).toBeVisible()
  expect(processed).toBe(true)
})
