// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('Aufgabe öffnet sich aus Heute und Fristen ohne Seitenwechsel', async ({ page }) => {
  await page.request.post('/api/__test__/upcoming-assignment')
  await page.goto('/')
  await page.locator('[aria-labelledby="today-next-heading"]').getByRole('button', { name: 'Schleifen üben' }).click()
  const dialog = page.getByRole('dialog', { name: 'Schnellansicht' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((node) => getComputedStyle(node).animationName)).toContain('task-peek-enter')
  expect(await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').animationName)).toContain(
    'task-peek-backdrop-enter',
  )
  await expect(dialog).toContainText('Schleifen üben')
  await expect(dialog).toContainText('Programmieren 1')
  await expect(page).toHaveURL(/\/$/)
  await dialog.getByRole('button', { name: 'Schnellansicht schließen' }).click()
  await expect(dialog).toHaveClass(/is-closing/)
  await expect(dialog).not.toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  await page.getByRole('table', { name: 'Fristen als Tabelle' }).getByRole('button', { name: 'Schleifen üben' }).click()
  await expect(page.getByRole('dialog', { name: 'Schnellansicht' })).toBeVisible()
  expect(
    await page.getByRole('dialog', { name: 'Schnellansicht' }).evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none')
  await expect(page).toHaveURL(/\/deadlines$/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Schnellansicht' })).not.toBeVisible()
})
