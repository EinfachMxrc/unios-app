// SPDX-License-Identifier: AGPL-3.0-or-later

import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { expect, test } from './fixtures'

test('learning tab navigation retains the shell and avoids redundant shared reads', async ({ page }, info) => {
  const requests: Record<string, number> = {}
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/')) requests[path] = (requests[path] ?? 0) + 1
  })
  // Make the first lazy module fetch noticeably slow, as on a cold desktop start.
  await page.route(/\/assets\/(StudyPage|AssessmentPage|CodingPage)-[^/]+\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450))
    await route.continue()
  })
  await page.goto('/learning')
  await expect(page.locator('.learning-now')).toBeVisible()
  const samples: { route: string; duration_ms: number; blank_frames: number }[] = []
  for (let round = 0; round < 5; round++) {
    for (const path of ['/study', '/assessment', '/coding', '/learning']) {
      await page.evaluate(() => {
        const state = { blank: 0, active: true }
        Object.assign(window, { navigationFrames: state })
        const frame = () => {
          if (!state.active) return
          const shell = document.querySelector('.app-shell')
          if (!shell || shell.getClientRects().length === 0) state.blank++
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
      const start = performance.now()
      await page.locator(`.learning-tabs a[href="${path}"]`).click()
      await expect(page.locator(`.learning-tabs a[href="${path}"].active`)).toBeVisible()
      const duration_ms = performance.now() - start
      const blank_frames = await page.evaluate(() => {
        const state = (window as unknown as { navigationFrames: { blank: number; active: boolean } }).navigationFrames
        state.active = false
        return state.blank
      })
      samples.push({ route: path, duration_ms, blank_frames })
    }
  }
  const result = { environment: 'Chrome; local fake server; first lazy module delayed 450ms', samples, requests }
  await writeFile(info.outputPath('navigation-metrics.json'), JSON.stringify(result, null, 2))
  await info.attach('navigation-metrics.json', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(
    samples.reduce((sum, sample) => sum + sample.blank_frames, 0),
    'visible shell on every animation frame',
  ).toBe(0)
  expect(requests['/api/courses'] ?? 0, 'shared course list should be reused across tabs').toBeLessThanOrEqual(2)
  expect(requests['/api/notifications'] ?? 0, 'notification count should be reused across tabs').toBeLessThanOrEqual(2)
  expect(
    requests['/api/sync/status'] ?? 0,
    'idle sync status should be reused across quick tab changes',
  ).toBeLessThanOrEqual(2)
  expect(
    requests['/api/anki/study/status'] ?? 0,
    'empty review queue must not invalidate study data',
  ).toBeLessThanOrEqual(2)
  for (const sample of samples.slice(4)) expect(sample.duration_ms, sample.route).toBeLessThan(400)
})

test('hover prepares only the selected page, not the programming editor', async ({ page }) => {
  const modules: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/assets/')) modules.push(request.url())
  })
  await page.goto('/learning')
  await expect(page.locator('.learning-now')).toBeVisible()
  await page.locator('.learning-tabs a[href="/coding"]').hover()
  await expect.poll(() => modules.some((url) => /CodingPage-[^/]+\.js/.test(url))).toBe(true)
  expect(modules.some((url) => /CodeEditor|editor\.main|monaco|pdf\.worker/i.test(url))).toBe(false)
  await page.locator('.learning-tabs a[href="/coding"]').click()
  await expect(page.locator('.coding-page')).toBeVisible()
})

for (const path of ['/study', '/assessment', '/coding']) {
  test(`cold direct link ${path} retains navigation while loading`, async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/assets\/(StudyPage|AssessmentPage|CodingPage)-[^/]+\.js$/, async (route) => {
      await held
      await route.continue()
    })
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByRole('status', { name: 'Seite wird geladen …', exact: true })).toBeVisible()
    release()
    await expect(page.locator(`.learning-tabs a[href="${path}"].active`)).toBeVisible()
  })
}

test('failed page download offers recovery inside the app shell', async ({ page }) => {
  await page.route(/\/assets\/StudyPage-[^/]+\.js$/, (route) => route.abort('failed'))
  await page.goto('/study')
  await expect(page.getByRole('heading', { name: 'Seite konnte nicht geladen werden' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Erneut laden', exact: true })).toBeVisible()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.locator('.nav-item[href="/learning"]').click()
  await expect(page.locator('.learning-now')).toBeVisible()
})

test('a slow keyboard transition keeps the current page visible and shows progress', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/assets\/StudyPage-[^/]+\.js$/, async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/learning')
  await expect(page.locator('.learning-now')).toBeVisible()
  await page.locator('.learning-tabs a[href="/study"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.navigation-progress')).toBeVisible()
  await expect(page.locator('.learning-now')).toBeVisible()
  release()
  await expect(page.locator('.learning-tabs a[href="/study"].active')).toBeVisible()
  await expect(page.locator('.navigation-progress')).toHaveCount(0)
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`learning navigation fits ${theme} ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
      for (const path of ['/learning', '/study', '/assessment', '/coding']) {
        await page.goto(path)
        await expect(page.locator(`.learning-tabs a[href="${path}"].active`)).toBeVisible()
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
          .toBe(true)
        await page.screenshot({ path: info.outputPath(`${path.slice(1)}-${theme}-${width}.png`) })
      }
    })
  }
}
