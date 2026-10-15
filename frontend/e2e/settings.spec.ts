// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('modules disappear everywhere and technical details require advanced view', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('main').getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible()
  await page.getByRole('switch', { name: 'Kurse' }).click()
  await page.getByRole('switch', { name: 'Termine' }).click()
  await page.getByRole('switch', { name: 'Hinweise' }).click()
  await page.getByRole('switch', { name: 'Suche' }).click()
  // The simple default has four primary destinations. Disabling courses
  // also hides learning; disabling dates leaves only Today. More remains
  // available so optional areas and settings can still be reached.
  await expect(page.locator('.sidebar-group').filter({ hasText: 'Arbeitsbereich' }).getByRole('link')).toHaveCount(2)
  // "Mehr" is the mobile-only top-bar shortcut (hidden above 900px, see
  // .more-top-link in frontend/src/App.css); on desktop the sidebar's always-on
  // "Mehr" link is the equivalent escape hatch to hidden sections.
  await expect(page.getByRole('link', { name: 'Mehr' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Befehlspalette öffnen' })).toHaveCount(1)
  await page.goto('/')
  await expect(page.getByText('Als Nächstes')).toHaveCount(0)
  await expect(page.getByText('Zuletzt passiert')).toHaveCount(0)
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Bereich ausgeblendet' })).toBeVisible()
  await page.goto('/system')
  // SystemPage.tsx only renders the dedicated Moodle panel (with "Moodle ist
  // verbunden.") when `setupStatus.moodle_available !== false`; this fixture's
  // institution profile ("generic") has no Moodle URL at all, so that panel
  // is hidden and the synced state instead shows up as a line in the generic
  // CapabilitiesPanel summary.
  await expect(page.getByText('Letzter Abgleich erfolgreich')).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(
    /\b(?:Lease|Hash|Generation|Connector|Sidecar|MCP|Token|Staffelstab|Herzschlag)\b/i,
  )
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Erweiterte Ansicht' }).click()
  await page.goto('/system')
  await expect(page.getByText('Datensicherung', { exact: true })).toBeVisible()
})
