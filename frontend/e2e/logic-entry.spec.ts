// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('quick logic equations survive insertion and reload without changing arithmetic drafts', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Logikeingabe · Test', body: 'Vorlesung' },
  })
  expect(created.ok()).toBeTruthy()
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.press('ControlOrMeta+End')
  await body.press('ControlOrMeta+Shift+M')
  const dialog = page.getByRole('dialog', { name: 'Formel schreiben', exact: true })
  await expect(dialog.locator('math-field')).toBeFocused()
  await page.keyboard.type('x+1')
  await dialog.getByRole('button', { name: 'Logik direkt tippen', exact: true }).click()
  const logic = dialog.getByRole('textbox', { name: 'Logikzeile', exact: true })
  await expect(logic).toBeFocused()
  await logic.pressSequentially('A -> B = !A*B')
  await expect(dialog.getByRole('region', { name: 'Logikvorschau' }).locator('annotation')).toHaveText(
    'A \\to B = \\lnot A \\land B',
  )
  await expect(dialog.getByRole('status')).toContainText('Nicht gleichwertig')
  await expect(dialog.getByRole('status')).toContainText('A = 0, B = 0 → links 1, rechts 0')
  await logic.fill('A -> B = !A+B')
  await expect(dialog.getByRole('status')).toContainText('bei allen 4 Belegungen')
  await logic.fill('A -> B =')
  await expect(dialog.getByRole('button', { name: 'Formel einfügen', exact: true })).toBeDisabled()
  await logic.fill('A -> B = !A*B')
  await dialog.getByRole('button', { name: 'Mathematische Formel', exact: true }).click()
  await dialog.locator('summary').filter({ hasText: 'LaTeX bearbeiten' }).click()
  await expect(dialog.getByRole('textbox', { name: 'LaTeX bearbeiten', exact: true })).toHaveValue('x+1')
  await dialog.getByRole('button', { name: 'Logik direkt tippen', exact: true }).click()
  await expect(logic).toHaveValue('A -> B = !A*B')
  await logic.fill('<script>')
  await expect(dialog.getByRole('button', { name: 'Formel einfügen', exact: true })).toBeDisabled()
  await logic.fill('A -> B = !A*B')
  await logic.press('ControlOrMeta+Enter')
  await expect(body).toBeFocused()
  await expect(body.locator('.studio-math .katex')).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  const stored = await (await page.request.get(`/api/notes/${id}`)).json()
  expect(stored.body).toContain('A \\to B = \\lnot A \\land B')
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.reload()
  await expect(page.locator('.rendered-note .katex annotation')).toHaveText('A \\to B = \\lnot A \\land B')
})

test('the truth table also compares both sides and provides a counterexample', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Logikvergleich · Test', body: 'Vorlesung' },
  })
  const id = (await created.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.press('ControlOrMeta+End')
  await body.press('Enter')
  await body.pressSequentially('/wahrheit')
  await body.press('Tab')
  const dialog = page.getByRole('dialog', { name: 'Wahrheitstabelle', exact: true })
  const expression = dialog.getByRole('textbox', { name: 'Logischer Ausdruck', exact: true })
  await expression.fill('A -> B = !A*B')
  await expect(dialog.getByRole('status')).toContainText('A = 0, B = 0 → links 1, rechts 0')
  await expression.fill('A -> B = !A+B')
  await expect(dialog.getByRole('status')).toContainText('bei allen 4 Belegungen')
  await expect(dialog.locator('.logic-table tbody tr')).toHaveCount(4)
  for (const row of await dialog.locator('.logic-table tbody tr').all()) {
    await expect(row.locator('td').last()).toHaveText('1')
  }
  await expression.fill('A = B = C')
  await expect(dialog.getByRole('button', { name: 'Tabelle einfügen', exact: true })).toBeDisabled()
})
