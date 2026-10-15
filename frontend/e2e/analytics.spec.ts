// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('Lernanalyse zeigt gemessene Arbeit und zählt einen erfolgreich geöffneten PDF-Reader', async ({ page }) => {
  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: 'Was ist angekommen, was hast du bearbeitet?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lernaktivität · 14 Tage' })).toBeVisible()
  await expect(page.getByText('Lernzeit wird derzeit nicht gemessen.')).toBeVisible()

  const course = await (await page.request.get('/api/courses/1')).json()
  const resource = course.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const versionId = course.versions[resource.id][0].id
  await page.goto(`/material/${versionId}`)
  await expect(page.locator('[data-material-page="1"]')).toBeVisible()
  await expect
    .poll(async () => {
      const report = await (await page.request.get('/api/analytics/study')).json()
      return report.overall.new_versions_opened
    })
    .toBeGreaterThan(0)
  await page.goto('/analytics')
  await page.getByRole('combobox', { name: /Bereich/ }).selectOption('1')
  await expect(page.getByText('Davon im Reader geöffnet:')).toBeVisible()
  await page.screenshot({ path: screenshotPath('test-results/analytics-desktop.png'), fullPage: true })
  await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.screenshot({ path: screenshotPath('test-results/analytics-mobile-dark.png'), fullPage: true })
})
