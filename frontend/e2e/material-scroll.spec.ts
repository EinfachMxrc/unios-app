// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('500-page PDF keeps canvases bounded when jumping to its final page', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 820 })
  const fixture = await page.request.get('/api/__test__/long-reader.pdf?pages=500')
  const pdf = await fixture.body()
  await page.route('**/files/*/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
  await page.goto('/courses/1')
  await page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  expect(await page.locator('.material-pages canvas').count()).toBeLessThan(13)
  await page.locator('[data-reader-page="500"]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-material-page="500"] .react-pdf__Page__textContent')).toContainText('Seitenende 500')
  await expect(page.locator('[data-material-page="1"] canvas')).toHaveCount(0)
  expect(await page.locator('.material-pages canvas').count()).toBeLessThan(13)
})

for (const viewport of [
  { width: 1300, height: 820 },
  { width: 390, height: 844 },
]) {
  test(`long PDF reaches its final line by scrolling at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const fixture = await page.request.get('/api/__test__/long-reader.pdf')
    expect(fixture.ok()).toBeTruthy()
    const pdf = await fixture.body()
    await page.route('**/files/*/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
    await page.goto('/courses/1')
    await page
      .locator('.resource-row')
      .filter({ hasText: '04_Schleifen.pdf' })
      .getByRole('link', { name: 'PDF öffnen' })
      .click()
    await expect(page.getByText('Seite 1 von 20')).toBeVisible()
    await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
    expect(await page.locator('.material-pages canvas').count()).toBeLessThan(13)
    await page.mouse.move(viewport.width / 2, viewport.height / 2)
    const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let step = 0; step < 25; step += 1) {
      await page.mouse.wheel(0, 1600)
      await page.waitForTimeout(80)
    }
    const lastLine = page
      .locator('[data-material-page="20"] .react-pdf__Page__textContent')
      .getByText('Seitenende 20', { exact: true })
    await page.screenshot({ path: testInfo.outputPath('reader-end.png') })
    await expect(lastLine).toBeInViewport()
    await expect(page.locator('[data-material-page="1"] canvas')).toHaveCount(0)
    expect(await page.locator('.material-pages canvas').count()).toBeLessThan(13)
    expect(Math.abs((await page.evaluate(() => document.documentElement.scrollHeight)) - heightBefore)).toBeLessThan(2)
    await expect(page.locator('.material-pager')).toContainText('Seite 20 von 20')
    // Unloading earlier canvases must not shrink the document and push the reader back.
    const before = await page.evaluate(() => window.scrollY)
    await page.waitForTimeout(700)
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(3)
  })
}
