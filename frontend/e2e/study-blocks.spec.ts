// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('a weak topic is suggested as a study block before the exam and can be accepted into the calendar', async ({
  page,
}) => {
  const detail = await (await page.request.get('/api/courses/1')).json()
  const resource = detail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = detail.versions[resource.id][0].version
  const payload = {
    schema_version: 1,
    generated_by: 'browser-test',
    generated_at: new Date().toISOString(),
    source: { resource_id: resource.id, version },
    exercises: [
      {
        question: 'Blockfrage?',
        topic: 'Block-Test-Thema',
        difficulty: 'easy',
        sample_solution: 'Antwort.',
        solution_steps: 'Schritt.',
        source_page: 1,
      },
    ],
  }
  const created = await page.request.post('/api/ai/exercises/import', { data: payload })
  const item = (await created.json())[0]
  await page.request.put(`/api/ai/exercises/${item.id}`, { data: { ...payload.exercises[0], status: 'approved' } })

  // Three wrong attempts keep the topic well below the weak threshold once it has enough data.
  for (let index = 0; index < 3; index += 1) {
    await page.request.post(`/api/learning/practice/${item.id}/attempt`, {
      data: { answer: 'falsch', correct: false, error_kind: 'concept', duration_seconds: 5 },
    })
  }
  await page.request.post('/api/__test__/schedule-exam-in-5-days')

  await page.goto('/learning')
  const cycleRow = page
    .locator('.data-row')
    .filter({ hasText: 'Anwenden und üben' })
    .filter({ hasText: 'Block-Test-Thema' })
  await expect(cycleRow).toBeVisible()
  await cycleRow.getByRole('button', { name: 'Annehmen' }).click()
  await expect(cycleRow.getByText('Angenommen', { exact: true })).toBeVisible()
  const row = page.locator('.study-block-row').filter({ hasText: 'Block-Test-Thema' }).filter({ hasText: 'Minuten' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Annehmen' }).click()
  await expect(row.getByText('Angenommen · im Kalender')).toBeVisible()

  const calendar = await page.request.get('/calendar.ics')
  expect(await calendar.text()).toContain('Lernblock: Block-Test-Thema')

  await page.setViewportSize({ width: 390, height: 900 })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
    await page.reload()
    const open = row.getByRole('link', { name: 'Jetzt lernen', exact: true })
    await expect(open).toBeVisible()
    const bounds = await row.evaluate((element) => {
      const rect = (target: Element) => {
        const value = target.getBoundingClientRect()
        return {
          left: value.left,
          right: value.right,
          top: value.top,
          bottom: value.bottom,
        }
      }
      return {
        content: rect(element.closest('[data-slot="card-content"]')!),
        children: [...element.children].map(rect),
        actions: rect(element.querySelector('.study-block-actions')!),
        meta: rect(element.querySelector('.row-subtitle')!),
        link: rect(element.querySelector('.study-block-actions a')!),
        rowWidth: element.clientWidth,
        rowScrollWidth: element.scrollWidth,
      }
    })
    expect(bounds.rowScrollWidth).toBeLessThanOrEqual(bounds.rowWidth + 1)
    for (const child of [...bounds.children, bounds.link]) {
      expect(child.left).toBeGreaterThanOrEqual(bounds.content.left - 1)
      expect(child.right).toBeLessThanOrEqual(bounds.content.right + 1)
    }
    expect(bounds.actions.top).toBeGreaterThanOrEqual(bounds.meta.bottom)
  }
  const target = await row.getByRole('link', { name: 'Jetzt lernen', exact: true }).getAttribute('href')
  await row.getByRole('link', { name: 'Jetzt lernen', exact: true }).click()
  await expect(page).toHaveURL(target!)
  await expect(page.locator('.focus-context')).toContainText('Block-Test-Thema')
})
