// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { calendarNow } from './calendar-fixtures'

test.setTimeout(120_000)
const output = resolve('..', 'docs', 'qa', 'workspace-update-20261009', 'workflows')

async function expectSourcePageTwelve(page: Page) {
  const canvas = page.locator('[data-material-page="12"] canvas')
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await expect(canvas).toBeVisible()
  await expect(canvas).toBeInViewport()
  await expect(page.locator('[data-material-page="12"] [data-reader-render-active="true"]'))
    .toHaveAttribute('data-reader-render-complete', 'true')
  // A visible, completed canvas must contain both paper and actual PDF ink.
  await expect.poll(() => canvas.evaluate(element => {
    const bitmap = element as HTMLCanvasElement
    if (!bitmap.width || !bitmap.height) return false
    const context = bitmap.getContext('2d')
    if (!context) return false
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const stride = 4 * Math.max(1, Math.floor(bitmap.width * bitmap.height / 100_000))
    let ink = 0
    let paper = 0
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index + 3] === 0) continue
      if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 245) ink++
      else paper++
    }
    return ink > 20 && paper > 20
  })).toBe(true)
}

test('workspace update remains readable in light and dark on desktop and mobile', async ({ page }, testInfo) => {
  await mkdir(output, { recursive: true })
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const response = await page.request.post('/api/__test__/focus-workspace')
  expect(response.ok()).toBeTruthy()
  const seed = await response.json()
  await page.clock.install({ time: new Date(calendarNow) })
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/learning/focus/course/${seed.course_id}?mode=source&version=${seed.version_id}&page=12`)
      await expect(page.locator('.material-controls')).toBeVisible()
      const workspace = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
      // The same page retains the preceding desktop's open workspace on mobile.
      // Close its modal through the real control before examining the PDF.
      if (width === 390 && await workspace.isVisible()) {
        await workspace.getByRole('button', { name: 'Markierungen schließen', exact: true }).click()
        await expect(workspace).toHaveCount(0)
      }
      await expectSourcePageTwelve(page)
      const note = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
      if (width === 1440) {
        if (!await workspace.isVisible()) await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
        await expect(note).toBeVisible()
        await expect(workspace).not.toHaveAttribute('aria-modal', 'true')
        await expectSourcePageTwelve(page)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: screenshotPath(resolve(output, `source-${theme}-${width}.png`)), animations: 'disabled' })
      if (width === 390) {
        await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
        await expect(workspace).toHaveAttribute('aria-modal', 'true')
        await expect(note).toBeVisible()
        // The bottom sheet scrolls independently: reach the editor as a user
        // would before requiring its entire writing surface inside the sheet.
        await note.click()
        await expect(note).toBeFocused()
        const beforeCenter = await note.boundingBox()
        // Center the writing surface within the independently scrollable sheet;
        // click's minimal scroll may leave a rounded border pixel offscreen.
        await note.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }))
        await testInfo.attach(`note-bounds-${theme}-${width}.json`, { contentType: 'application/json', body: JSON.stringify({
          before_center: beforeCenter, after_center: await note.boundingBox(), workspace: await workspace.boundingBox(),
          scroll_container: await workspace.evaluate(element => ({ scroll_top: element.scrollTop,
            scroll_height: element.scrollHeight, client_height: element.clientHeight })),
        }) })
        await expect(note).toBeInViewport({ ratio: 1 })
        const bounds = await note.boundingBox()
        const workspaceBounds = await workspace.boundingBox()
        expect(bounds).not.toBeNull()
        expect(workspaceBounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(bounds!.width).toBeGreaterThanOrEqual(250)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000)
        expect(bounds!.x).toBeGreaterThanOrEqual(workspaceBounds!.x)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(workspaceBounds!.x + workspaceBounds!.width)
        expect(bounds!.y).toBeGreaterThanOrEqual(workspaceBounds!.y)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(workspaceBounds!.y + workspaceBounds!.height)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: screenshotPath(resolve(output, `source-notes-${theme}-${width}.png`)), animations: 'disabled' })
        await workspace.getByRole('button', { name: 'Markierungen schließen', exact: true }).click()
        await expect(workspace).toHaveCount(0)
        await expectSourcePageTwelve(page)
      }
      await page.goto('/')
      await expect(page.getByRole('link', { name: 'Hier weitermachen', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: screenshotPath(resolve(output, `resume-${theme}-${width}.png`)), fullPage: true, animations: 'disabled' })
      await page.goto('/deadlines#timetable')
      await expect(page.locator('#timetable').getByRole('button', { name: 'Arbeitswoche', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: screenshotPath(resolve(output, `calendar-${theme}-${width}.png`)), fullPage: true, animations: 'disabled' })
    }
  }
})
