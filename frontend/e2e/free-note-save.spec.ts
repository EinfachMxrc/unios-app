// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('a free TipTap composition survives pending remount and quota failure without a second create', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let creates = 0
  let createdId = ''
  let sentBody = ''
  await page.route('**/api/notes', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    creates += 1
    const response = await route.fetch()
    expect(response.ok(), await response.text()).toBeTruthy()
    const created = await response.json()
    createdId = created.note.id
    sentBody = route.request().postDataJSON().body
    await gate
    await route.fulfill({ response })
  })
  try {
    await page.goto('/notes?new=1&course_id=1&title=Freie%20Vorlesung')
    const composition = page.locator('.note-new-canvas').getByRole('textbox', { name: 'Notizinhalt', exact: true })
    await expect(composition).toHaveAttribute('contenteditable', 'true')
    await composition.fill('Gesendeter Abschnitt A.')
    await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
    await expect.poll(() => createdId).toMatch(/^[a-f\d-]{36}$/)
    expect(sentBody).toContain('Gesendeter Abschnitt A.')
    expect(sentBody).not.toContain('Neuer Abschnitt B')
    // Real contentEditable remains operable inside a disabled HTML fieldset.
    // Fail only note recovery copies; keep navigation/cache behavior intact.
    await page.evaluate(() => {
      const original = Storage.prototype.setItem
      const testWindow = window as typeof window & { restoreSyntheticQuota?: () => void }
      testWindow.restoreSyntheticQuota = () => { Storage.prototype.setItem = original }
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('unios:new-note-draft:v1:') || key.startsWith('unios:note-draft:v1:'))
          throw new DOMException('Synthetic note quota', 'QuotaExceededError')
        return original.call(this, key, value)
      }
    })
    const newerBody = 'Gesendeter Abschnitt A. Neuer Abschnitt B während des Speicherns.'
    await composition.fill(newerBody)
    await page.locator('.page-actions a[href="/courses/1"]').click()
    await page.locator('.course-new-note').click()
    await expect(composition).toHaveText(newerBody)
    await expect(page.getByRole('button', { name: 'Speichere …', exact: true })).toBeDisabled()
    expect(creates).toBe(1)
    release()
    await expect(page.getByRole('button', { name: 'Mitschrift fortsetzen', exact: true })).toBeVisible()
    await expect(composition).toHaveText(newerBody)
    await page.getByRole('button', { name: 'Mitschrift fortsetzen', exact: true }).click()
    await expect(page).toHaveURL(/\/notes\?[^#]*new=1/)
    expect(creates).toBe(1)
    await page.evaluate(() => {
      const testWindow = window as typeof window & { restoreSyntheticQuota?: () => void }
      testWindow.restoreSyntheticQuota?.()
      delete testWindow.restoreSyntheticQuota
    })
    await page.getByRole('button', { name: 'Mitschrift fortsetzen', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/notes\\?[^#]*id=${createdId}`))
    await expect.poll(async () => (await (await page.request.get(`/api/notes/${createdId}`)).json()).body).toContain(newerBody)
    expect(creates).toBe(1)
    await page.getByRole('button', { name: 'Neu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Neue Notiz', exact: true }).click()
    await expect(page).toHaveURL(/\/notes\?[^#]*new=1/)
    await expect(composition).not.toHaveText(newerBody)
    await expect(page.getByRole('button', { name: 'Notiz anlegen', exact: true })).toBeVisible()
    expect(creates).toBe(1)
  } finally {
    release()
    if (!page.isClosed()) await page.evaluate(() => {
      const testWindow = window as typeof window & { restoreSyntheticQuota?: () => void }
      testWindow.restoreSyntheticQuota?.()
      delete testWindow.restoreSyntheticQuota
    })
  }
})
