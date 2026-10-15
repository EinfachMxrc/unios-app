// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('Moodle warnings show their reason and label the last successful sync', async ({ page }, info) => {
  await page.route('**/api/release/health', (route) =>
    route.fulfill({
      json: {
        checked_at: '2026-10-14T16:35:00Z',
        database: { status: 'ok', schema: 'fixture' },
        index: { documents: 0, pending: 0, failed: 0 },
        allowed_entries: 0,
        connectors: [{ id: 'moodle', status: 'warning', last_success_at: '2026-10-14T16:34:00Z' }],
      },
    }),
  )
  await page.route('**/api/system', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      json: {
        ...(await response.json()),
        health: [
          {
            id: 999,
            connector: 'moodle',
            status: 'warning',
            last_success_at: '2026-10-14T16:34:00Z',
            message: 'Erfundene Warnung beim Dateiimport.',
          },
        ],
      },
    })
  })
  await page.goto('/system')
  await expect(page.getByText('moodle: Abgleich mit Warnung', { exact: true })).toBeVisible()
  await expect(page.getByText('Prüfung fehlgeschlagen', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Letzter erfolgreicher Abgleich:/).first()).toBeVisible()
  await expect(page.getByText('Erfundene Warnung beim Dateiimport.', { exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath(`health-warning-${theme}-${width}.png`), fullPage: true })
    }
  }
})

test('a course quiz opens as a Moodle link without an automatic attempt', async ({ page }) => {
  const courses = await (await page.request.get('/api/courses')).json()
  const id = courses.courses[0].id
  await page.route(`**/api/courses/${id}`, async (route) => {
    const response = await route.fetch()
    const details = await response.json()
    await route.fulfill({
      json: {
        ...details,
        resources: [
          ...details.resources,
          {
            id: 9991,
            source: 'moodle',
            source_key: 'fixture:quiz',
            name: 'Erfundener Übungstest',
            kind: 'link',
            url: 'https://moodle.example.invalid/mod/quiz/view.php?id=991',
            section_id: details.sections[0]?.id ?? null,
            group_category: 'general',
            removed_upstream: false,
            versions: [],
            latest_version_id: null,
            filename: null,
          },
        ],
      },
    })
  })
  await page.goto(`/courses/${id}`)
  const link = page.getByRole('link', { name: 'Erfundener Übungstest', exact: true })
  await expect(link).toHaveAttribute('href', 'https://moodle.example.invalid/mod/quiz/view.php?id=991')
  await expect(link).toHaveAttribute('target', '_blank')
})

test('simple system view shows a real health check and creates a verified snapshot', async ({ page }) => {
  await page.goto('/system')
  await expect(page.getByRole('heading', { name: 'Sicherung und Rettung' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Systemzustand' })).toBeVisible()
  await page.getByRole('button', { name: 'Jetzt Sicherung erstellen', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sicherung erstellt und geprüft.' })).toBeVisible()
  const health = await (await page.request.get('/api/release/health')).json()
  expect(health.database.status).toBe('ok')
  expect(health.metadata_status).toBe('available')
  expect(health.index.pending).toBeGreaterThanOrEqual(0)
})

test('recovery stays usable with a corrupt database and never mounts normal writers', async ({ page }, info) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(new URL(request.url()).pathname)
  })
  await page.route('**/api/recovery/status', (route) =>
    route.fulfill({ json: { mode: 'recovery', background_work: false, database: { status: 'error' } } }),
  )
  await page.route('**/api/recovery/backup', (route) =>
    route.fulfill({ status: 503, json: { code: 'RECOVERY_BACKUP_FAILED' } }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'UniOS sicher öffnen' })).toBeVisible()
  await page.getByRole('button', { name: 'Geprüfte Datenbankkopie erstellen' }).click()
  await expect(page.getByText('Das hat nicht geklappt. Deine Originale wurden nicht verändert.')).toBeVisible()
  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate((value) => {
        localStorage.setItem('unios-theme', value)
        document.documentElement.classList.toggle('dark', value === 'dark')
      }, theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: info.outputPath(`recovery-${theme}-${width}.png`), fullPage: true })
    }
  }
  expect(requests.every((path) => path.startsWith('/api/recovery/'))).toBe(true)
})
