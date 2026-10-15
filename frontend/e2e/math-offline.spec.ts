// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('locally precached fonts support first formula entry and display offline', async ({ page, context }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Offline Mathe · Test', body: 'Vorlesung' },
  })
  expect(created.ok()).toBeTruthy()
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(body).toBeVisible()
  const fontFailures: string[] = []
  page.on('requestfailed', (request) => {
    if (/\.woff2(?:\?|$)/.test(request.url())) fontFailures.push(request.url())
  })
  await context.setOffline(true)
  try {
    await body.press('ControlOrMeta+End')
    await body.press('ControlOrMeta+Shift+M')
    const dialog = page.getByRole('dialog', { name: 'Formel schreiben', exact: true })
    await expect(dialog.locator('math-field')).toBeFocused()
    await page.keyboard.type('sqrt(x)+1/2')
    await expect(dialog.getByRole('button', { name: 'Formel einfügen', exact: true })).toBeEnabled()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(body.locator('.katex')).toHaveCount(1)
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return Array.from(document.fonts).filter((font) => font.family.includes('KaTeX') && font.status === 'loaded')
        .length
    })
    expect(loaded).toBeGreaterThan(0)
    expect(fontFailures).toEqual([])
    await expect(body).toBeFocused()
    await page.keyboard.type(' weiter')
    await expect(body).toContainText('weiter')
  } finally {
    await context.setOffline(false)
  }
})
