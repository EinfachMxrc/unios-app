// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('mycampus bringt News und Termine in die Terminansicht', async ({ page }) => {
  let configured = false
  let synced = false
  await page.route('**/api/primuss/status', (route) =>
    route.fulfill({
      json: {
        enrollment_available: false,
        session_available: false,
      },
    }),
  )
  await page.route('**/api/primuss/enrollment', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/mycampus/status', (route) =>
    route.fulfill({
      json: {
        timetable_available: configured,
        events_available: configured,
        news_available: configured,
        session_available: true,
        alias_map_available: true,
        connection_state: synced ? 'ok' : 'unknown',
        last_attempt_at: synced ? '2027-01-10T08:00:00Z' : null,
        last_success_at: synced ? '2027-01-10T08:00:00Z' : null,
      },
    }),
  )
  await page.route('**/api/mycampus/news', (route) =>
    route.fulfill({
      json: synced
        ? [
            {
              id: 1,
              title: 'Fiktive Nachricht',
              published_at: '2027-01-10T07:00:00Z',
              checked_at: '2027-01-10T08:00:00Z',
            },
          ]
        : [],
    }),
  )
  await page.route('**/api/mycampus/sync', (route) => {
    synced = true
    return route.fulfill({
      json: {
        events_created: 1,
        events_updated: 0,
        news_created: 1,
        news_updated: 0,
        skipped: 0,
        warnings: [],
      },
    })
  })
  await page.route('**/api/deadlines', (route) =>
    route.fulfill({
      json: {
        deadlines: [],
        courses: {},
        events: synced
          ? [
              {
                id: 1,
                title: 'Fiktiver Infoabend',
                starts_at: '2027-01-12T16:00:00Z',
                ends_at: null,
                course_id: null,
                url: null,
              },
            ]
          : [],
      },
    }),
  )
  await page.goto('/deadlines')
  await page.locator('.deadline-sources > summary').click()
  await expect(page.getByRole('button', { name: 'mycampus abgleichen' })).toBeDisabled()
  configured = true
  await page.reload()
  await page.locator('.deadline-sources > summary').click()
  await page.getByRole('button', { name: 'mycampus abgleichen' }).click()
  await expect(page.getByText('Fiktive Nachricht')).toBeVisible()
  await expect(page.getByText('Fiktiver Infoabend')).toBeVisible()
  await expect(page.getByText('1 Termine und 1 News neu', { exact: false })).toBeVisible()
  await expect(page.getByText('Zuletzt erfolgreich gelesen:', { exact: false })).toBeVisible()
})
