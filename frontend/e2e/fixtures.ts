// SPDX-License-Identifier: AGPL-3.0-or-later

import { test as base, expect } from '@playwright/test'

/**
 * The phase1 fake server (port 8173, proxied through the preview build at
 * 4173) is a single long-lived process shared by every spec file that
 * exercises it across the whole Playwright run (workers: 1 — see
 * playwright.config.ts). Without a reset, mutations from one spec file (an
 * accepted study block, an uploaded submission draft, a renamed project, a
 * consumed one-time file token, ...) leak into whichever spec file happens
 * to run next, producing order-dependent failures.
 *
 * `POST /api/__test__/reset` (tests/fake_servers/phase1_app.py) restores the
 * server to the exact snapshot taken right after its own startup sync. This
 * fixture calls it once, before the FIRST test of each spec file that
 * imports `test`/`expect` from here instead of directly from
 * '@playwright/test' — never between tests within a file, since several
 * files rely on state their own earlier tests in the same file built up.
 *
 * `resetFiles` is module state private to this worker process. Playwright
 * runs this suite with a single worker, so it persists for the whole run and
 * "once per file" holds even under `test.describe.configure({ mode:
 * 'parallel' })`: the check-and-mark below is synchronous, so the first test
 * of a file to reach it wins the race before any other test in the same file
 * can observe the set.
 */
const resetFiles = new Set<string>()

export const test = base.extend({
  // Named `provide`, not Playwright's usual `use`, so eslint-plugin-react-hooks
  // does not mistake this fixture function for a React hook.
  page: async ({ page }, provide, testInfo) => {
    if (!resetFiles.has(testInfo.file)) {
      resetFiles.add(testInfo.file)
      const response = await page.request.post('/api/__test__/reset')
      if (!response.ok()) {
        throw new Error(`Fake-Server-Reset für ${testInfo.file} fehlgeschlagen: HTTP ${response.status()}`)
      }
    }
    const browserErrors = new Set<string>()
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.add(`Console: ${message.text()}`)
    })
    page.on('pageerror', (error) => browserErrors.add(error.message))
    page.on('crash', () => browserErrors.add('Browser page crashed'))
    page.on('requestfailed', (request) => {
      if (request.url().startsWith('http://127.0.0.1:'))
        browserErrors.add(`${request.method()} ${request.url().split('?')[0]} ${request.failure()?.errorText}`)
    })
    try {
      await provide(page)
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('browser-errors.json', {
          body: JSON.stringify({ url: page.url(), browserErrors: [...browserErrors] }),
          contentType: 'application/json',
        })
        if (!page.isClosed()) {
          try {
            await testInfo.attach('failed-view.png', {
              body: await page.screenshot({ timeout: 3000 }),
              contentType: 'image/png',
            })
          } catch {
            /* A blocked or crashed renderer can still leave the error log. */
          }
        }
      }
    } finally {
      if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' })
    }
  },
})

export { expect }
