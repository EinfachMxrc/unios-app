// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'

test('personal weekly slots persist and update Today without deleting imported events', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T07:00:00Z') })
  expect((await page.request.post('http://127.0.0.1:8173/api/__test__/timetable-slots')).ok()).toBeTruthy()
  await page.goto('/deadlines')
  const schedule = page.locator('#timetable')
  await expect(schedule.locator('article')).toHaveCount(2)
  await schedule.getByText('Kalenderverbindung verwalten', { exact: true }).click()
  await schedule.locator('.timetable-selection summary').filter({ hasText: 'English Workshop' }).click()
  const later = schedule.getByRole('checkbox', { name: 'Montag · 11:45', exact: true })
  const saved = page.waitForResponse(response => response.url().endsWith('/api/timetable/selection') && response.request().method() === 'PUT')
  await later.uncheck()
  expect((await saved).ok()).toBeTruthy()
  await expect(later).not.toBeChecked()
  await expect(schedule.locator('article')).toHaveCount(1)
  await expect(schedule.locator('article')).toContainText('10:00')
  const screenshots = process.env.UNIOS_QA_DIRECTORY || path.resolve(import.meta.dirname, '../../docs/qa/timetable-selection-20261005')
  await mkdir(screenshots, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('unios-theme', value), theme)
    await page.reload()
    await schedule.getByText('Kalenderverbindung verwalten', { exact: true }).click()
    await schedule.locator('.timetable-selection summary').filter({ hasText: 'English Workshop' }).click()
    await expect(later).not.toBeChecked()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(path.join(screenshots, `${theme}-${width}.png`)), fullPage: true })
    }
  }
  await page.reload()
  await expect(schedule.locator('article')).toHaveCount(1)
  await page.goto('/')
  await expect(page.locator('#timetable article')).toHaveCount(1)
  await expect(page.locator('#timetable article')).toContainText('10:00')
})
