// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from '@playwright/test'

test('FastAPI serves the built React app and PWA files with the API', async ({ page }) => {
  await page.goto('http://127.0.0.1:8175/')
  await expect(page.getByRole('heading', { name: 'Heute' })).toBeVisible()
  const host = await (await page.request.get('http://127.0.0.1:8175/api/host')).json()
  expect(host.mode).toBe('host')
  await page.goto('http://127.0.0.1:8175/courses/1')
  await expect(page.getByRole('heading', { name: 'Programmieren 1' })).toBeVisible()
  expect((await page.request.get('http://127.0.0.1:8175/manifest.webmanifest')).ok()).toBeTruthy()
})
