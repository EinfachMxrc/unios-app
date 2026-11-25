// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('Ctrl/Cmd+Alt+N captures a jot from any page without leaving it', async ({ page }) => {
  await page.goto('/courses')
  await expect(page.getByRole('main')).toBeVisible()
  const before = page.url()

  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  const field = page.getByRole('dialog').getByRole('textbox', { name: 'Schnell erfassen' })
  await expect(field).toBeFocused()
  await field.fill('Frage zur Übung 3 im Tutorium stellen')
  await field.press('ControlOrMeta+Enter')

  await expect(page.getByRole('dialog').getByText(/Gesichert|Gespeichert/)).toBeVisible()
  await expect(field).toHaveValue('')
  expect(page.url()).toBe(before)
})
