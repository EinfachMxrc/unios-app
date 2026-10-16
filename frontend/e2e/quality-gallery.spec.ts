// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'
test.setTimeout(120_000)
const output = process.env.QUALITY_GALLERY_DIR
  ? resolve('..', 'docs', 'qa', process.env.QUALITY_GALLERY_DIR)
  : resolve('test-results', 'quality-gallery')
test('quality gallery: main workflows, preview and editor in both themes and sizes', async ({ page }) => {
  await mkdir(output, { recursive: true })
  const created = await page.request.post('/api/notes', {
    data: {
      course_id: 1,
      title: 'Lernnotiz: Rekursion',
      body: '# Rekursion\n\nEin Basisfall beendet die Wiederholung.\n\n## Beispiel\n\nBetrachte eine einfache Funktion.',
    },
  })
  expect(created.ok()).toBeTruthy()
  const note = (await created.json()).note.id
  const courses = await (await page.request.get('/api/courses/1')).json()
  const resource = courses.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = courses.versions[resource.id][0].id
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const [name, route] of Object.entries({
        today: '/',
        courses: '/courses',
        learning: '/learning',
        deadlines: '/deadlines',
        search: '/search?q=Schleifen',
        coding: '/coding',
        assessment: '/assessment',
        settings: '/settings',
        more: '/more',
        note: `/notes?id=${note}`,
        pdf: `/material/${version}`,
      })) {
        await page.goto(route)
        await expect(page.locator('.content > .page-heading h1')).toBeVisible()
        if (name === 'pdf')
          await expect(page.locator('[data-material-page="1"] [data-reader-render-active="true"]')).toHaveAttribute(
            'data-reader-render-complete',
            'true',
          )
        if (name === 'note') {
          await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
          await expect(page.locator('.note-prose')).toContainText('Basisfall')
        }
        if (name === 'deadlines') {
          await expect(page.getByRole('button', { name: 'Neuer Termin', exact: true })).toBeVisible()
          await page.getByText('Hochschulkalender hinzufügen', { exact: true }).click()
          await expect(page.getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true })).toBeVisible()
        }
        if (name === 'learning') await expect(page.locator('.learning-now')).toBeVisible()
        if (name === 'search') await expect(page.locator('.search-result').first()).toBeVisible()
        await expect(page.locator('.content [data-slot="skeleton"]:visible')).toHaveCount(0)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${name}/${theme}/${width}`,
        ).toBe(true)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({
          path: screenshotPath(resolve(output, `${name}-${theme}-${width}.png`)),
          animations: 'disabled',
          fullPage: true,
        })
      }
    }
  }
})
