// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('forwarded mail imports from the server mailbox, deduplicates and can pause', async ({ page }) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/forwarded-mail')
  await page.addInitScript(() => {
        const saved = JSON.parse(localStorage.getItem('unios-ui-preferences-v1') || localStorage.getItem('marc-ui-preferences-v1') || '{}')
        localStorage.setItem('unios-ui-preferences-v1', JSON.stringify({ ...saved, modules: { ...saved.modules, mail: true } }))
      })
      await page.goto('/mail')
  await page.locator('.mail-settings > summary').click()
  await expect(page.getByRole('textbox', { name: 'Weiterleitungsadresse' })).toHaveValue('inbox@mail.example.test')
  await expect(page.getByText('Empfang bereit · neue Mails werden alle fünf Minuten übernommen')).toBeVisible()
  await expect(page.getByText('UniOS-Anwendungs-ID (Client-ID)')).not.toBeVisible()
  await page.getByRole('button', { name: 'Nachrichten jetzt lesen', exact: true }).click()
  await expect(page.getByText('Erfundene Weiterleitungsfrist', { exact: true })).toBeVisible()
  await expect(page.getByText('1 Nachrichten gelesen · 1 neue Hinweise')).toBeVisible()
  await page.getByRole('button', { name: 'Nachrichten jetzt lesen', exact: true }).click()
  await expect(page.getByText('0 Nachrichten gelesen · 0 neue Hinweise')).toBeVisible()
  const deadlines = await page.request.get('http://127.0.0.1:8173/api/deadlines')
  expect((await deadlines.json()).deadlines.some((item: { title: string }) => item.title === 'Erfundene Weiterleitungsfrist')).toBe(false)
  await page.getByRole('button', { name: 'Import pausieren' }).click()
  await expect(page.getByRole('button', { name: 'Nachrichten jetzt lesen', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Import fortsetzen' }).click()
  await expect(page.getByRole('button', { name: 'Nachrichten jetzt lesen', exact: true })).toBeEnabled()
})
