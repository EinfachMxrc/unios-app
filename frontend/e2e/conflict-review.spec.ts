// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('review and individually apply a safe action from another device', async ({ page }) => {
  const backend = 'http://127.0.0.1:8173'
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
  const fixture = await page.request.post(`${backend}/api/__test__/conflict-package`)
  expect(fixture.ok()).toBeTruthy()
  const { package_id: packageId } = await fixture.json()

  await page.goto('/')
  await expect(page.getByRole('alert').filter({ hasText: 'Änderungen von einem anderen Gerät prüfen' })).toBeVisible()
  await page.getByRole('link', { name: 'Gesicherte Änderungen ansehen' }).click()
  await expect(page).toHaveURL(/\/system$/)

  await expect(page.getByRole('alert').filter({ hasText: 'Änderungen von einem anderen Gerät prüfen' })).toBeVisible()
  await page.getByRole('button', { name: 'Änderungen ansehen' }).first().click()
  await expect(page.getByText('Freigabe für die KI')).toBeVisible()
  await expect(page.getByText('Datensicherung ausgeführt')).toBeVisible()
  expect((await page.request.post(`${backend}/api/host/conflicts/${packageId}/reviewed`)).status()).toBe(409)
  await page.getByText('Angaben prüfen').first().click()
  await expect(page.getByText('/api/ai/access/category/course_material')).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Diese Änderung übernehmen' }).click()
  await expect(page.getByText('Diese Änderung wurde übernommen.')).toBeVisible()
  await expect(page.getByText('Auf diesem Gerät übernommen.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prüfung abschließen' })).toHaveCount(0)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Einzeln geprüft' }).click()
  await expect(page.getByText('Einzeln geprüft und bei Bedarf manuell übernommen.')).toBeVisible()
  const access = await (await page.request.get(`${backend}/api/ai/access`)).json()
  expect(access.categories.course_material).toBe(false)

  await page.reload()
  await page.getByRole('button', { name: 'Änderungen ansehen' }).first().click()
  await expect(page.getByText('Auf diesem Gerät übernommen.')).toBeVisible()
  await expect(page.getByText('Einzeln geprüft und bei Bedarf manuell übernommen.')).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Prüfung abschließen' }).click()
  await expect(page.getByText('Prüfung abgeschlossen. Die Sicherung bleibt erhalten.')).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('Änderungen von einem anderen Gerät prüfen')).toHaveCount(0)
})
