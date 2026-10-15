// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('reviewed container needs install, approval and activation in that order', async ({ page }) => {
  const item = {
    id: 'sample_university',
    package: 'unios-connector-sample',
    package_version: '1.0.0',
    capabilities: ['courses.read'],
    domains: ['example.invalid'],
    secrets: ['demo_token'],
    runtime: 'container',
    fingerprint: 'test-fingerprint',
    installed: false,
    approved: false,
    profile_enabled: true,
  }
  let enabled = false
  await page.route('**/api/connectors/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/install')) item.installed = true
    if (path.endsWith('/approve')) item.approved = true
    if (path.endsWith('/enable')) enabled = route.request().postDataJSON().enabled
    if (path.endsWith('/revoke')) {
      item.approved = false
      enabled = false
    }
    await route.fulfill({
      json: path.endsWith('/registry')
        ? {
            connectors: [item],
            profiles: [{ slug: 'generic', name: 'Eigene Hochschule' }],
            active_profile: 'generic',
            pending_profile: 'generic',
            enabled_connectors: enabled ? [item.id] : [],
          }
        : { restart_required: path.endsWith('/enable') },
    })
  })
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Erweiterte Ansicht' }).click()
  await page.goto('/system')
  const connector = page.getByRole('region', { name: 'sample_university' })
  await connector.getByRole('button', { name: 'Installieren' }).click()
  await expect(connector.getByRole('button', { name: 'Berechtigungen freigeben' })).toBeVisible()
  await connector.getByRole('button', { name: 'Berechtigungen freigeben' }).click()
  await connector.getByLabel('demo_token').fill('invented-secret')
  await connector.getByRole('button', { name: 'Zugang speichern' }).click()
  await expect(connector.getByLabel('demo_token')).toHaveValue('')
  await connector.getByRole('button', { name: 'Aktivieren' }).click()
  await expect(connector.getByText('Verbunden')).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept())
  await connector.getByRole('button', { name: 'Freigabe entziehen' }).click()
  await expect(connector.getByText('Freigabe erforderlich')).toBeVisible()
})
