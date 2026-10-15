// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function openNote(page: Page, body = 'Start') {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetische Schreibprobe', body },
  })
  expect(response.ok()).toBeTruthy()
  const id = (await response.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  return id as string
}

test('typing headings and bullet points produces visible markers and survives saving', async ({ page }) => {
  const id = await openNote(page)
  const editor = page.locator('.studio-document')
  await editor.click()
  await editor.press('ControlOrMeta+a')
  await editor.press('Backspace')
  await editor.pressSequentially('## Vorlesung')
  await expect(editor.locator('h2')).toHaveText('Vorlesung')
  await editor.press('Enter')
  await editor.pressSequentially('- Erster Gedanke')
  await editor.press('Enter')
  await editor.pressSequentially('Zweiter Gedanke')
  await expect(editor.locator('ul > li')).toHaveCount(2)
  expect(await editor.locator('ul').evaluate((el) => getComputedStyle(el).listStyleType)).toBe('disc')
  await editor.press('Enter')
  await editor.press('Enter')
  await editor.pressSequentially('1. Erster Schritt')
  await expect(editor.locator('ol > li')).toHaveText('Erster Schritt')
  expect(await editor.locator('ol').evaluate((el) => getComputedStyle(el).listStyleType)).toBe('decimal')
  await expect
    .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
    .toContain('Erster Schritt')
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.locator('.rendered-note h2')).toHaveText('Vorlesung')
  expect(await page.locator('.rendered-note ul').evaluate((el) => getComputedStyle(el).listStyleType)).toBe('disc')
  await page.reload()
  await expect(page.locator('.rendered-note ol')).toContainText('Erster Schritt')
})

test('Markdown Enter and Tab continue bullets, numbering and checklists without editing code', async ({ page }) => {
  await openNote(page, '- Gelesen')
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await source.fill('- Gelesen')
  await source.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(field.value.length, field.value.length))
  await source.press('Enter')
  await expect(source).toHaveValue('- Gelesen\n- ')
  await source.press('Tab')
  await source.pressSequentially('Frage')
  await expect(source).toHaveValue('- Gelesen\n  - Frage')
  await source.press('Shift+Tab')
  await expect(source).toHaveValue('- Gelesen\n- Frage')
  await source.fill('9. Schritt')
  await source.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(field.value.length, field.value.length))
  await source.press('Enter')
  await expect(source).toHaveValue('9. Schritt\n10. ')
  await source.press('Enter')
  await expect(source).toHaveValue('9. Schritt\n')
  await source.fill('- [x] Gelesen')
  await source.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(field.value.length, field.value.length))
  await source.press('Enter')
  await expect(source).toHaveValue('- [x] Gelesen\n- [ ] ')
  await source.fill('```text\n- wörtlich')
  await source.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(field.value.length, field.value.length))
  await source.press('Enter')
  await expect(source).toHaveValue('```text\n- wörtlich\n')
})

test('typed checklist only converts its own bullet and leaves surrounding text intact', async ({ page }) => {
  await openNote(page, '- Erster Gedanke')
  const editor = page.locator('.studio-document')
  await editor.click()
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await editor.pressSequentially('[ ] Wiederholen')
  await expect(editor.locator('ul:not([data-type=taskList]) > li')).toHaveText('Erster Gedanke')
  await expect(editor.locator('[data-type=taskList]')).toContainText('Wiederholen')
  await expect(editor.locator('input[type=checkbox]')).not.toBeChecked()
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`list readability and heading layout ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript((theme) => localStorage.setItem('unios-theme', theme), theme)
      await openNote(
        page,
        '# Vorlesung\n\n## Gedanke\n\n- Erster Punkt\n  - Unterpunkt\n\n1. Erster Schritt\n2. Zweiter Schritt\n\n- [ ] Eigene Frage beantworten',
      )
      const editor = page.locator('.studio-document')
      expect(
        await editor
          .locator('ul:not([data-type=taskList])')
          .first()
          .evaluate((el) => getComputedStyle(el).listStyleType),
      ).toBe('disc')
      expect(await editor.locator('ul ul').evaluate((el) => getComputedStyle(el).listStyleType)).toBe('circle')
      expect(await editor.locator('[data-type=taskList]').evaluate((el) => getComputedStyle(el).listStyleType)).toBe(
        'none',
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({
        path: screenshotPath(`../docs/qa/comparison-improvements-20261014/editor-${theme}-${width}.png`),
        fullPage: true,
      })
    })
  }
}
