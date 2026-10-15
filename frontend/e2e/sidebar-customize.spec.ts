// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('sidebar areas move, hide, return and survive navigation and reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/courses')
  await page.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  const editor = page.getByRole('dialog')
  const courseGroup = editor
    .locator('.sidebar-editor-group')
    .filter({ has: page.getByRole('heading', { name: 'Aktuelle Kurse', exact: true }) })
  await editor.getByLabel('Kursverknüpfungen anzeigen', { exact: true }).check()
  await courseGroup.scrollIntoViewIfNeeded()
  expect(
    await courseGroup.evaluate((element) => {
      const bottom = element.getBoundingClientRect().bottom
      return [...element.querySelectorAll('.sidebar-editor-course')].every(
        (row) => row.getBoundingClientRect().bottom <= bottom,
      )
    }),
  ).toBe(true)
  await editor.getByRole('button', { name: 'Lernen ausblenden', exact: true }).click()
  await editor.getByRole('button', { name: 'Studientage hinzufügen', exact: true }).click()
  await editor.getByRole('button', { name: 'Studientage nach oben', exact: true }).click()
  await editor.getByRole('combobox', { name: 'Bereich für Notizen', exact: true }).selectOption('workspace')
  await editor
    .getByRole('button', { name: 'Notizen verschieben', exact: true })
    .dragTo(editor.getByRole('button', { name: 'Heute verschieben', exact: true }))
  await editor.getByLabel('Programmieren 1', { exact: true }).uncheck()
  await page.screenshot({ path: testInfo.outputPath('sidebar-editor-light.png') })
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  const sidebar = page.locator('.app-sidebar')
  const navigation = sidebar.getByRole('navigation')
  await expect(navigation.getByRole('link', { name: 'Lernen', exact: true })).toHaveCount(0)
  await expect(navigation.locator('.sidebar-group').first().getByRole('link').first()).toHaveText('Notizen')
  await expect(navigation.getByRole('link', { name: 'Studientage', exact: true })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Kurs: Programmieren 1', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(navigation.locator('.sidebar-group').first().getByRole('link').first()).toHaveText('Notizen')
  await navigation.getByRole('link', { name: 'Studientage', exact: true }).click()
  await expect(page).toHaveURL(/\/journal$/)
  await expect(navigation.getByRole('link', { name: 'Lernen', exact: true })).toHaveCount(0)
  await sidebar.getByRole('link', { name: 'Mehr', exact: true }).click()
  await expect(page.locator('.content').getByRole('link', { name: 'Lernen', exact: true })).toBeVisible()
  await sidebar.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  await editor.getByRole('button', { name: 'Lernen hinzufügen', exact: true }).click()
  await editor.getByRole('button', { name: 'Standard wiederherstellen', exact: true }).click()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await page.reload()
  await expect(navigation.getByRole('link', { name: 'Lernen', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Studientage', exact: true })).toHaveCount(0)
  await expect(sidebar.getByRole('link', { name: 'Kurs: Programmieren 1', exact: true })).toBeVisible()
})

test('empty sidebar stays empty and remains recoverable on a phone', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'unios-sidebar-layout-v1',
      JSON.stringify({
        version: 1,
        workspace: [],
        library: [],
        courseOrder: [],
        hiddenCourses: [],
        showCourses: false,
      }),
    )
    localStorage.setItem('unios-theme', 'dark')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/more')
  await page.locator('.content').getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  const editor = page.getByRole('dialog')
  await editor.getByRole('button', { name: 'Studientage hinzufügen', exact: true }).click()
  await expect(editor.getByRole('combobox', { name: 'Bereich für Studientage', exact: true })).toBeVisible()
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('sidebar-editor-phone-dark.png') })
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link', { name: 'Studientage', exact: true }),
  ).toBeVisible()
  await page.reload()
  // Init script seeds storage before every reload, so prove the empty layout is respected.
  await expect(page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link')).toHaveCount(0)
  await page.locator('.content').getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  await editor.getByRole('button', { name: 'Standard wiederherstellen', exact: true }).click()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link')).toHaveCount(5)
})

test('failed storage writes preserve the previous layout', async ({ page }) => {
  await page.goto('/courses')
  await page.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'unios-sidebar-layout-v1') throw new DOMException('Storage full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  const editor = page.getByRole('dialog')
  await editor.getByRole('button', { name: 'Lernen ausblenden', exact: true }).click()
  await expect(editor.getByRole('status')).toHaveText(
    'Speichern nicht möglich. Deine bisherige Auswahl bleibt erhalten.',
  )
  await expect(editor.getByRole('button', { name: 'Lernen ausblenden', exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(page.locator('.app-sidebar').getByRole('link', { name: 'Lernen', exact: true })).toBeVisible()
})
