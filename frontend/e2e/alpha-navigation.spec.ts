// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`simple navigation ${theme} ${width}`, async ({ page }, info) => {
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/more')
      const navigation =
        width === 390 ? page.getByRole('navigation', { name: 'Mobile Navigation' }) : page.locator('.app-nav')
      // Desktop also lists "Neue Notiz", pinned courses and recent objects; the main
      // areas are the nav items of the area groups.
      const core = width === 390
        ? navigation.locator('a:not([href="/more"])')
        : navigation.locator('.sidebar-group:not(.sidebar-courses):not(.sidebar-recents) a.nav-item')
      await expect(core).toHaveText(['Heute', 'Kurse', 'Lernen', 'Notizen', 'Termine'])
      await expect(page.locator('.app-nav').getByRole('button', { name: 'Bibliothek' })).toHaveCount(0)
      const tools = page.locator('.more-tools')
      await expect(tools).not.toHaveAttribute('open', '')
      await expect(tools.getByRole('link', { name: 'Verbindungen und System', exact: true })).not.toBeVisible()
      await expect(page.locator('.content').getByRole('link', { name: 'Räume & Buchung', exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`more-${theme}-${width}.png`), fullPage: true })
      await tools.locator('summary').click()
      await expect(tools.getByRole('link', { name: 'Verbindungen und System', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await navigation.locator('a[href="/deadlines"]').click()
      await expect(page).toHaveURL(/\/deadlines$/)
      await expect(navigation.locator('a[href="/deadlines"]')).toHaveClass(/active/)
    })
  }
}

test('saved sections and course pins survive the simpler default', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'unios-sidebar-layout-v1',
      JSON.stringify({
        version: 1,
        workspace: ['today', 'inbox', 'learning'],
        library: ['notes', 'search'],
        courseOrder: [],
        hiddenCourses: [],
        showCourses: true,
      }),
    ),
  )
  await page.goto('/courses')
  const sidebar = page.locator('.app-sidebar')
  await expect(sidebar.locator('.nav-item')).toHaveText(['Heute', 'Eingang', 'Lernen', 'Notizen', 'Suche'])
  await expect(sidebar.getByRole('link', { name: 'Kurs: Programmieren 1', exact: true })).toBeVisible()
  await page.reload()
  await expect(sidebar.getByRole('link', { name: 'Eingang', exact: true })).toBeVisible()
})

for (const [platform, label] of [
  ['Win32', 'Strg K'],
  ['MacIntel', '⌘ K'],
]) {
  test(`search shortcut matches ${platform}`, async ({ page }) => {
    await page.addInitScript((value) => Object.defineProperty(navigator, 'platform', { get: () => value }), platform)
    await page.goto('/courses')
    await expect(page.locator('.top-search-trigger kbd')).toHaveText(label)
    await page.keyboard.press(platform === 'MacIntel' ? 'Meta+k' : 'Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}
