// SPDX-License-Identifier: AGPL-3.0-or-later

import { performance } from 'node:perf_hooks'
import { expect, test } from './fixtures'

test('gemessene Browserbudgets für Kaltstart, Heute, Suche, PDF und Palette', async ({ page }, info) => {
  const samples: Record<string, number[]> = {
    cold_page: [],
    today: [],
    today_api: [],
    search: [],
    pdf_first_page: [],
    palette: [],
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    let start = performance.now()
    const overview = await page.request.get('/api/overview')
    expect(overview.ok()).toBeTruthy()
    expect((await overview.json()).courses).toBeDefined()
    samples.today_api.push(performance.now() - start)
    start = performance.now()
    await page.goto('/')
    await expect(page.locator('.today-intro')).toBeVisible()
    samples.cold_page.push(performance.now() - start)
    await page.goto('/search')
    start = performance.now()
    await page.getByRole('link', { name: 'Heute', exact: true }).first().click()
    await expect(page.locator('.today-intro')).toBeVisible()
    samples.today.push(performance.now() - start)
    await page.goto('/search')
    await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Rekursionstiefe')
    start = performance.now()
    await page.getByRole('button', { name: 'Suchen', exact: true }).click()
    const result = page.locator('.search-result').filter({ hasText: '04_Schleifen.pdf' })
    await expect(result).toBeVisible()
    samples.search.push(performance.now() - start)
    const link = result.locator('a').first()
    start = performance.now()
    await link.click()
    await expect(page.locator('.react-pdf__Page__canvas').first()).toBeVisible()
    await expect(page.locator('[data-material-page="2"] .react-pdf__Page__textContent')).toContainText(
      'Rekursionstiefe',
    )
    samples.pdf_first_page.push(performance.now() - start)
    start = performance.now()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    samples.palette.push(performance.now() - start)
    await page.keyboard.press('Escape')
  }
  // Fixed upper limits, never inferred from the current result. Native startup is a separate hardware gate.
  const budgets: Record<string, number> = {
    cold_page: 3000,
    today: 1500,
    today_api: 500,
    search: 1000,
    pdf_first_page: 3000,
    palette: 300,
  }
  const measured = Object.fromEntries(
    Object.entries(samples).map(([key, values]) => [
      key,
      { p95_ms: Math.max(...values), samples_ms: values, budget_ms: budgets[key] },
    ]),
  )
  await info.attach('performance.json', {
    body: JSON.stringify({ environment: 'Chrome/local fake server; 5 samples; p95 nearest rank', measured }, null, 2),
    contentType: 'application/json',
  })
  for (const [key, value] of Object.entries(measured)) expect(value.p95_ms, key).toBeLessThanOrEqual(value.budget_ms)
})
