// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

function panel(page: Page, title: string) {
  return page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

async function openAdvancedSystem(page: Page) {
  await page.goto('/settings')
  const toggle = page.getByRole('switch', { name: 'Erweiterte Ansicht' })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await page.goto('/system')
}

test('pairing a second device shows it in the device list and can be revoked with a confirmation', async ({
  page,
  request,
}) => {
  await openAdvancedSystem(page)
  const devices = panel(page, 'Geräte')
  await expect(devices.getByText('Noch kein Gerät').first()).toBeVisible()
  await devices.getByRole('button', { name: 'Gerät koppeln' }).click()
  const linkText = await devices.getByText(/\/api\/session\/pair\?code=/).innerText()
  const code = new URL(linkText).searchParams.get('code')
  expect(code).toBeTruthy()
  await expect(devices.getByText(/Gültig bis/)).toBeVisible()

  // Redeem the code directly against the fake API to simulate a second, real device pairing itself.
  await request.get(`http://127.0.0.1:8173/api/session/pair?code=${code}`, { maxRedirects: 0 })

  await page.reload()
  const devicesAfter = panel(page, 'Geräte')
  const pairedRow = devicesAfter.locator('.data-row', { hasText: 'Gekoppeltes Gerät' })
  await expect(pairedRow).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await pairedRow.getByRole('button', { name: 'Abmelden' }).click()
  await expect(devicesAfter.locator('.data-row', { hasText: 'Gekoppeltes Gerät' })).toHaveCount(0)
})

test('revoking a device labelled "Lokaler Browser" warns that it may be the current one', async ({ page }) => {
  await page.route('**/api/session/devices', (route) =>
    route.fulfill({
      json: [{ id: 'fictional-local', label: 'Lokaler Browser', last_seen_at: '2026-10-02T12:00:00Z' }],
    }),
  )
  await openAdvancedSystem(page)
  const devices = panel(page, 'Geräte')
  const localRow = devices.locator('.data-row', { hasText: 'Lokaler Browser' }).first()
  await expect(localRow).toBeVisible()
  let dialogMessage = ''
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message()
    void dialog.dismiss()
  })
  await localRow.getByRole('button', { name: 'Abmelden' }).click()
  await expect.poll(() => dialogMessage).toContain('aktuelles Gerät')
})

test('calendar panel shows the private iCal link with a secrecy hint', async ({ page }) => {
  await openAdvancedSystem(page)
  const calendar = panel(page, 'Kalender')
  await expect(calendar.getByText(/geheim/i)).toBeVisible()
  await expect(calendar.getByText(/\/calendar\.ics\?token=/)).toBeVisible()
  await calendar.getByRole('button', { name: 'Link kopieren' }).click()
  await expect(calendar.getByText(/kopiert|Zwischenablage/)).toBeVisible()
})

test('calendar link renewal requires confirmation and invalidates the old private link', async ({ page, request }) => {
  await openAdvancedSystem(page)
  const calendar = panel(page, 'Kalender')
  const link = calendar.getByText(/\/calendar\.ics\?token=/)
  const previous = await link.innerText()
  page.once('dialog', (dialog) => dialog.dismiss())
  await calendar.getByRole('button', { name: 'Kalenderlink erneuern' }).click()
  await expect(link).toHaveText(previous)
  page.once('dialog', (dialog) => dialog.accept())
  await calendar.getByRole('button', { name: 'Kalenderlink erneuern' }).click()
  await expect(link).not.toHaveText(previous)
  const rotated = await link.innerText()
  const oldToken = new URL(previous).searchParams.get('token')
  const newToken = new URL(rotated).searchParams.get('token')
  expect(oldToken).not.toBe(newToken)
  const stored = await request.get('/api/session/ical-url')
  expect(new URL((await stored.json()).url).searchParams.get('token')).toBe(newToken)
})

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`calendar link controls fit ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      await openAdvancedSystem(page)
      const calendar = panel(page, 'Kalender')
      await calendar.scrollIntoViewIfNeeded()
      await expect(calendar.getByRole('button', { name: 'Kalenderlink erneuern' })).toBeEnabled()
      await expect(calendar.getByRole('button', { name: 'Link kopieren' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await expect
        .poll(() =>
          calendar.evaluate((element) => {
            for (let node: Element | null = element; node; node = node.parentElement) {
              if (Number(getComputedStyle(node).opacity) < 1) return false
            }
            return true
          }),
        )
        .toBe(true)
      await calendar.screenshot({
        path: testInfo.outputPath(`calendar-link-${theme}-${width}.png`),
        animations: 'disabled',
      })
    })
  }
}

test('iCal source selection persists and the private link exports only the chosen sources', async ({ page }) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/timetable-series')
  await openAdvancedSystem(page)
  const calendar = panel(page, 'Kalender')
  await calendar.getByRole('button', { name: 'Nur Stundenplan', exact: true }).click()
  const link = calendar.getByText(/\/calendar\.ics\?token=/)
  let url = new URL(await link.innerText())
  expect(url.searchParams.get('sources')).toBe('timetable')
  await expect(calendar.getByRole('checkbox', { name: 'Stundenplan', exact: true })).toBeChecked()
  await expect(calendar.getByRole('checkbox', { name: 'Eigene Termine', exact: true })).not.toBeChecked()
  const response = await page.request.get(url.pathname + url.search)
  expect(response.ok()).toBe(true)
  expect((await response.text()).match(/BEGIN:VEVENT/g)?.length).toBe(4)
  await page.reload()
  await expect(calendar.getByRole('checkbox', { name: 'Eigene Termine', exact: true })).not.toBeChecked()
  await calendar.getByRole('button', { name: 'Alles auswählen', exact: true }).click()
  url = new URL(await link.innerText())
  expect(url.searchParams.has('sources')).toBe(false)
})
