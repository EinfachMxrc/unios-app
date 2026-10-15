// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('öffentliche Semesterzeiten bleiben vom persönlichen Rückmeldestatus getrennt', async ({ page }) => {
  let checked = false
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
        timetable_available: false,
        events_available: false,
        news_available: false,
        session_available: false,
        alias_map_available: true,
        connection_state: 'unknown',
        last_attempt_at: null,
        last_success_at: null,
      },
    }),
  )
  await page.route('**/api/mycampus/news', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/public-periods', (route) =>
    route.fulfill({
      json: {
        configured: true,
        state: checked ? 'ok' : 'unknown',
        last_success_at: checked ? '2026-09-25T09:00:00Z' : null,
        periods: checked
          ? [
              {
                id: 1,
                semester: 'Wintersemester 2026/27',
                kind: 'exam_registration',
                starts_on: '2026-11-02',
                ends_on: '2026-11-11',
                source_url: 'https://www.hs-coburg.de/semesterzeiten/',
                checked_at: '2026-09-25T09:00:00Z',
              },
            ]
          : [],
      },
    }),
  )
  await page.route('**/api/public-periods/recheck', (route) => {
    checked = true
    return route.fulfill({ json: { checked: 1, created: 1, updated: 0 } })
  })
  await page.route('**/api/deadlines', (route) =>
    route.fulfill({
      json: {
        deadlines: [],
        courses: {},
        events: [],
      },
    }),
  )
  await page.goto('/deadlines')
  await page.locator('.deadline-sources > summary').click()
  await expect(
    page.getByText('Ob deine Rückmeldung oder Prüfungsanmeldung erledigt ist', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Semesterzeiten prüfen' }).click()
  await expect(page.getByText('Prüfungsanmeldung · Wintersemester 2026/27')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quelle: Hochschule' })).toHaveAttribute(
    'href',
    'https://www.hs-coburg.de/semesterzeiten/',
  )
  await expect(page.getByText('11.11.2026', { exact: false })).toBeVisible()
})
