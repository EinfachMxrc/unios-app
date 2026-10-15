// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
})

async function expectPersisted(page: Page, key: string) {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<string[]>((resolve, reject) => {
            const open = indexedDB.open('marc-uni-os-read-cache')
            open.onerror = () => reject(open.error)
            open.onsuccess = () => {
              const transaction = open.result.transaction('queries', 'readonly')
              const result = transaction.objectStore('queries').get('read-queries-v1')
              result.onerror = () => reject(result.error)
              result.onsuccess = () =>
                resolve(
                  (result.result?.clientState?.queries ?? []).map((query: { queryKey: string[] }) =>
                    query.queryKey.join(':'),
                  ),
                )
            }
          }),
      ),
    )
    .toContain(key)
}

test('PDF worker and editor fonts are available offline before either editor was opened', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Heute' })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const dependencies = await page.evaluate(async () => {
    const requests = (
      await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys()))
    ).flat()
    return requests
      .map((request) => request.url)
      .filter((url) => /(?:pdf\.worker\.min-.+\.mjs|codicon-.+\.ttf|fira-code-latin-400-normal-.+\.woff)$/.test(url))
  })
  expect(dependencies.some((url) => /pdf\.worker\.min-.+\.mjs$/.test(url))).toBe(true)
  expect(dependencies.some((url) => /codicon-.+\.ttf$/.test(url))).toBe(true)
  expect(dependencies.some((url) => /fira-code-latin-400-normal-.+\.woff$/.test(url))).toBe(true)
  await context.setOffline(true)
  for (const url of dependencies) {
    const response = await page.evaluate(async (url) => {
      const response = await fetch(url)
      return { ok: response.ok, size: (await response.arrayBuffer()).byteLength }
    }, url)
    expect(response.ok).toBe(true)
    expect(response.size).toBeGreaterThan(1000)
  }
})

test('the private read cache keeps study pages available offline without saving system data', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Heute' })).toBeVisible()
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifest).toBe('/manifest.webmanifest')
  const manifestResponse = await page.request.get(manifest!)
  expect(manifestResponse.ok()).toBeTruthy()
  const data = await manifestResponse.json()
  expect(data.name).toBe('UniOS')
  expect(data.icons.some((icon: { sizes: string }) => icon.sizes === '512x512')).toBeTruthy()
  for (const icon of data.icons) {
    expect((await page.request.get(icon.src)).ok()).toBeTruthy()
  }
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state))
    .toBe('activated')
  await expect(page.getByText('Programmieren 1').first()).toBeVisible()
  await expectPersisted(page, 'api:/api/overview')
  await page.goto('/courses')
  await expect(page.getByRole('link', { name: /Programmieren 1/ }).first()).toBeVisible()
  await expectPersisted(page, 'api:/api/courses?all_semesters=false&include_inactive=false')
  await page.goto('/courses/1')
  await expect(page.getByRole('heading', { name: 'Programmieren 1' })).toBeVisible()
  await expectPersisted(page, 'api:/api/courses/1')
  await page.goto('/deadlines')
  await page.getByRole('button', { name: 'Abgaben', exact: true }).click()
  await expect(
    page.getByLabel('Fristen als Tabelle').getByRole('button', { name: 'Schleifen üben', exact: true }),
  ).toBeVisible()
  await expectPersisted(page, 'api:/api/deadlines')
  await page.goto('/search?q=Rekursionstiefe')
  await expect(page.locator('.search-result').first()).toBeVisible()
  await expectPersisted(page, 'api:/api/search?q=Rekursionstiefe')
  await expectPersisted(page, 'api:/api/search/offline-index')
  await page.goto('/system')
  await expect(page.getByRole('heading', { name: 'System', exact: true })).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<string[]>((resolve, reject) => {
            const open = indexedDB.open('marc-uni-os-read-cache')
            open.onerror = () => reject(open.error)
            open.onsuccess = () => {
              const transaction = open.result.transaction('queries', 'readonly')
              const result = transaction.objectStore('queries').get('read-queries-v1')
              result.onerror = () => reject(result.error)
              result.onsuccess = () => {
                const queries = result.result?.clientState?.queries ?? []
                resolve(queries.map((query: { queryKey: string[] }) => query.queryKey.join(':')))
              }
            }
          }),
      ),
    )
    .toEqual(
      expect.arrayContaining([
        'api:/api/overview',
        'api:/api/courses?all_semesters=false&include_inactive=false',
        'api:/api/courses/1',
        'api:/api/deadlines',
        'api:/api/search?q=Rekursionstiefe',
        'api:/api/search/offline-index',
      ]),
    )
  const stored = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('marc-uni-os-read-cache')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const transaction = open.result.transaction('queries', 'readonly')
          const result = transaction.objectStore('queries').get('read-queries-v1')
          result.onerror = () => reject(result.error)
          result.onsuccess = () =>
            resolve(
              (result.result?.clientState?.queries ?? []).map((query: { queryKey: string[] }) =>
                query.queryKey.join(':'),
              ),
            )
        }
      }),
  )
  expect(stored).not.toContain('api:/api/system')
  expect(stored).not.toContain('api:/api/host')
  const serviceWorkerCacheUrls = await page.evaluate(async () => {
    const names = await caches.keys()
    return (await Promise.all(names.map(async (name) => (await caches.open(name)).keys())))
      .flat()
      .map((item) => item.url)
  })
  expect(serviceWorkerCacheUrls.some((url) => url.includes('/api/'))).toBe(false)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'System', exact: true })).toBeVisible()
  await expect(page.getByText('Offline – Stand: keine gespeicherten Daten')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Moodle aktualisieren' })).toHaveCount(0)
  await page.goto('/search?q=Rekursionstiefe')
  await expect(page.locator('.search-result').first()).toBeVisible()
  await expect(page.getByText(/Offline – Stand: \d{2}\.\d{2}\.\d{4}/)).toBeVisible()
  await page.goto('/search?q=Funktionsaufrufe')
  await expect(page.getByText(/Treffer in gespeicherten Inhalten/)).toBeVisible()
  await expect(page.locator('.search-result').first()).toContainText('Rekursionstiefe und Funktionsaufrufe')
  await expect(page.locator('.search-result').first()).toContainText('Seite 2')
  await page.getByLabel('Kurs filtern').selectOption({ label: 'Mathematik' })
  await expect(page.getByText('Keine gespeicherten Treffer')).toBeVisible()
  await page.goto('/deadlines')
  await expect(page.getByRole('button', { name: 'Abgaben', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByLabel('Fristen als Tabelle').getByRole('button', { name: 'Schleifen üben', exact: true }),
  ).toBeVisible()
  await page.goto('/courses')
  await expect(page.getByRole('link', { name: /Programmieren 1/ }).first()).toBeVisible()
  await page.goto('/courses/1')
  await expect(page.getByRole('heading', { name: 'Programmieren 1' })).toBeVisible()
  await page.getByText('Kurseinstellungen', { exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Semester zuordnen' })).toBeDisabled()
  await page.goto('/')
  await expect(page.getByText('Programmieren 1').first()).toBeVisible()
  const screenshots = path.resolve(import.meta.dirname, '../test-results/screenshots/phase2')
  await mkdir(screenshots, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 850 })
      await page.reload()
      await expect(page.getByText(/Offline – Stand: \d{2}\.\d{2}\.\d{4}/)).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: screenshotPath(path.join(screenshots, `offline-heute-${theme}-${width}.png`)),
        fullPage: true,
      })
    }
  }
})

test('cached courses remain visible when the browser is online but the host cannot be reached', async ({ page }) => {
  await page.goto('/courses')
  await expect(page.getByRole('link', { name: /Programmieren 1/ }).first()).toBeVisible()
  await expectPersisted(page, 'api:/api/courses?all_semesters=false&include_inactive=false')
  await page.route('**/api/**', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('link', { name: /Programmieren 1/ }).first()).toBeVisible()
  await expect(page.getByText(/Offline – Stand: \d{2}\.\d{2}\.\d{4}/)).toBeVisible()
  await page.unroute('**/api/**')
  await page.reload()
  await expect(page.getByRole('link', { name: /Programmieren 1/ }).first()).toBeVisible()
  await expect(page.getByText(/Offline – Stand:/)).toHaveCount(0)
})
