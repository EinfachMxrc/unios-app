// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('calendar subscription shows lectures, keeps a good feed on error, and can be stopped', async ({
  page,
}, testInfo) => {
  // The fake feed schedules the lecture on the next teaching day (Mon-Fri), because
  // the default work-week view hides weekends. Run the browser clock on that same day.
  const teaching = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  while ([0, 6].includes(teaching.getUTCDay())) teaching.setUTCDate(teaching.getUTCDate() + 1)
  const day = teaching.toISOString().slice(0, 10)
  await page.clock.install({ time: new Date(`${day}T08:30:00Z`) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/deadlines#timetable')
  const panel = page.locator('#timetable')
  await panel.getByText('Hochschulkalender hinzufügen', { exact: true }).click()
  await panel
    .getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true })
    .fill('https://calendar.example.test/feed.ics?Session=fixture')
  await panel.getByRole('button', { name: 'Stundenplan abonnieren', exact: true }).click()
  await expect(panel.locator('strong').getByText('Testvorlesung', { exact: true })).toBeVisible()
  await panel.locator('.timetable-settings > summary').click()
  await expect(panel.getByText(/Zuletzt geprüft/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('timetable-desktop.png') })
  await page.goto('/')
  await expect(page.locator('#timetable').getByText('Testvorlesung', { exact: true })).toBeVisible()
  await page.locator('#timetable').getByRole('link').click()
  await panel.locator('.timetable-settings > summary').click()
  await panel.getByRole('button', { name: 'Kalenderlink ändern', exact: true }).click()
  await panel
    .getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true })
    .fill('https://calendar.example.test/expired.ics')
  await panel.getByRole('button', { name: 'Stundenplan abonnieren', exact: true }).click()
  await expect(panel.getByText(/Der Link liefert keinen iCal-Kalender/)).toBeVisible()
  await expect(panel.locator('strong').getByText('Testvorlesung', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.scrollIntoViewIfNeeded()
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('timetable-phone.png') })
  await panel.getByRole('button', { name: 'Abo beenden', exact: true }).click()
  await panel.getByRole('button', { name: 'Abo jetzt beenden', exact: true }).click()
  await panel.getByText('Hochschulkalender hinzufügen', { exact: true }).click()
  await expect(panel.getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.locator('#timetable')).toHaveCount(0)
})

test('approved mailbox is read, deduplicated and never creates a deadline without review', async ({ page }) => {
  await page.route('**/api/mail/forwarding', (route) =>
    route.fulfill({
      json: { configured: false, connected: false, ready: false, address: '', last_success_at: null, last_error: '' },
    }),
  )
  await page.addInitScript(() => {
        const saved = JSON.parse(localStorage.getItem('unios-ui-preferences-v1') || localStorage.getItem('marc-ui-preferences-v1') || '{}')
        localStorage.setItem('unios-ui-preferences-v1', JSON.stringify({ ...saved, modules: { ...saved.modules, mail: true } }))
      })
      await page.goto('/mail')
  await page.locator('.mail-settings > summary').click()
  await page.getByRole('button', { name: 'Mit Microsoft verbinden', exact: true }).click()
  await expect(page.getByText('TEST-CODE', { exact: true })).toBeVisible()
  await expect(page.getByText('1 Nachrichten gelesen · 1 neue Hinweise', { exact: true })).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByText('Erfundene Anmeldefrist', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Datum prüfen', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nachrichten jetzt lesen', exact: true }).click()
  await expect(page.getByText('1 Nachrichten gelesen · 0 neue Hinweise', { exact: true })).toBeVisible()
  await page.reload()
  await page.locator('.mail-settings > summary').click()
  await expect(page.getByText('Erfundene Anmeldefrist', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Mailabruf trennen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mit Microsoft verbinden', exact: true })).toBeVisible()
  await expect(page.getByText('Erfundene Anmeldefrist', { exact: true })).toBeVisible()
})

test('today hides completed lectures and marks the running class until it ends', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-02T08:30:00Z') })
  await page.route('**/api/timetable/status', (route) =>
    route.fulfill({
      json: {
        subscribed: true,
        keyring_available: true,
        session_link: true,
        last_error: '',
        last_success_at: '2026-10-02T08:00:00Z',
      },
    }),
  )
  await page.route('**/api/timetable/events?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 701,
          title: 'Finished fixture · R001',
          starts_at: '2026-10-02T06:15:00Z',
          ends_at: '2026-10-02T07:45:00Z',
        },
        {
          id: 702,
          title: 'Current fixture · R002, Fictional Campus',
          starts_at: '2026-10-02T08:00:00Z',
          ends_at: '2026-10-02T09:30:00Z',
        },
        {
          id: 703,
          title: 'Upcoming fixture · R003',
          starts_at: '2026-10-02T09:45:00Z',
          ends_at: '2026-10-02T11:15:00Z',
        },
      ],
    }),
  )
  await page.goto('/')
  const panel = page.locator('#timetable')
  await expect(panel.getByTestId('timetable-event-701')).toHaveCount(0)
  await expect(panel.getByTestId('timetable-event-702')).toContainText('Jetzt läuft')
  await expect(panel.getByTestId('timetable-event-702')).toContainText('R002')
  await expect(panel.getByTestId('timetable-event-703')).toBeVisible()
  await page.clock.fastForward(3_600_000)
  await expect(panel.getByTestId('timetable-event-702')).toHaveCount(0)
  await expect(panel.getByTestId('timetable-event-703')).toBeVisible()
  await page.goto('/deadlines')
  await expect(panel.getByTestId('timetable-event-702')).toHaveCount(0)
  await panel.getByLabel(/Beendete Stunden anzeigen/).check()
  await expect(panel.getByTestId('timetable-event-702')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('calendar-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const dateControls = await panel.locator('.timetable-navigation > button').all()
  const controlRows = await Promise.all(dateControls.map(async (control) => (await control.boundingBox())!.y))
  expect(Math.max(...controlRows) - Math.min(...controlRows)).toBeLessThanOrEqual(1)
  const dateLabel = (await panel.locator('.timetable-navigation > div').boundingBox())!
  expect(dateLabel.y + dateLabel.height).toBeLessThan(Math.min(...controlRows))
  await page.screenshot({ path: testInfo.outputPath('calendar-mobile.png') })
})
