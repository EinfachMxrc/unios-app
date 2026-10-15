// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('myCampus updates in the background across pages and refreshes the visible results', async ({
  page,
}, testInfo) => {
  let state = 'idle'
  let completed = false
  page.on('pageerror', (error) => {
    throw error
  })
  await page.addInitScript(() => localStorage.setItem('unios-alpha-welcome-v1', 'seen'))
  await page.route('**/api/setup/status', (route) =>
    route.fulfill({
      json: {
        installed: true,
        completed: true,
        institution: 'hs-coburg',
        institution_name: 'Beispielhochschule',
        profiles: [],
        pending_institution: 'hs-coburg',
        institution_confirmed: true,
        moodle_available: false,
        moodle_connected: false,
        notifications: 'off',
        initial_sync: null,
        study_program: 'Bachelor Informatik',
        study_program_confirmed: true,
        portals: [{ portal: 'mycampus', connected: true, login_url: 'https://mycampus.example.edu/' }],
      },
    }),
  )
  await page.route('**/api/mycampus/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/programs')) return route.fulfill({ json: [] })
    if (path.endsWith('/program'))
      return route.fulfill({ json: { name: 'Bachelor Informatik', url: 'https://mycampus.example.edu/program' } })
    if (path.endsWith('/import')) {
      state = 'running'
      return route.fulfill({ status: 202, json: { state } })
    }
    if (path.endsWith('/import/status'))
      return route.fulfill({
        json: {
          state,
          message: '',
          report:
            state === 'done' ? { events: 0, news: 0, documents: 1, files_stored: 1, new_items: 1, warnings: [] } : null,
        },
      })
    if (path.endsWith('/items'))
      return route.fulfill({
        json: completed
          ? [
              {
                id: 991,
                kind: 'page',
                title: 'Neu geladene Studiengangseite',
                summary: '',
                url: '',
                category: '',
                published_at: null,
                starts_at: null,
                file_label: null,
                study_program: null,
                material_id: null,
              },
            ]
          : [],
      })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/setup')
  await page.getByRole('button', { name: 'Erneut einlesen', exact: true }).click()
  const indicator = page.getByRole('complementary', { name: 'myCampus-Aktualisierung' })
  await expect(indicator).toContainText('myCampus wird aktualisiert')
  await expect(page.getByText(/ein bis zwei Minuten/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: '← Zurück zu Verbindungen' })).toBeEnabled()
  await page.getByRole('link', { name: '← Zurück zu Verbindungen' }).click()
  await expect(page).toHaveURL(/\/system$/)
  await expect(indicator).toContainText('myCampus wird aktualisiert')
  await page.goto('/campus')
  await expect(indicator).toContainText('myCampus wird aktualisiert')
  await expect(page.getByText('Neue Inhalte erscheinen hier automatisch.')).toBeVisible()
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
    await page.screenshot({ path: testInfo.outputPath(`background-sync-${dark ? 'dark' : 'light'}.png`) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
    await page.screenshot({ path: testInfo.outputPath(`background-sync-mobile-${dark ? 'dark' : 'light'}.png`) })
  }
  expect(await indicator.locator('svg').evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  completed = true
  state = 'done'
  await expect(indicator).toContainText('myCampus ist aktuell')
  await expect(page.getByText('Neu geladene Studiengangseite')).toBeVisible()
  await expect(indicator).toHaveCount(0, { timeout: 12_000 })
})

test('myCampus background errors offer the connection check without blocking navigation', async ({ page }) => {
  await page.route('**/api/mycampus/import/status', (route) =>
    route.fulfill({
      json: {
        state: 'error',
        message: 'Invented failure',
        report: null,
      },
    }),
  )
  await page.goto('/campus')
  const indicator = page.getByRole('complementary', { name: 'myCampus-Aktualisierung' })
  await expect(indicator).toContainText('myCampus konnte nicht aktualisiert werden')
  await expect(indicator.getByRole('link', { name: 'Verbindung prüfen' })).toHaveAttribute('href', '/setup')
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
  await expect(indicator).toBeVisible()
})

test('automatic myCampus import allows setup to finish while the job keeps running', async ({ page }) => {
  let state = 'idle'
  const status = {
    installed: true,
    completed: false,
    institution: 'hs-coburg',
    institution_name: 'Beispielhochschule',
    profiles: [],
    pending_institution: 'hs-coburg',
    institution_confirmed: true,
    moodle_available: false,
    moodle_connected: false,
    notifications: null as string | null,
    initial_sync: null,
    study_program: 'Bachelor Informatik',
    study_program_confirmed: true,
    portals: [{ portal: 'mycampus', connected: false, login_url: 'https://mycampus.example.edu/' }],
  }
  await page.addInitScript(() => {
    localStorage.setItem('unios-alpha-welcome-v1', 'seen')
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (command: string) =>
        Promise.resolve(
          command === 'capture_portal_login' ? { entry_url: 'https://mycampus.example.edu/', cookies: [] } : null,
        ),
    }
  })
  await page.route('**/api/setup/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/session')) status.portals[0].connected = true
    if (path.endsWith('/notifications')) status.notifications = 'off'
    if (path.endsWith('/complete')) status.completed = true
    await route.fulfill({ json: status })
  })
  await page.route('**/api/mycampus/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/program'))
      return route.fulfill({ json: { name: 'Bachelor Informatik', url: 'https://mycampus.example.edu/program' } })
    if (path.endsWith('/programs')) return route.fulfill({ json: [] })
    if (path.endsWith('/import')) {
      state = 'running'
      return route.fulfill({ status: 202, json: { state } })
    }
    return route.fulfill({ json: { state, message: '', report: null } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Für die Studiengangwahl bei myCampus anmelden' }).click()
  await page.getByRole('button', { name: 'Anmeldung übernehmen', exact: true }).click()
  const indicator = page.getByRole('complementary', { name: 'myCampus-Aktualisierung' })
  await expect(indicator).toContainText('myCampus wird aktualisiert')
  await page.getByRole('button', { name: 'Ohne Handy-Hinweise starten' }).click()
  await page.getByRole('button', { name: 'UniOS öffnen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
  await expect(indicator).toContainText('myCampus wird aktualisiert')
})
