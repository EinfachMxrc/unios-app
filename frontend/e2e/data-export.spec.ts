// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('exporting data triggers a ZIP download without course files by default', async ({ page }) => {
  await page.goto('/settings#data')
  await page.getByText('Details zu Verbindung, Sicherung und Export').click()
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Daten exportieren' }) })
  await expect(panel.getByRole('checkbox')).not.toBeChecked()
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/export')) requests.push(request.url())
  })
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Daten exportieren' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('unios-export.zip')
  expect(requests.some((url) => url.includes('include_files=false'))).toBe(true)
})

test('checking the file-inclusion box sends include_files=true', async ({ page }) => {
  await page.goto('/settings#data')
  await page.getByText('Details zu Verbindung, Sicherung und Export').click()
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Daten exportieren' }) })
  await panel.getByRole('checkbox').check()
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/export')) requests.push(request.url())
  })
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Daten exportieren' }).click()
  await downloadPromise
  expect(requests.some((url) => url.includes('include_files=true'))).toBe(true)
})
