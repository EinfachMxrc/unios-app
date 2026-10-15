// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('independent sidebar viewport survives Mail and other eager and lazy route changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.addInitScript(() => {
    localStorage.setItem(
      'unios-ui-preferences-v1',
      JSON.stringify({ advanced: true, modules: { mail: true, projects: true, grades: true } }),
    )
    localStorage.setItem(
      'unios-sidebar-layout-v1',
      JSON.stringify({
        version: 1,
        workspace: ['today', 'courses', 'learning', 'notes', 'deadlines'],
        library: [
          'search',
          'voice',
          'collections',
          'rules',
          'journal',
          'jots',
          'mail',
          'mensa',
          'activity',
          'projects',
          'grades',
        ],
        courseOrder: [],
        hiddenCourses: [],
        showCourses: true,
        showRecent: true,
      }),
    )
  })
  await page.goto('/')
  await expect(page.locator('.today-workspace')).toBeVisible()
  const nav = page.locator('.app-nav')
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Element && event.target.closest('.app-nav a'))
          (window as Window & { sidebarClickTop?: number }).sidebarClickTop =
            document.querySelector('.app-nav')!.scrollTop
      },
      true,
    ),
  )
  // Every link is reached with a real click; navigating must preserve its current viewport.
  for (const path of ['/mail', '/mensa', '/activity', '/projects', '/grades', '/courses', '/notes', '/deadlines']) {
    const link = nav.locator(`a[href="${path}"]`).first()
    await link.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
    await link.click()
    const top = await page.evaluate(() => (window as Window & { sidebarClickTop?: number }).sidebarClickTop!)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('main .page-heading h1')).toBeVisible()
    await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0)
    await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBeCloseTo(top, 0)
  }
  // Back and forward use the same sidebar viewport independently of document scrolling.
  await nav.hover()
  const current = await nav.evaluate((element) => element.scrollTop)
  await page.mouse.wheel(0, 155 - current)
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBe(155)
  await page.goBack()
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBe(155)
  await page.goForward()
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBe(155)
})
