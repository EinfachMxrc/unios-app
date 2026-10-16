// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

async function editor(page: Page, body = 'Mitschrift: ') {
  const created = await page.request.post('/api/notes', { data: { course_id: 1, title: 'Logik und Mathematik', body } })
  expect(created.ok()).toBeTruthy()
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.locator('.note-prose')).toBeVisible()
  await page.getByRole('textbox', { name: 'Notizinhalt' }).press('ControlOrMeta+End')
  return id
}

async function fraction(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Formel schreiben' })
  await expect(dialog.locator('math-field')).toBeVisible()
  await dialog.getByRole('button', { name: 'Bruch', exact: true }).click()
  await expect(dialog.locator('math-field')).toBeFocused()
  await page.keyboard.type('1')
  await page.keyboard.press('Tab')
  await page.keyboard.type('2')
  await expect(dialog.getByRole('button', { name: 'Formel einfügen', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Formel einfügen', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('a fraction can be written visually, edited, cancelled and reopened as portable math', async ({ page }) => {
  const remote: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:')) remote.push(request.url())
  })
  const id = await editor(page)
  await page.getByRole('button', { name: 'Formel', exact: true }).click()
  await fraction(page)
  await expect(page.locator('.note-prose .studio-math .katex')).toHaveCount(1)
  await page.getByRole('button', { name: 'Formel bearbeiten', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Formel schreiben' })
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click()
  await expect(page.locator('.note-prose .studio-math .katex')).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const saved = (await (await page.request.get(`/api/notes/${id}`)).json()).body
  expect(saved).toContain('Mitschrift:')
  expect(saved).toContain('$\\frac12$')
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.locator('.rendered-note .katex')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.rendered-note .katex')).toHaveCount(1)
  expect(remote).toEqual([])
})

test('a slash command inserts a matrix as a block with keyboard navigation and undo', async ({ page }) => {
  await editor(page, 'Vorlesung: ')
  const body = page.getByRole('textbox', { name: 'Notizinhalt' })
  await body.press('Enter')
  await body.pressSequentially('/gleichung')
  await expect(page.getByRole('option', { name: 'Gleichung', exact: true })).toBeVisible()
  await body.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Formel schreiben' })
  await expect(dialog.locator('math-field')).toBeVisible()
  await dialog.getByRole('button', { name: '2×2-Matrix', exact: true }).click()
  await expect(dialog.locator('math-field')).toBeFocused()
  for (const value of ['1', '2', '3', '4']) {
    await page.keyboard.type(value)
    if (value !== '4') await page.keyboard.press('Tab')
  }
  await expect(dialog.getByRole('button', { name: 'Formel einfügen' })).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.note-prose .studio-math-block .katex')).toHaveCount(1)
  await page.getByRole('button', { name: 'Rückgängig (Strg/⌘+Z)', exact: true }).click()
  await expect(page.locator('.note-prose .studio-math')).toHaveCount(0)
  await page.getByRole('button', { name: 'Wiederholen (Strg/⌘+Shift+Z)', exact: true }).click()
  await expect(page.locator('.note-prose .studio-math-block .katex')).toHaveCount(1)
})

test('truth tables show all combinations and intermediate steps without damaging a note on invalid input', async ({
  page,
}) => {
  const id = await editor(page, 'Vor der Tabelle.')
  await page.getByRole('button', { name: 'Wahrheitstabelle', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Wahrheitstabelle', exact: true })
  await dialog.getByRole('textbox', { name: 'Logischer Ausdruck' }).fill('(A + B) · !C')
  await dialog.getByRole('checkbox', { name: 'Zwischenschritte zeigen' }).check()
  await expect(dialog.locator('.truth-intermediate tbody tr')).toHaveCount(8)
  await expect(dialog.locator('.truth-intermediate thead th')).toHaveCount(6)
  await dialog.getByRole('textbox', { name: 'Logischer Ausdruck' }).fill('A &')
  await expect(dialog.getByRole('button', { name: 'Tabelle einfügen' })).toBeDisabled()
  expect((await (await page.request.get(`/api/notes/${id}`)).json()).body).toBe('Vor der Tabelle.')
  await dialog.getByRole('textbox', { name: 'Logischer Ausdruck' }).fill('A XOR B')
  await dialog.getByRole('button', { name: 'Tabelle einfügen' }).click()
  await expect(page.locator('.note-prose table').last().locator('tbody tr')).toHaveCount(5)
  await expect(page.locator('.note-prose table').last()).toContainText('(A ⊕ B)')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(page.locator('.rendered-note table').last()).toContainText('(A ⊕ B)')
})

test('PDF notes accept formulas and truth tables at the caret and keep a local draft after reload', async ({
  page,
}) => {
  await page.goto('/material/1')
  await expect(page.locator('[data-material-page="1"] [data-reader-render-active="true"] canvas')).toBeVisible()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  const tools = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  await tools.getByRole('tab', { name: 'Mitschrift', exact: true }).click()
  const body = tools.getByRole('textbox', { name: 'Notizinhalt' })
  await body.fill('Anfang Ende')
  await body.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(7, 7))
  await tools.getByRole('button', { name: 'Formel', exact: true }).click()
  await fraction(page)
  await expect(body).toHaveValue('Anfang $\\frac12$Ende')
  await tools.getByRole('button', { name: 'Wahrheitstabelle', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Wahrheitstabelle', exact: true })
    .getByRole('button', { name: 'Tabelle einfügen' })
    .click()
  await expect(body).toHaveValue(/\| 1 \| 1 \| \$A\\,B\$ \| \*\*1\*\* \|/)
  const written = await body.inputValue()
  await tools.getByRole('button', { name: 'Vorschau', exact: true }).click()
  await expect(tools.locator('.reader-note-preview table th .katex')).toHaveCount(3)
  await expect(tools.locator('.reader-note-preview table td .katex')).toHaveCount(4)
  await expect(tools.locator('.reader-note-preview')).toContainText('Eins-Zeilen mit ODER verbinden')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt' })).toHaveValue(written)
})

test('a 120-page overview renders only nearby thumbnails and jumps to the last page', async ({ page }) => {
  const fixture = await page.request.get('/api/__test__/long-reader.pdf?pages=120')
  expect(fixture.ok()).toBeTruthy()
  const pdf = await fixture.body()
  await page.route('**/files/1/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
  await page.goto('/material/1')
  await expect(page.locator('[data-material-page="1"] [data-reader-render-active="true"] canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Seitenübersicht', exact: true }).click()
  const overview = page.getByRole('region', { name: 'Seitenübersicht', exact: true })
  await expect(overview.getByRole('button')).toHaveCount(120)
  await expect(overview.locator('canvas').first()).toBeVisible()
  expect(await overview.locator('canvas').count()).toBeLessThan(20)
  await overview.getByRole('button', { name: 'Seite 120 öffnen', exact: true }).click()
  await expect(page.locator('[data-material-page="120"] [data-reader-render-active="true"] canvas')).toBeVisible()
  await expect(page.locator('.material-pager')).toContainText('Seite 120 von 120')
  await expect(overview.getByRole('button', { name: 'Seite 120 öffnen', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(await overview.locator('canvas').count()).toBeLessThan(20)
})

for (const theme of ['light', 'dark'])
  for (const width of [1440, 390]) {
    test(`formula and logic tools remain usable in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      await editor(page)
      await page.getByRole('button', { name: 'Formel', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Formel schreiben', exact: true })
      await expect(dialog.locator('math-field')).toBeVisible()
      const directory = path.resolve('..', process.env.UNIOS_QA_DIRECTORY || 'docs/qa/study-writing-20261007')
      await mkdir(directory, { recursive: true })
      await page.screenshot({ path: screenshotPath(path.join(directory, `formula-${theme}-${width}.png`)) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (width === 390) {
        await dialog.locator('math-field [part="virtual-keyboard-toggle"]').click()
        await expect(dialog.locator('.math-keyboard-container .ML__keyboard')).toBeVisible()
        await dialog.locator('.math-keyboard-container .MLK__layer.is-visible [aria-label="7"]').click()
        await expect(dialog.getByRole('button', { name: 'Formel einfügen', exact: true })).toBeEnabled()
        await page.screenshot({ path: screenshotPath(path.join(directory, `keyboard-${theme}-${width}.png`)) })
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      }
      await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click()
      await page.getByRole('button', { name: 'Wahrheitstabelle', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Wahrheitstabelle', exact: true }).locator('tbody tr')).toHaveCount(
        4,
      )
      await page.screenshot({ path: screenshotPath(path.join(directory, `logic-${theme}-${width}.png`)) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })
  }
