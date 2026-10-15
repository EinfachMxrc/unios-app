// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('a file notification opens the stored PDF directly', async ({ page }) => {
  const course = await (await page.request.get('/api/courses/1')).json()
  const resource = course.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = course.versions[resource.id][0].id
  const original = await (await page.request.get('/api/notifications')).json()
  await page.route('**/api/notifications', (route) =>
    route.fulfill({
      json: {
        ...original,
        unread: 1,
        items: [{ ...original.items[0], title: '04_Schleifen.pdf', url: `/material/${version}`, read_at: null }],
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: /^Benachrichtigungen(?:: \d+\+? ungelesen)?$/ }).click()
  await page.locator('.notification-preview').filter({ hasText: '04_Schleifen.pdf' }).click()
  await expect(page).toHaveURL(new RegExp(`/material/${version}$`))
  await expect(page.locator('[data-material-page="1"] [data-reader-render-active="true"]')).toHaveAttribute(
    'data-reader-render-complete',
    'true',
  )
})

test('events precede local changes and filtering retains scroll and focus', async ({ page }, testInfo) => {
  const changes = Array.from({ length: 50 }, (_, index) => ({
    id: 1000 + index,
    kind: 'new',
    summary: `Synthetische Unterlage ${index}`,
    created_at: '2026-10-14T08:00:00Z',
    course_id: 1,
    resource_id: null,
    assignment_id: null,
    sync_run_id: null,
  }))
  await page.route('**/api/activity?**', (route) =>
    route.fulfill({
      json: { changes, courses: [{ id: 1, name: 'Fiktiver Kurs' }] },
    }),
  )
  await page.route('**/api/local-actions?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'fixture-action',
          kind: 'note',
          created_at: '2026-10-14T08:00:00Z',
          undone_at: null,
          undoable: true,
        },
      ],
    }),
  )
  await page.goto('/activity')
  const events = page.getByRole('heading', { name: '50 Ereignisse', exact: true })
  const local = page.getByRole('heading', { name: 'Lokale Änderungen', exact: true })
  await expect(events).toBeVisible()
  await expect(local).toHaveCount(1)
  expect(
    await events.evaluate(
      (element) =>
        !!(
          element.compareDocumentPosition(
            [...document.querySelectorAll('h2')].find((item) => item.textContent === 'Lokale Änderungen')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true)
  for (const [label, value, parameter] of [
    ['Ereignis filtern', 'new', 'kind=new'],
    ['Kurs filtern', '1', 'course_id=1'],
  ]) {
    const filter = page.getByRole('combobox', { name: label })
    await filter.evaluate((element: HTMLSelectElement, next) => {
      element.focus({ preventScroll: true })
      window.scrollTo(0, 500)
      element.value = next
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }, value)
    await expect(page).toHaveURL(new RegExp(parameter))
    await expect(page.locator('.data-row')).toHaveCount(51)
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(500)
    await expect(filter).toBeFocused()
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('activity-events-first.png'), animations: 'disabled' })
})
