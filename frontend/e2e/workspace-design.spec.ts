// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('workspace stays readable in light, dark, and phone layouts', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
  await expect(page.getByText('Hier geht es weiter.')).toBeVisible()
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Neue Notiz' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: testInfo.outputPath('workspace-light.png'), fullPage: true })

  await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html.dark')).toHaveCount(1)
  await page.goto('/notes')
  await expect(page.getByText('Deine Seiten', { exact: true })).toBeVisible()
  await expect(page.getByText('Noch keine Notizen')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('workspace-dark-notes.png'), fullPage: true })

  await page.evaluate(() => localStorage.setItem('unios-theme', 'light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('Hier geht es weiter.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link')).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('workspace-phone.png'), fullPage: true })
})

test('sidebar keeps course pages and layout preferences', async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'unios-sidebar-layout-v1',
      JSON.stringify({
        version: 1,
        workspace: ['today', 'courses', 'learning', 'deadlines'],
        library: [],
        courseOrder: [],
        hiddenCourses: [],
        showCourses: true,
      }),
    ),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/courses')
  const courses = page.getByRole('button', { name: /Aktuelle Kurse/ })
  await expect(courses).toBeVisible()
  await courses.click()
  await expect(page.getByRole('link', { name: 'Kurs: Programmieren 1' })).toHaveCount(0)
  await courses.click()
  await page.getByRole('button', { name: 'Unterseiten von Programmieren 1 öffnen' }).click()
  await expect(page.locator('.sidebar-course-children').getByRole('link', { name: 'Notizen' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('sidebar-nested.png') })
  await page.locator('.sidebar-course-children').getByRole('link', { name: 'Notizen' }).click()
  await expect(page).toHaveURL(/\/notes\?course_id=\d+/)
  // After a navigation the new page moves focus to its heading (for screen
  // readers). Focus the handle only after that, or the heading takes it back.
  await expect(page.getByRole('heading', { level: 1, name: 'Notizen' })).toBeFocused()

  const separator = page.getByRole('separator', { name: 'Breite der Seitenleiste' })
  await separator.focus()
  await separator.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '274')
  await page.getByRole('button', { name: 'Seitenleiste ausblenden' }).click()
  await expect(page.getByRole('button', { name: 'Seitenleiste einblenden' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Seitenleiste einblenden' })).toBeVisible()
  await page.getByRole('button', { name: 'Seitenleiste einblenden' }).click()
  await expect(page.getByRole('separator', { name: 'Breite der Seitenleiste' })).toHaveAttribute('aria-valuenow', '274')
  await expect(page.getByRole('button', { name: 'Unterseiten von Programmieren 1 schließen' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true })))
  await expect(page.getByRole('button', { name: 'Seitenleiste einblenden' })).toBeVisible()
})
