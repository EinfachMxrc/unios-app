// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'

test('course and note actions share the page heading and preserve the creation flow', async ({ page }) => {
  await page.goto('/courses/1')
  const heading = page.locator('main > .page-heading')
  await expect(heading.getByRole('heading', { level: 1 })).toHaveText('Programmieren 1')
  await heading.getByRole('link', { name: 'Neue Notiz', exact: true }).click()
  await expect(page).toHaveURL(/\/notes\?new=1&course_id=1$/)
  await expect(heading.getByRole('button', { name: 'Neue Notiz', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Notiztitel', exact: true }).fill('Meine Lernseite')
  await page.locator('.studio-document').fill('Meine Erklärung bleibt direkt bearbeitbar.')
  await page.locator('[data-workspace-tab]').first().focus()
  await expect(page.locator('.studio-document')).toHaveText('Meine Erklärung bleibt direkt bearbeitbar.')
})

test('quiet formatting controls become available with keyboard focus and keep Markdown output', async ({ page }) => {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetische Formatierung', body: 'Mein Text' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const note = await response.json()
  await page.goto(`/notes?id=${note.note.id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.locator('.studio-document')).toBeVisible()
  await page.mouse.move(0, 0)
  const bold = page.getByRole('button', { name: 'Fett (Strg+B)', exact: true })
  await expect(bold).toBeHidden()
  await page.getByRole('combobox', { name: 'Texttyp', exact: true }).focus()
  await expect(bold).toBeVisible()
  await page.locator('.studio-document').click()
  await page.locator('.studio-document').press('ControlOrMeta+a')
  await bold.click()
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(page.locator('textarea.note-textarea')).toHaveValue('**Mein Text**')
})

for (const width of [1440, 390]) {
  test(`page headings and contextual actions fit at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    const directory = path.resolve('..', 'docs/qa/notion-page-chrome-20261016')
    await mkdir(directory, { recursive: true })
    for (const [name, route] of [
      ['course', '/courses/1'],
      ['notes', '/notes'],
      ['collections', '/collections'],
    ]) {
      await page.goto(route)
      await expect(page.locator('main > .page-heading h1')).toBeVisible()
      await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0)
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.screenshot({
          path: path.join(directory, `${name}-${theme}-${width}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }
    }
  })
}
