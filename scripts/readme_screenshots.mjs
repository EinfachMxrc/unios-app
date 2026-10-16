// SPDX-License-Identifier: AGPL-3.0-or-later
// Run against the isolated `unios demo serve --port 8767` only.
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'frontend', 'package.json'))
const { chromium, expect } = require('@playwright/test')
const output = process.env.README_SHOTS_DIR ?? path.join(root, 'docs', 'readme', 'current')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 },
  baseURL: 'http://127.0.0.1:8767', colorScheme: 'dark', timezoneId: 'Europe/Berlin', reducedMotion: 'reduce',
  extraHTTPHeaders: { 'X-UniOS-Lease-Generation': '1' } })
await context.addInitScript(() => { if (!sessionStorage.getItem('shots-theme')) localStorage.setItem('unios-theme', 'dark') })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const courses = await (await context.request.get('/api/courses')).json()
const courseId = courses.courses.find(course => course.name === 'Programmieren 1').id
const existing = (await (await context.request.get('/api/notes')).json()).notes.find(note => note.title === 'Rekursion verstehen')
const response = existing ? null : await context.request.post('/api/notes', { data: { course_id: courseId,
  title: 'Rekursion verstehen', body: '## Vom Problem zur Lösung\n\nEine rekursive Funktion löst ein kleineres Teilproblem und führt die Ergebnisse zusammen.\n\n### Zwei Bausteine\n\n| Baustein | Aufgabe |\n| --- | --- |\n| Basisfall | Beendet den Selbstaufruf |\n| Rekursionsschritt | Verkleinert das Problem |\n\n### Ein Beispiel\n\n```python\ndef factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n```\n\n### Zum Nacharbeiten\n\n- [x] Basisfall erklären\n- [ ] Den Aufrufbaum für factorial(4) zeichnen\n- [ ] Iterative und rekursive Lösung vergleichen\n\n> Merksatz: Jeder Aufruf muss dem Basisfall näherkommen.' } })
if (response && !response.ok()) throw new Error(`Demo note creation failed: ${response.status()}`)
const noteId = existing?.id ?? (await response.json()).note.id
async function capture(name) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('.navigation-progress')).toHaveCount(0)
  await page.screenshot({ path: path.join(output, `${name}.png`) })
}
try {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Guten|Hier geht/ }).first()).toBeVisible()
  await capture('heute-dark')
  await page.evaluate(() => { sessionStorage.setItem('shots-theme', '1'); localStorage.setItem('unios-theme', 'light') })
  await page.reload()
  await expect(page.getByRole('heading', { name: /Guten|Hier geht/ }).first()).toBeVisible()
  await capture('heute-light')
  await page.evaluate(() => { localStorage.setItem('unios-theme', 'dark') })
  await page.reload()
  await page.goto(`/courses/${courseId}`)
  await expect(page.getByRole('heading', { name: 'Programmieren 1', exact: true })).toBeVisible()
  await capture('kurs')
  await page.getByRole('navigation', { name: 'Kursansichten' }).getByRole('link', { name: 'Unterlagen' }).click()
  await expect(page.locator('.resource-row').first()).toBeVisible()
  await page.locator('.resource-row').first().getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await capture('pdf')
  await page.goto(`/notes?id=${noteId}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt' })).toContainText('Rekursionsschritt')
  await page.getByRole('button', { name: 'Fokus', exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture('editor')
  await page.goto('/learning')
  await expect(page.getByRole('heading', { name: 'Lernen', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Karten wiederholen/ }).first()).toBeVisible()
  await capture('lernen')
  await page.goto('/study')
  await expect(page.getByRole('heading', { name: /Karteikarten/ }).first()).toBeVisible()
  await expect(page.getByText('Programmieren 1', { exact: true }).last()).toBeVisible()
  await capture('karteikarten')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Guten|Hier geht/ }).first()).toBeVisible()
  await capture('heute-mobile')
  await page.goto('/study')
  await expect(page.getByRole('heading', { name: /Karteikarten/ }).first()).toBeVisible()
  await capture('karteikarten-mobile')
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log('Captured nine screenshots from invented demo data; no browser exceptions.')
} finally {
  await browser.close()
}
