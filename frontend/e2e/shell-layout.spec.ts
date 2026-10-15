// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('header controls share one row without overlaps at window and sidebar boundaries', async ({ page }, testInfo) => {
  await page.route('**/api/notifications', (route) => route.fulfill({ json: { unread: 102, items: [] } }))
  for (const hidden of [false, true]) {
    await page.addInitScript((value) => {
      localStorage.setItem('unios-sidebar-hidden', value ? '1' : '0')
      localStorage.setItem('unios-sidebar-width', '360')
      localStorage.setItem('unios-theme', 'dark')
    }, hidden)
    for (const width of [320, 390, 768, 900, 901, 1024, 1440, 2301]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const header = page.locator('.app-topbar')
      const search = header.getByRole('button', { name: 'Befehlspalette öffnen' })
      const notification = header.getByRole('button', { name: 'Benachrichtigungen: 99+ ungelesen', exact: true })
      await expect(notification).toHaveAttribute('title', '102 ungelesene Benachrichtigungen')
      await expect(header.locator('.topbar-notification-count')).toHaveText('99+')
      await expect(search).toBeVisible()
      expect(
        await page.locator('.content').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)),
      ).toBeGreaterThanOrEqual(16)
      const frame = (await header.boundingBox())!
      const controls = await header.locator('a, button').all()
      const boxes = []
      for (const control of controls) {
        if (!(await control.isVisible())) continue
        const box = (await control.boundingBox())!
        expect(box.y, `${width}px: control above header`).toBeGreaterThanOrEqual(frame.y)
        expect(box.y + box.height, `${width}px: control below header`).toBeLessThanOrEqual(frame.y + frame.height)
        expect(box.x).toBeGreaterThanOrEqual(frame.x)
        expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width)
        for (const previous of boxes) {
          expect(
            box.x >= previous.x + previous.width - 1 || box.x + box.width <= previous.x + 1,
            `${width}px: overlapping header controls`,
          ).toBeTruthy()
        }
        boxes.push(box)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (width === 901 && !hidden) {
        const sections = await page.locator('.today-workspace > .today-section').all()
        const first = (await sections[0].boundingBox())!
        const second = (await sections[1].boundingBox())!
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height)
      }
      if (width === 2301 || width === 390 || width === 901)
        await page.screenshot({ path: testInfo.outputPath(`header-${width}-${hidden ? 'hidden' : 'shown'}.png`) })
    }
  }
})

test('header remains usable without search and with enlarged text', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ language: 'de', modules: { search: false } }))
  })
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/')
  await expect(page.locator('.top-search-trigger')).toHaveCount(1)
  await expect(
    page.locator('.app-topbar').getByRole('button', { name: /^Benachrichtigungen(?:: \d+\+? ungelesen)?$/ }),
  ).toBeVisible()
  await page.goto('/settings#appearance')
  await page.getByLabel('Schriftgröße').selectOption('150')
  await page.setViewportSize({ width: 390, height: 844 })
  const header = (await page.locator('.app-topbar').boundingBox())!
  const actions = (await page.locator('.topbar-actions').boundingBox())!
  expect(actions.y + actions.height).toBeLessThanOrEqual(header.y + header.height)
  expect(actions.x + actions.width).toBeLessThanOrEqual(390)
})
