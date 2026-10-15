// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('addon catalog gates a focus tool and renders it through UniOS', async ({ page }) => {
  await page.goto('/addons')
  await expect(page.getByRole('heading', { name: 'Erweiterungen' })).toBeVisible()
  const card = page.locator('.addon-catalog-card').filter({ hasText: 'Fokus-Timer' })
  await expect(card.getByText('Keine Notizen · keine Dateien · kein Internet')).toBeVisible()
  if (await card.getByRole('button', { name: 'Entfernen' }).count()) {
    page.once('dialog', (dialog) => void dialog.accept())
    await card.getByRole('button', { name: 'Entfernen' }).click()
  }
  await page.goto('/addons/org.unios.focus-timer')
  await expect(page.getByText('Addon ist nicht freigegeben und aktiviert')).toBeVisible()
  await page.goto('/addons')
  await card.getByRole('button', { name: 'Installieren' }).click()
  await card.getByRole('button', { name: 'Rechte freigeben' }).click()
  await card.getByRole('button', { name: 'Aktivieren' }).click()
  await card.getByRole('link', { name: 'Öffnen' }).click()
  await expect(page.getByRole('timer')).toContainText('25:00')
  await page.getByRole('button', { name: 'Starten' }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.goto('/more')
  await expect(page.getByRole('link', { name: 'Fokus-Timer' })).toHaveCount(1)
  await page.goto('/addons')
  page.once('dialog', (dialog) => void dialog.accept())
  await card.getByRole('button', { name: 'Freigabe entziehen' }).click()
  await page.goto('/addons/org.unios.focus-timer')
  await expect(page.getByText('Addon ist nicht freigegeben und aktiviert')).toBeVisible()
})

test('UI addon shows permitted course data on Heute and disappears after revoke', async ({ page }) => {
  await page.goto('/addons')
  const card = page.locator('.addon-catalog-card').filter({ hasText: 'Kursblick' })
  await card.getByRole('button', { name: 'Installieren' }).click()
  await card.getByRole('button', { name: 'Rechte freigeben' }).click()
  await card.getByRole('button', { name: 'Aktivieren' }).click()
  await page.goto('/')
  const widget = page.locator('.addon-widget').filter({ hasText: 'Deine Kurse' })
  await expect(widget).toBeVisible()
  await expect(widget.getByRole('link', { name: 'Mathematik' })).toBeVisible()
  await page.goto('/addons')
  page.once('dialog', (dialog) => void dialog.accept())
  await card.getByRole('button', { name: 'Freigabe entziehen' }).click()
  await page.goto('/')
  await expect(page.locator('.addon-widget').filter({ hasText: 'Deine Kurse' })).toHaveCount(0)
})
