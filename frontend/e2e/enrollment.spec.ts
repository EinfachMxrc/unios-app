// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('Rückmeldung zeigt offenen Status und Frist nach lesendem Abgleich', async ({ page }) => {
  let configured = false
  let checked = false
  const enrollment = {
    title: 'Fiktives Semester',
    status: 'open',
    deadline_at: '2027-03-15T22:59:00Z',
    checked_at: '2026-09-25T20:00:00Z',
  }
  await page.route('**/api/primuss/status', (route) =>
    route.fulfill({
      json: {
        enrollment_available: configured,
        session_available: true,
      },
    }),
  )
  await page.route('**/api/primuss/enrollment', (route) => route.fulfill({ json: checked ? [enrollment] : [] }))
  await page.route('**/api/primuss/enrollment/recheck', (route) => {
    checked = true
    return route.fulfill({ json: { rows: [enrollment], warnings: [] } })
  })
  await page.route('**/api/deadlines', (route) =>
    route.fulfill({
      json: {
        deadlines: checked
          ? [
              {
                id: 17,
                title: 'Rückmeldung: Fiktives Semester',
                due_at: enrollment.deadline_at,
                course_id: null,
                assignment_id: null,
                source: 'primuss-enrollment',
                source_key: 'fictional',
                url: null,
                removed_upstream: false,
              },
            ]
          : [],
        events: [],
        courses: {},
      },
    }),
  )
  await page.goto('/deadlines')
  await page.locator('.deadline-sources > summary').click()
  await expect(page.getByRole('button', { name: 'Rückmeldestatus prüfen' })).toBeDisabled()
  configured = true
  await page.reload()
  await page.locator('.deadline-sources > summary').click()
  await page.getByRole('button', { name: 'Rückmeldestatus prüfen' }).click()
  await expect(page.getByText('Noch offen')).toBeVisible()
  await expect(
    page.locator('.deadline-next').getByText('Rückmeldung: Fiktives Semester', { exact: true }),
  ).toBeVisible()
})
