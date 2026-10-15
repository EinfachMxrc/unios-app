// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('partial Moodle assignments retain safe diagnostic details through the real sync and system view', async ({
  page,
}, info) => {
  try {
    const response = await page.request.post('/api/__test__/moodle-assignment-diagnostics')
    expect(response.ok()).toBeTruthy()
    expect((await response.json()).status).toBe('warning')
    await page.goto('/system')
    await expect(page.getByText('moodle: Abgleich mit Warnung', { exact: true })).toBeVisible()
    const reason = page.getByText(/Moodle-Aufgabendiagnose:/).first()
    await expect(reason).toContainText(
      'Kurs-ID 101, Aktivitäts-ID 9001, Code 1: Kein Zugriff auf den Aktivitätskontext',
    )
    await expect(reason).toContainText(
      'Kurs-ID 202, Code 2: Keine aktive Einschreibung oder erforderliche Kursberechtigung',
    )
    await expect(reason).toContainText('vorhandene Abgabetermine bleiben erhalten')
    await expect(page.getByText('fixture-private-message')).toHaveCount(0)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await reason.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
        await reason.screenshot({
          path: info.outputPath(`moodle-diagnostics-${theme}-${width}.png`),
          animations: 'disabled',
        })
      }
    }
  } finally {
    await page.request.post('/api/__test__/reset')
  }
})

test('expected Moodle access restrictions remain visible without a failed-sync warning', async ({ page }) => {
  try {
    const response = await page.request.post('/api/__test__/moodle-assignment-diagnostics?expected_access=true')
    expect(response.ok()).toBeTruthy()
    expect((await response.json()).status).toBe('success')
    await page.goto('/system')
    await expect(page.getByText('moodle: Geprüft', { exact: true })).toBeVisible()
    await expect(page.getByText(/Moodle hat für dein Konto nicht zugängliche Aktivitäten/)).toBeVisible()
    await expect(page.getByText(/Moodle konnte nicht alle Aufgaben prüfen/)).toHaveCount(0)
    await expect(page.getByText('fixture-private-message')).toHaveCount(0)
  } finally {
    await page.request.post('/api/__test__/reset')
  }
})
