// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
import { writeNote } from './noteEditor'

test('preview main workspace surfaces', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
  await expect(page.locator('.course-list-row').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('courses.png'), fullPage: true })

  await page.goto('/deadlines')
  await expect(page.getByRole('heading', { name: 'Termine', exact: true, level: 1 })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('deadlines.png'), fullPage: true })

  await page.goto('/notes?new=1')
  await expect(page.getByRole('heading', { name: 'Notizen', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Notiztitel' }).fill('Vorlesung 04: Schleifen')
  await writeNote(page, [
    '## Kernkonzepte',
    'Mit Schleifen lassen sich wiederkehrende Aufgaben automatisieren.',
    '- for durchläuft eine Folge.',
    'while wiederholt bis zur Bedingung.',
    '',
    '## Offene Fragen',
    'Wann ist eine while-Schleife besser?',
  ])
  await page.getByRole('button', { name: 'Notiz anlegen' }).click()
  await expect(
    page.locator('.note-document').getByRole('heading', { name: 'Vorlesung 04: Schleifen', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('notes.png'), fullPage: true })
  await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html.dark')).toHaveCount(1)
  await expect(
    page.locator('.note-document').getByRole('heading', { name: 'Vorlesung 04: Schleifen', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('notes-dark.png'), fullPage: true })
  await page.evaluate(() => localStorage.setItem('unios-theme', 'light'))

  await page.goto('/courses')
  await page.locator('.course-list-row').filter({ hasText: 'Programmieren 1' }).click()
  const resource = page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
  await resource.getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page.locator('[data-material-page="1"] .react-pdf__Page__textContent')).toContainText(
    'Schleifen und Python Beispiele',
  )
  await page.screenshot({ path: testInfo.outputPath('material.png') })

  await page.goto('/learning')
  await expect(page.getByText('Offene Fragen', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('learning.png'), fullPage: true })
})
