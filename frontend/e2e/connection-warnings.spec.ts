// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('a myCampus warning is not displayed as a Moodle failure', async ({ page }) => {
  await page.route('**/api/overview', async (route) => {
    const response = await route.fetch()
    const overview = await response.json()
    await route.fulfill({
      json: {
        ...overview,
        sync_continuity: { ...overview.sync_continuity, state: 'recent' },
        warnings: [
          {
            id: 999,
            connector: 'mycampus',
            status: 'login_required',
            message: 'Invented login warning',
            last_success_at: null,
          },
        ],
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText('Eine Uni-Verbindung braucht deine Aufmerksamkeit', { exact: true })).toBeVisible()
  await expect(page.getByText('Moodle braucht deine Aufmerksamkeit', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Invented login warning', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Verbindung prüfen', exact: true })).toBeVisible()
})

test('an unverified status without an error does not become a connection failure', async ({ page }) => {
  await page.route('**/api/overview', async (route) => {
    const response = await route.fetch()
    const overview = await response.json()
    await route.fulfill({
      json: {
        ...overview,
        sync_continuity: { ...overview.sync_continuity, state: 'recent' },
        warnings: [{ id: 999, connector: 'moodle', status: 'unknown', message: null, last_success_at: null }],
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText('Moodle braucht deine Aufmerksamkeit', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Eine Uni-Verbindung braucht deine Aufmerksamkeit', { exact: true })).toHaveCount(0)
})

for (const enabled of [true, false]) {
  test(`a Moodle warning follows whether Moodle is enabled (${enabled})`, async ({ page }) => {
    await page.route('**/api/overview', async (route) => {
      const response = await route.fetch()
      const overview = await response.json()
      await route.fulfill({
        json: {
          ...overview,
          moodle_enabled: enabled,
          sync_continuity: { ...overview.sync_continuity, state: 'recent' },
          warnings: [
            { id: 999, connector: 'moodle', status: 'error', message: 'Invented token warning', last_success_at: null },
          ],
        },
      })
    })
    await page.goto('/')
    const warning = page.getByText('Moodle braucht deine Aufmerksamkeit', { exact: true })
    if (enabled) await expect(warning).toBeVisible()
    else await expect(warning).toHaveCount(0)
  })
}

test('myCampus shows a sign-in action and removes an obsolete login error', async ({ page }) => {
  let failed = true
  await page.route('**/api/mycampus/import/status', (route) =>
    route.fulfill({
      json: {
        state: failed ? 'error' : 'idle',
        message: '',
        report: null,
        login_required: failed,
      },
    }),
  )
  await page.goto('/campus')
  const indicator = page.getByRole('complementary', { name: 'myCampus-Aktualisierung' })
  await expect(indicator).toContainText('Gespeicherte myCampus-Anmeldung erneut übernehmen')
  await expect(indicator.getByRole('link', { name: 'myCampus-Anmeldung übernehmen' })).toHaveAttribute('href', '/setup')
  failed = false
  await page.reload()
  await expect(indicator).toHaveCount(0)
})
