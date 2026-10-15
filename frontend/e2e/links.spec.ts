// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('course and quick capture link can be opened from either side', async ({ page }) => {
  const jotId = crypto.randomUUID()
  const body = `Verknüpfungstest ${jotId.slice(0, 8)}`
  const created = await page.request.post('/api/jots', {
    data: { id: jotId, kind: 'question', body, created_at: new Date().toISOString() },
  })
  expect(created.ok()).toBeTruthy()
  const course = await (await page.request.get('/api/courses/2')).json()

  await page.goto('/courses/2')
  await page.getByText('Weitere Werkzeuge').click()
  const links = page.getByRole('region', { name: 'Verknüpfungen' })
  await expect(links).toBeVisible()
  await links.getByRole('button', { name: 'Verknüpfen' }).click()
  await links.getByLabel('Beziehung').selectOption('explains')
  await links.getByRole('textbox', { name: 'Kurs, Material oder Eintrag suchen' }).fill(body)
  await links.getByRole('button', { name: 'Verknüpfen' }).click()
  await expect(links.getByRole('heading', { name: 'erklärt' })).toBeVisible()
  await expect(links.getByRole('link', { name: body })).toBeVisible()
  await links.getByRole('link', { name: body }).click()
  const jot = page.getByRole('article').filter({ hasText: body })
  await expect(jot).toBeVisible()
  await jot.getByRole('button', { name: 'Verknüpfungen anzeigen' }).click()
  await expect(
    jot.getByRole('region', { name: 'Verknüpfungen' }).getByRole('link', { name: course.course.name }),
  ).toBeVisible()
  await expect(jot.getByRole('heading', { name: 'wird erklärt durch' })).toBeVisible()
  await jot.getByRole('button', { name: 'Lösen' }).click()
  await expect(jot.getByRole('link', { name: course.course.name })).toHaveCount(0)
  const reverse = await page.request.get(`/api/links/course/2`)
  expect((await reverse.json()).some((item: { target: { id: string } }) => item.target.id === jotId)).toBeFalsy()
})
