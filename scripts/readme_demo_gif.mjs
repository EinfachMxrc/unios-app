// SPDX-License-Identifier: AGPL-3.0-or-later
// Records a short tour through the invented demo semester as a webm; docs/readme/current/SCREENSHOTS.md
// explains how it is turned into demo.gif. Run against `unios demo serve --port 8767` only.
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'frontend', 'package.json'))
const { chromium } = require('@playwright/test')
const output = process.env.DEMO_VIDEO_DIR ?? path.join(root, '.tmp', 'demo-video')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  baseURL: 'http://127.0.0.1:8767',
  colorScheme: 'dark',
  timezoneId: 'Europe/Berlin',
  recordVideo: { dir: output, size: { width: 1280, height: 800 } },
  extraHTTPHeaders: { 'X-UniOS-Lease-Generation': '1' },
})
await context.addInitScript(() => localStorage.setItem('unios-theme', 'dark'))
const page = await context.newPage()
const pause = (ms) => page.waitForTimeout(ms)
async function settle() {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}
try {
  const courses = await (await context.request.get('/api/courses')).json()
  const courseId = courses.courses.find((course) => course.name === 'Programmieren 1').id
  await page.goto('/')
  await settle()
  await pause(2200)
  await page.goto(`/courses/${courseId}`)
  await settle()
  await pause(1800)
  await page.getByRole('navigation', { name: 'Kursansichten' }).getByRole('link', { name: 'Unterlagen' }).click()
  await page.locator('.resource-row').first().waitFor()
  await pause(1500)
  await page.locator('.resource-row').first().getByRole('link', { name: 'PDF öffnen' }).click()
  await page.locator('[data-material-page="1"] canvas').waitFor()
  await pause(1800)
  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, 500)
  await pause(1500)
  await page.goto('/notes')
  await settle()
  await pause(1800)
  await page.goto('/learning')
  await settle()
  await pause(2200)
  await page.goto('/study')
  await settle()
  await pause(2000)
} finally {
  await context.close()
  await browser.close()
}
console.log('Video gespeichert in', output)
