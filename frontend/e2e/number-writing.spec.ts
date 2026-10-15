// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import { mkdir } from 'node:fs/promises'

test('plain powers and number bases format while typing, including compound bases', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Komplement · Test', body: 'Mitschrift: ' },
  })
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.press('ControlOrMeta+End')
  await body.pressSequentially('2^15 (-9)10 (10111)2 (2^5-1)10 ')
  await expect(body.locator('.katex')).toHaveCount(4)
  await expect(body.locator('.katex annotation')).toHaveText([
    '2^{15}',
    '\\left(-9\\right)_{10}',
    '\\left(10111\\right)_{2}',
    '\\left(2^{5}-1\\right)_{10}',
  ])
  await body.press('Enter')
  await body.pressSequentially('(01110)2')
  await body.press('Enter')
  await body.pressSequentially('+(10111)2')
  await body.press('Enter')
  await body.pressSequentially('=(00101)2')
  await body.press('Enter')
  await expect(body.locator('.studio-math-block')).toHaveCount(1)
  await expect(body.locator('.studio-math-block .katex annotation')).toContainText('\\hline')
  await body.pressSequentially('Weiter schreiben.')
  await expect(body).toContainText('Weiter schreiben.')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const saved = (await (await page.request.get(`/api/notes/${id}`)).json()).body
  expect(saved).toContain('2^{15}')
  expect(saved).toContain('00101')
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.reload()
  await expect(page.locator('.rendered-note .katex')).toHaveCount(5)
  await mkdir('/tmp/unios-number-writing-20261014', { recursive: true })
  await page.screenshot({ path: screenshotPath('/tmp/unios-number-writing-20261014/notation.png'), fullPage: true })
})

test('PDF preview formats familiar writing and literal code stays literal', async ({ page }) => {
  await page.goto('/material/1')
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  const tools = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  await tools.getByRole('tab', { name: 'Mitschrift', exact: true }).click()
  await tools
    .getByRole('textbox', { name: 'Notizinhalt' })
    .fill('2^5 und (-9)10 = (10111)2\n\n(01110)2\n+(10111)2\n=(00101)2\n\n`2^5 (9)10`')
  await tools.getByRole('button', { name: 'Vorschau', exact: true }).click()
  await expect(tools.locator('.reader-note-preview .katex')).toHaveCount(4)
  await expect(tools.locator('.reader-note-preview .studio-math-block')).toHaveCount(1)
  await expect(tools.locator('.reader-note-preview code')).toContainText('2^5 (9)10')
})
