// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test.use({ video: 'on', viewport: { width: 1280, height: 720 } })

test('short tour of the local study workspace with invented data', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
  await page.waitForTimeout(1200)

  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
  await page.waitForTimeout(1200)

  await page.goto('/deadlines')
  await expect(page.getByRole('heading', { level: 1, name: 'Termine', exact: true })).toBeVisible()
  await page.waitForTimeout(1200)

  await page.goto('/learning')
  await expect(page.getByRole('heading', { name: 'Lernen', exact: true })).toBeVisible()
  await page.waitForTimeout(1200)
})
