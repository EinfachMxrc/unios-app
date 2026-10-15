// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('reader citations work through the native client when the old server route is absent', async ({ page }) => {
  await page.goto('/courses/1')
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  const version = Number(new URL(page.url()).pathname.split('/').pop())
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetic citing note', body: `[Source](/material/${version}?page=1)` },
  })
  expect(response.ok()).toBe(true)
  const saved = await response.json()
  await page.reload()
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  await page.getByRole('tab', { name: 'Markierungen', exact: true }).click()
  await expect(page.getByText('Synthetic citing note', { exact: true })).toBeVisible()
  await expect(page.getByText('Zitierende Notizen konnten nicht geladen werden.')).toHaveCount(0)
  const open = page.locator('.reader-citations').getByRole('link', { name: 'Notiz öffnen' })
  await expect(open).toHaveAttribute('href', `/notes?id=${saved.note.id}`)
  await page.locator('.reader-citations').getByRole('button', { name: 'Zu Seite 1 springen' }).click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
})
