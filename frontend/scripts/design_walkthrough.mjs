// SPDX-License-Identifier: AGPL-3.0-or-later
/* global console, document, innerWidth, localStorage, URL */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const output = '../docs/design/screenshots/unios-workspace'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
const page = await context.newPage()

async function capture(name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
  const state = await page.evaluate(() => ({
    title: document.querySelector('main h1')?.textContent,
    headings: [...document.querySelectorAll('main h2,main h3')].slice(0, 10).map((node) => node.textContent?.trim()),
    viewportOverflow: document.documentElement.scrollWidth - innerWidth,
  }))
  console.log(JSON.stringify({ name, path: new URL(page.url()).pathname, ...state }))
}

try {
  await page.goto('http://127.0.0.1:4173/')
  await page.getByText('Dein Studium auf einen Blick.').waitFor()
  await capture('01-start')

  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Kurse', exact: true }).click()
  await page.locator('.course-list-row').first().waitFor()
  await capture('02-kurse')

  await page.locator('.course-list-row').filter({ hasText: 'Programmieren 1' }).click()
  await page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' }).waitFor()
  await capture('03-kurs')

  await page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' }).click()
  await page.locator('.react-pdf__Page__textContent').getByText('Schleifen und Python Beispiele').waitFor()
  await capture('04-pdf')
  console.log('PDF pages:', await page.locator('[data-reader-page]').count())
  await page.locator('[data-reader-page="2"]').scrollIntoViewIfNeeded()
  await page.getByText('Rekursionstiefe und Funktionsaufrufe').waitFor()
  await page.waitForTimeout(150)
  console.log('After scrolling:', await page.locator('.material-pager').innerText())
  await capture('04b-pdf-scroll')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('04c-pdf-handy')
  await page.getByRole('button', { name: 'Vergrößern' }).click()
  await page.getByRole('button', { name: 'Vergrößern' }).click()
  await capture('04d-pdf-handy-zoom')
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByRole('link', { name: 'Mitschrift anlegen' }).click()
  await page.getByRole('textbox', { name: 'Notiztitel' }).fill('Vorlesung 04: Schleifen')
  await page.getByRole('textbox', { name: 'Notizinhalt' }).fill('## Kernkonzepte\n\nfor durchläuft eine Folge.\n\n## Offene Fragen\n\nWann ist while besser?')
  await page.getByRole('button', { name: 'Notiz anlegen' }).click()
  await page.locator('.note-document h2').waitFor()
  if (!((await page.locator('.note-list-item.is-selected small').textContent()) ?? '').includes('Programmieren 1'))
    throw new Error('Course context missing in note')
  await capture('05-notiz')
  await page.evaluate(() => localStorage.setItem('marc-theme', 'dark'))
  await page.reload()
  await capture('05b-notiz-dunkel')
  await page.evaluate(() => localStorage.setItem('marc-theme', 'light'))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:4173/')
  await page.getByText('Dein Studium auf einen Blick.').waitFor()
  await capture('06-start-handy')
  await page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link', { name: 'Kurse' }).click()
  await page.locator('.course-list-row').first().waitFor()
  await capture('07-kurse-handy')
} finally {
  await browser.close()
}
