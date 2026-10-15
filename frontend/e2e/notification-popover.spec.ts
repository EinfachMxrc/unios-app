// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

const notificationButtonName = /^Benachrichtigungen(?:: \d+\+? ungelesen)?$/

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post('http://127.0.0.1:8173/api/__test__/reset')
  expect(reset.ok()).toBeTruthy()
})

test('bell opens an overlay; mark all clears Today and survives reload', async ({ page }) => {
  let newArrival = false
  // A portal import may not have a dedicated notification. Its hint clears too.
  await page.route('**/api/overview', async (route) => {
    const overview = await (await route.fetch()).json()
    overview.changes.push({
      id: 900,
      kind: 'new',
      summary: 'Zusätzliches Hochschuldokument',
      created_at: new Date().toISOString(),
      resource_id: null,
      assignment_id: null,
      course_id: null,
    })
    if (newArrival)
      overview.changes.push({
        id: 901,
        kind: 'new',
        summary: 'Späteres Hochschuldokument',
        created_at: new Date().toISOString(),
        resource_id: null,
        assignment_id: null,
        course_id: null,
      })
    await route.fulfill({ json: overview })
  })
  await page.goto('/')
  const materials = page.locator('.today-summary a[href="/activity?kind=new"]')
  await expect(materials).toBeVisible()
  const bell = page.getByRole('button', { name: notificationButtonName })
  await bell.click()
  const popup = page.getByRole('dialog', { name: 'Benachrichtigungen', exact: true })
  await expect(popup).toBeVisible()
  await expect(page).toHaveURL(new URL('/', test.info().project.use.baseURL).href)
  await expect(popup.locator('.notification-preview').first()).toBeVisible()
  await popup.getByRole('button', { name: 'Alle als gesehen markieren' }).click()
  await expect(popup.getByText('Alles gesehen', { exact: true })).toBeVisible()
  await expect(page.locator('.topbar-notification-count')).toHaveCount(0)
  await expect(materials).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect(bell).toBeFocused()
  await page.reload()
  await expect(page.locator('.today-intro')).toBeVisible()
  await expect(materials).toHaveCount(0)
  await expect(page.locator('.topbar-notification-count')).toHaveCount(0)
  newArrival = true
  await page.reload()
  await expect(materials).toHaveText('1 neue Unterlage')
})

test('preview opens details and persists its individual read state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: notificationButtonName }).click()
  const preview = page.locator('.notification-preview.is-unread').first()
  const title = await preview.locator('.notification-preview-title').innerText()
  const before = await (await page.request.get('/api/notifications')).json()
  const selected = before.items.find((item: { title: string }) => item.title === title)
  expect(selected).toBeTruthy()
  await preview.click()
  await expect(page).toHaveURL(new URL(selected.url, test.info().project.use.baseURL).href)
  const after = await (await page.request.get('/api/notifications')).json()
  expect(after.items.find((item: { id: number }) => item.id === selected.id).read_at).toBeTruthy()
  expect(after.unread).toBe(before.unread - 1)
})

test('failed acknowledgement preserves unread badge and Today count', async ({ page }) => {
  await page.route('**/api/notifications/read-all', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Fixture unavailable' } }),
  )
  await page.goto('/')
  const materials = page.locator('.today-summary a[href="/activity?kind=new"]')
  await expect(materials).toBeVisible()
  const badge = page.locator('.topbar-notification-count')
  const count = await badge.innerText()
  await page.getByRole('button', { name: notificationButtonName }).click()
  await page.getByRole('button', { name: 'Alle als gesehen markieren' }).click()
  await expect(page.locator('.notification-popover').getByRole('alert')).toBeVisible()
  await expect(badge).toHaveText(count)
  await expect(materials).toBeVisible()
})

test('many long previews scroll within a small window; empty state also opens', async ({ page }, testInfo) => {
  const original = await (await page.request.get('/api/notifications')).json()
  const items = Array.from({ length: 12 }, (_, index) => ({
    ...original.items[0],
    id: 1000 + index,
    title: `Beispielskript ${index + 1} – Grundlagen und ausführliche Hinweise zur nächsten Übung`,
    body: 'Ein längerer Vorschautext mit Einzelheiten zum Inhalt, der sich über mehrere Zeilen erstreckt.',
  }))
  await page.route('**/api/notifications', (route) => route.fulfill({ json: { ...original, items, unread: 12 } }))
  await page.setViewportSize({ width: 390, height: 560 })
  await page.goto('/')
  await page.getByRole('button', { name: notificationButtonName }).click()
  const popup = page.locator('.notification-popover')
  await expect(popup.locator('.notification-preview')).toHaveCount(6)
  await expect(popup.getByRole('button', { name: 'Alle als gesehen markieren' })).toBeVisible()
  await expect(popup.getByRole('link', { name: 'Alle Benachrichtigungen ansehen' })).toBeVisible()
  expect(
    await popup
      .locator('.notification-popover-list')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBeTruthy()
  const box = (await popup.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(560)
  await page.screenshot({ path: testInfo.outputPath('notifications-many-390.png') })
  await page.keyboard.press('Escape')
  await page.unroute('**/api/notifications')
  await page.route('**/api/notifications', (route) => route.fulfill({ json: { ...original, items: [], unread: 0 } }))
  await page.reload()
  await page.getByRole('button', { name: notificationButtonName }).click()
  await expect(popup.locator('.notification-popover-empty')).toBeVisible()
  await expect(popup.getByRole('button', { name: 'Alle als gesehen markieren' })).toBeDisabled()
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`notification overlay fits ${theme} ${width}px`, async ({ page }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await page.getByRole('button', { name: notificationButtonName }).click()
      const popup = page.locator('.notification-popover')
      await expect(popup).toBeVisible()
      await expect(popup.getByRole('button', { name: 'Alle als gesehen markieren' })).toBeEnabled()
      await expect(popup.getByRole('link', { name: 'Alle Benachrichtigungen ansehen' })).toBeVisible()
      const box = (await popup.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeLessThanOrEqual(900)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`notifications-${theme}-${width}.png`) })
      await page.mouse.click(2, 200)
      await expect(popup).toHaveCount(0)
    })
  }
}

test('unread filter and individual acknowledgement keep the menu open and update the badge', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: notificationButtonName }).click()
  const popup = page.locator('.notification-popover')
  await popup.getByRole('button', { name: /^Ungelesen/ }).click()
  const count = await popup.locator('.notification-preview.is-unread').count()
  const first = popup.locator('.notification-preview-row').first()
  const label = await first.locator('.notification-preview-title').innerText()
  await first.getByRole('button', { name: /^Als gelesen markieren:/ }).click()
  await expect(popup).toBeVisible()
  await expect(popup.locator('.notification-preview.is-unread')).toHaveCount(count - 1)
  await popup.getByRole('button', { name: 'Alle', exact: true }).click()
  await expect(popup.locator('.notification-preview').filter({ hasText: label }).first()).not.toHaveClass(/is-unread/)
})

test('Uli reacts expressively to clicks and respects reduced motion', async ({ page }, testInfo) => {
  await page.goto('/')
  const owl = page.getByRole('button', { name: 'Uli, die UniOS-Eule: etwas sagen lassen', exact: true })
  await owl.click()
  await expect(page.locator('.uli-buddy .mascot')).toHaveClass(/mascot-waving/)
  await expect(page.locator('.uli-bubble')).not.toBeEmpty()
  await page.waitForTimeout(950)
  await owl.click()
  await expect(page.locator('.uli-buddy')).toHaveClass(/is-bow/)
  await page.waitForTimeout(950)
  await owl.click()
  await expect(page.locator('.uli-buddy')).toHaveClass(/is-celebrate/)
  await page.screenshot({ path: testInfo.outputPath('uli-celebrating.png') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.mascot-figure')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.mascot-eyes')).toHaveCSS('animation-name', 'none')
})
