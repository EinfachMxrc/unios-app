// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('draft warning and submitted file archive appear after a manual Moodle check', async ({ page }) => {
  const response = await page.request.get('/api/courses')
  const courses = (await response.json()) as { courses: { id: number; name: string }[] }
  const courseId = courses.courses.find((item) => item.name === 'Programmieren 1')?.id
  expect(courseId).toBeDefined()
  await page.goto(`/courses/${courseId}`)
  await page
    .getByRole('button', { name: /Schleifen üben/ })
    .first()
    .click()
  const check = page.getByRole('button', { name: 'Abgabestatus prüfen' }).first()
  await check.click()
  await expect(page.getByText('Nur Entwurf: finales Einreichen in Moodle prüfen')).toBeVisible()
  await page.request.post('/api/__test__/submission-status?submitted=true')
  await check.click()
  await expect(page.getByText('1 Abgabedateien im lokalen Archiv gesichert.')).toBeVisible()
  await page.request.post('/api/__test__/submission-status?submitted=false')
})
