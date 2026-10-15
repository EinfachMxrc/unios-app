// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('an exact source link remains visible despite a saved material filter', async ({ page }) => {
  await page.goto('/courses/1')
  await page
    .getByRole('navigation', { name: 'Kursansichten' })
    .getByRole('link', { name: /Unterlagen/ })
    .click()
  await page.getByRole('searchbox').fill('Kein passendes Dokument')
  await expect(page.locator('.resource-row')).toHaveCount(0)
  await page.goto('/courses/1#resource-1')
  const target = page.locator('#resource-1')
  await expect(target).toBeVisible()
  await expect(target).toBeFocused()
  expect(await page.locator('.resource-row').count()).toBeGreaterThan(1)
  await expect(target).toHaveCSS('animation-iteration-count', '3')
})

test('notes remain bounded and search/page controls request the server', async ({ page }) => {
  const rows = Array.from({ length: 121 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    course_id: 1,
    course_name: 'Beispielkurs',
    resource_id: null,
    title: `Beispielnotiz ${String(index).padStart(3, '0')}`,
    current_revision: 1,
    created_at: '2026-01-01T12:00:00Z',
    updated_at: '2026-01-01T12:00:00Z',
  }))
  await page.route('**/api/notes{,?*}', async (route) => {
    const response = await route.fetch()
    const original = await response.json()
    const params = new URL(route.request().url()).searchParams
    const offset = Number(params.get('offset') ?? 0)
    const query = params.get('q') ?? ''
    const filtered = rows.filter((row) => row.title.includes(query))
    await route.fulfill({
      response,
      json: {
        ...original,
        notes: filtered.slice(offset, offset + 50),
        page: { total: filtered.length, offset, limit: 50, has_more: offset + 50 < filtered.length },
      },
    })
  })
  await page.goto('/notes')
  await expect(page.locator('.note-list-item')).toHaveCount(50)
  await page.getByRole('button', { name: 'Weiter', exact: true }).click()
  await expect(page.locator('.note-list-item').first()).toContainText('050')
  await page.getByLabel('Notizen nach Titel suchen').fill('120')
  await expect(page.locator('.note-list-item')).toHaveCount(1)
  await expect(page.locator('.note-list-item')).toContainText('120')
  await expect(page.getByLabel('Notizen nach Titel suchen')).toBeFocused()
})

test('material history is requested only after opening earlier versions', async ({ page }) => {
  const historyRequests: string[] = []
  page.on('request', (request) => {
    if (/\/api\/resources\/\d+\/versions/.test(request.url())) historyRequests.push(request.url())
  })
  await page.goto('/courses/1')
  const material = page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' }).first()
  await expect(material).toBeVisible()
  expect(historyRequests).toHaveLength(0)
  await material.locator('.resource-more > summary').click()
  expect(historyRequests).toHaveLength(0)
  await material.getByText('Frühere Versionen', { exact: true }).click()
  await expect.poll(() => historyRequests.length).toBe(1)
  await expect(material.locator('details details')).toContainText('Version')
})

test('a custom course name persists while retaining the original identity', async ({ page }) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/reset')
  const before = (await (await page.request.get('/api/courses/1')).json()).course
  await page.goto('/courses/1')
  await page.locator('.course-settings > summary').click()
  await page.getByLabel('Anzeigename', { exact: true }).fill('Prog 1')
  await page.getByRole('button', { name: 'Namen speichern', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Prog 1', exact: true })).toBeVisible()
  await expect(page.locator('.sidebar-course[href="/courses/1"]')).toContainText('Prog 1')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Prog 1', exact: true })).toBeVisible()
  await page.locator('.course-settings > summary').click()
  await expect(page.getByText(`Originalname: ${before.name}`, { exact: true })).toBeVisible()
  const after = (await (await page.request.get('/api/courses/1')).json()).course
  expect(after.name).toBe(before.name)
  expect(after.source_id).toBe(before.source_id)
  await page.getByLabel('Anzeigename', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Namen speichern', exact: true }).click()
  await expect(page.getByRole('heading', { name: before.name, exact: true })).toBeVisible()
})
