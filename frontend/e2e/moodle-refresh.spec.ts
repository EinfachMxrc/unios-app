// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('startup sync is visible and a competing manual refresh waits without a false error', async ({ page }) => {
  let running = true
  let posts = 0
  await page.route('**/api/sync/status', (route) => route.fulfill({ json: {
    running, last_run_id: 1, last_status: running ? 'running' : 'success',
  } }))
  await page.route('**/api/sync', (route) => {
    posts++
    running = true
    return route.fulfill({ status: 409, json: { detail: 'Sync läuft bereits' } })
  })
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Moodle wird aktualisiert …' })
  await expect(button).toBeDisabled()
  await expect(page.getByRole('alert').filter({ hasText: 'Die Aktualisierung hat nicht geklappt' })).toHaveCount(0)
  expect(posts).toBe(0)
  running = false
  await expect(page.getByText('Deine Daten sind wieder aktuell.')).toBeVisible()
  await page.getByRole('button', { name: 'Moodle aktualisieren' }).click()
  await expect(button).toBeDisabled()
  expect(posts).toBe(1)
  await expect(page.getByRole('alert').filter({ hasText: 'Die Aktualisierung hat nicht geklappt' })).toHaveCount(0)
  running = false
  await expect(page.getByText('Deine Daten sind wieder aktuell.')).toBeVisible()
  // Actual failures must still surface.
  await page.route('**/api/sync', (route) => route.fulfill({ status: 503, json: { detail: 'Fixture unavailable' } }))
  await page.getByRole('button', { name: 'Moodle aktualisieren' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Die Aktualisierung hat nicht geklappt' })).toBeVisible()
})
