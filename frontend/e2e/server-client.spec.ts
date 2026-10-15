// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('native server pairing gates the app and does not expose the device credential', async ({ page }, testInfo) => {
  let configured = false
  let attempts = 0
  await page.route('**/api/recovery/status', route => route.fulfill({ json: { mode: 'client', background_work: false } }))
  await page.route('**/api/client/status', (route) => route.fulfill({ json: {
    mode: 'client', configured, server_url: 'https://study.example.invalid/unios', keyring_available: true,
  } }))
  await page.route('**/api/client/pair', async (route) => {
    const payload = route.request().postDataJSON()
    expect(payload.server_url).toBe('https://study.example.invalid/unios')
    attempts++
    if (attempts === 1) return route.fulfill({ status: 401, json: { detail: 'Expired fixture' } })
    expect(payload.pairing_secret).toBe('fixture-valid-code')
    configured = true
    await route.fulfill({ json: { mode: 'client', configured: true, server_url: payload.server_url, keyring_available: true } })
  })
  await page.route('**/api/host', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ json: { ...await response.json(), topology: 'server' } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dein Studium. Ein guter Anfang.' })).toBeVisible()
  await page.getByRole('button', { name: 'Meine Hochschule verbinden' }).click()
  await expect(page.getByRole('heading', { name: 'Dein Studium auf allen Geräten' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('server-pairing-desktop.png') })
  await page.getByLabel('Gerätecode', { exact: true }).fill('fixture-expired-code')
  await page.getByRole('button', { name: 'Verbinden', exact: true }).click()
  await expect(page.getByText('Der Gerätecode ist ungültig oder abgelaufen. Bitte einen neuen Code verwenden.')).toBeVisible()
  await page.getByLabel('Gerätecode', { exact: true }).fill('fixture-valid-code')
  await page.getByRole('button', { name: 'Verbinden', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Einstellungen', exact: true }).click()
  await page.getByRole('navigation', { name: 'Einstellungsbereiche' }).getByRole('link', { name: 'Daten & Sync', exact: true }).click()
  await expect(page).toHaveURL(/\/settings#data$/)
  await page.getByText('Details zu Verbindung, Sicherung und Export').click()
  await expect(page.getByText('Mit deinem Server gekoppelt')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gerät koppeln', exact: true })).toBeVisible()
  await expect(page.getByLabel('Gerätecode', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Gerät erneut koppeln' }).click()
  await expect(page.getByLabel('Serveradresse')).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Gerätecode', { exact: true })).toHaveValue('')
})
