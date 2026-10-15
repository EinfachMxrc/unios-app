// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { expect, test } from './fixtures'

const sample = `# Zahlendarstellung

:::callout {kind="definition"}

Die **Basis** bestimmt die Stellenwerte einer Zahl. [Quelle](/courses/1)

:::

:::callout {kind="memory" label="Stellenwerte merken"}

Jede Stelle hat das Gewicht $2^k$. Von rechts: **1, 2, 4, 8, 16**.

:::

:::callout {kind="example"}

$(10111)_2 = 16 + 4 + 2 + 1 = 23$.

:::

:::callout {kind="pitfall"}

Das Vorzeichenbit gehört zur gewählten Bitbreite. Werte nicht ohne Bitbreite vergleichen.

:::

:::callout {kind="tip"}

Notiere zuerst die Stellenwerte und prüfe danach deine Rechnung.

:::

:::callout {kind="question"}

Wie entsteht das Zweierkomplement bei fünf Bit?

:::
`

for (const theme of ['light', 'dark'])
  for (const width of [1440, 390]) {
    test(`learning book boxes keep maths and sources ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 })
      await page.addInitScript((theme) => localStorage.setItem('unios-theme', theme), theme)
      const created = await page.request.post('/api/notes', {
        data: { course_id: 1, title: 'Lernbuch · Zahlendarstellung', body: sample },
      })
      expect(created.ok()).toBeTruthy()
      const id = (await created.json()).note.id
      await page.goto(`/notes?id=${id}`)
      const document = page.locator('.rendered-note')
      await expect(document.locator('.studio-callout[data-kind="memory"]')).toContainText('Stellenwerte merken')
      await expect(document.locator('.studio-callout svg')).toHaveCount(6)
      await expect(document.locator('.katex').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: screenshotPath(`../docs/qa/study-note-boxes-20261014/${theme}-${width}.png`),
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
      await page.getByRole('textbox', { name: 'Notizinhalt' }).press('ControlOrMeta+End')
      await page.getByRole('button', { name: 'Bausteine', exact: true }).click()
      await page.getByRole('option', { name: 'Merksatz', exact: true }).click()
      await page.keyboard.insertText('Bitbreite zuerst festlegen.')
      await expect(page.locator('.studio-document')).toContainText('Bitbreite zuerst festlegen.')
      await expect
        .poll(async () => (await (await page.request.get(`/api/notes/${id}`)).json()).body)
        .toContain('Bitbreite zuerst festlegen.')
      await page.reload()
      await expect(page.locator('.rendered-note .studio-callout[data-kind="memory"]')).toHaveCount(2)
      expect((await (await page.request.get(`/api/notes/${id}`)).json()).body).toContain('[Quelle](/courses/1)')
    })
  }

test('Moodle assignment opens an editable solution without automatic creation or submission', async ({ page }) => {
  await page.request.post('/api/__test__/upcoming-assignment')
  const course = await (await page.request.get('/api/courses/1')).json()
  const task = course.assignments.find((item: { removed_upstream: boolean }) => !item.removed_upstream)
  expect(task).toBeTruthy()
  const before = await (await page.request.get('/api/notes?course_id=1')).json()
  await page.goto(`/courses/1#assignment-${task.id}`)
  await page.getByRole('link', { name: 'In der App bearbeiten', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`assignment_id=${task.id}`))
  await expect(page.getByText('Eigene Bearbeitung mit Formeln', { exact: false })).toBeVisible()
  const after = await (await page.request.get('/api/notes?course_id=1')).json()
  expect(after.notes.length).toBe(before.notes.length)
  await expect(page.locator('.studio-document')).toContainText('Eigener Lösungsweg')
  await page.locator('.studio-document h2').filter({ hasText: 'Eigener Lösungsweg' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.insertText('Mein Ansatz: 2^5 = 32.')
  const saving = page.waitForResponse((r) => r.url().endsWith('/api/notes') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  const result = await saving
  expect(result.ok()).toBeTruthy()
  const saved = await result.json()
  expect(saved.body).toContain(`/courses/1#assignment-${task.id}`)
  expect(saved.body).toContain('Mein Ansatz:')
  await page.reload()
  await expect(page.locator('.rendered-note')).toContainText('Mein Ansatz:')
  await page.getByRole('link', { name: 'Aktuelle Aufgabe und Abgabetermin', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/1#assignment-${task.id}`))
})
