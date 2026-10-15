// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { expect, test } from './fixtures'

test('Moodle course discovery shows descriptions and enrols only after confirmation', async ({ page }) => {
  const writes: unknown[] = []
  await page.route('**/api/moodle/courses/search?**', (route) =>
    route.fulfill({
      json: {
        available: true,
        total: 1,
        page: 0,
        search_url: 'https://moodle.example.edu/course/search.php',
        courses: [
          {
            id: 101,
            name: 'Mathematik Testsemester',
            description: 'Übungen am Donnerstag. Einschreibeschlüssel: test-key',
            category: 'Erstes Semester',
            enrolled: false,
            url: 'https://moodle.example.edu/enrol/index.php?id=101',
          },
        ],
      },
    }),
  )
  await page.route('**/api/moodle/courses/101/enrolment', async (route) => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON())
      await route.fulfill({ json: { enrolled: true, sync_status: 'success' } })
    } else
      await route.fulfill({
        json: {
          available: true,
          methods: [{ id: 9, name: 'Studierende', available: true, key_required: true }],
          url: 'https://moodle.example.edu/enrol/index.php?id=101',
        },
      })
  })
  await page.goto('/courses')
  await page.getByRole('textbox', { name: 'Moodle-Kurssuche' }).fill('Mathematik')
  await page.getByRole('button', { name: 'Suchen', exact: true }).click()
  await expect(page.getByText('Übungen am Donnerstag. Einschreibeschlüssel: test-key')).toBeVisible()
  await page.getByRole('button', { name: 'Einschreibung ansehen' }).click()
  await expect(page.getByRole('button', { name: 'Jetzt einschreiben' })).toBeDisabled()
  expect(writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Schlüssel aus Beschreibung übernehmen' }).click()
  await page.screenshot({ path: screenshotPath('../build/moodle-discovery-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('../build/moodle-discovery-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Jetzt einschreiben' }).click()
  await expect(page.getByText('Bereits eingeschrieben')).toBeVisible()
  expect(writes).toEqual([{ instance_id: 9, key: 'test-key', confirmed: true }])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('../build/moodle-discovery-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('University documents have their own page and old course links redirect there', async ({ page }) => {
  const originals = await (await page.request.get('/api/courses')).json()
  const archive = { ...originals.courses[0], id: 400, source: 'mycampus', name: 'Bachelor Beispielstudiengang' }
  await page.route('**/api/courses?**', (route) =>
    route.fulfill({
      json: { ...originals, courses: route.request().url().includes('documents=true') ? [archive] : originals.courses },
    }),
  )
  const details = await (await page.request.get(`/api/courses/${originals.courses[0].id}`)).json()
  await page.route('**/api/courses/400', (route) => route.fulfill({ json: { ...details, course: archive } }))
  await page.goto('/courses/400')
  await expect(page).toHaveURL(/university-documents\?collection=400/)
  await expect(page.getByRole('heading', { name: 'Hochschulunterlagen', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Kursansichten' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Blatt_01.pptx', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Herunterladen', exact: true })).toBeVisible()
  await expect(page.locator('.sidebar-course-group').filter({ hasText: 'Bachelor Beispielstudiengang' })).toHaveCount(0)
  await page.screenshot({ path: screenshotPath('../build/university-documents-desktop.png'), fullPage: true })
})

test('Today refreshes Moodle without leaving and offers sign-in on failure', async ({ page }) => {
  let calls = 0
  const originalSetup = await (await page.request.get('/api/setup/status')).json()
  const originalSystem = await (await page.request.get('/api/system')).json()
  await page.route('**/api/sync/status', route => route.fulfill({ json: {
    running: false, last_run_id: calls, last_status: calls === 0 ? null : calls === 1 ? 'success' : calls === 2 ? 'warning' : 'error',
  } }))
  await page.route('**/api/setup/status', async (route) => {
    await route.fulfill({
      json: {
        ...originalSetup,
        completed: true,
        institution_confirmed: true,
        moodle_available: true,
        moodle_connected: true,
        study_program_confirmed: true,
      },
    })
  })
  await page.route('**/api/sync', async (route) => {
    calls += 1
    await route.fulfill({ json: { status: calls === 1 ? 'success' : calls === 2 ? 'warning' : 'error' } })
  })
  await page.route('**/api/system', async (route) => {
    await route.fulfill({
      json: {
        ...originalSystem,
        health: [
          { id: 1, connector: 'moodle', status: 'warning', message: 'Moodle-Änderungsabfrage mit Warnung in Kurs 101' },
        ],
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Moodle aktualisieren', exact: true }).click()
  await expect(page.getByText('Deine Daten sind wieder aktuell.')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Moodle aktualisieren', exact: true }).click()
  await expect(page.getByText('Aktualisierung abgeschlossen. Es gibt einen Hinweis.')).toBeVisible()
  await expect(page.getByText('Die Aktualisierung hat nicht geklappt.', { exact: false })).toHaveCount(0)
  await page.getByText('Hinweise ansehen', { exact: true }).click()
  await expect(page.getByText('Dafür musst du dich nicht erneut anmelden.', { exact: false })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Moodle aktualisieren', exact: true }).click()
  await page.getByRole('link', { name: 'Moodle-Anmeldung prüfen' }).click()
  await expect(page.getByRole('button', { name: 'Moodle erneut anmelden' })).toBeVisible()
})

test('System also distinguishes completed refreshes with warnings from failures', async ({ page }) => {
  await page.route('**/api/setup/status', route => route.fulfill({ json: { moodle_available: true, portals: [] } }))
  let finished = false
  const originalSystem = await (await page.request.get('/api/system')).json()
  await page.route('**/api/sync/status', route => route.fulfill({ json: { running: false, last_run_id: 1, last_status: finished ? 'warning' : null } }))
  await page.route('**/api/sync', (route) => { finished = true; return route.fulfill({ json: { status: 'warning' } }) })
  await page.route('**/api/system', async (route) => {
    await route.fulfill({
      json: {
        ...originalSystem,
        moodle_configured: true,
        health: [
          { id: 1, connector: 'moodle', status: 'warning', message: 'Moodle-Änderungsabfrage mit Warnung in Kurs 101' },
        ],
      },
    })
  })
  await page.goto('/system')
  await page.getByRole('button', { name: 'Moodle aktualisieren', exact: true }).click()
  await expect(page.getByText('Aktualisierung abgeschlossen. Es gibt einen Hinweis.')).toBeVisible()
  await expect(page.getByText('Bitte die Verbindung prüfen.', { exact: true })).toHaveCount(0)
  await page.getByText('Hinweise ansehen', { exact: true }).click()
  await expect(page.getByText('Dafür musst du dich nicht erneut anmelden.', { exact: false })).toBeVisible()
})

test('PRIMUSS imports rendered menu sections and distinguishes partial imports', async ({ page }) => {
  await page.route('**/api/setup/status', async (route) => {
    const original = await (await route.fetch()).json()
    await route.fulfill({
      json: {
        ...original,
        completed: true,
        institution_confirmed: true,
        study_program_confirmed: true,
        portals: [{ portal: 'primuss', connected: true, login_url: 'https://portal.example.edu/' }],
      },
    })
  })
  await page.addInitScript(() => {
    let expanded = false
    const url = 'https://portal.example.edu/index'
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'portal_capture_capabilities') return { traversal: true }
        if (command === 'portal_status')
          return { url, ready: 'complete', textLength: expanded ? 200 : 100, hasPassword: false }
        if (command === 'snapshot_portal_page')
          return { url, title: 'Studium', html: expanded ? '<main>Notenübersicht</main>' : '<main>Startseite</main>' }
        if (command === 'portal_links')
          return {
            url,
            links: expanded ? [] : [{ index: 0, text: 'Meine Prüfungen', href: 'javascript:menu(1)', visible: true }],
          }
        if (command === 'portal_click') {
          expanded = true
          return true
        }
        if (command === 'capture_portal_login') return { entry_url: url, cookies: [] }
        return null
      },
    }
  })
  await page.route('**/api/setup/portals/primuss/session', (route) => route.fulfill({ json: { connected: true } }))
  await page.route('**/api/primuss/import', async (route) => {
    expect(route.request().postDataJSON().pages).toHaveLength(2)
    await route.fulfill({ json: { pages: 2, documents: 1, files_stored: 1, skipped: 1, partial: true, warnings: [] } })
  })
  await page.goto('/setup')
  await page.getByRole('button', { name: 'PRIMUSS-Unterlagen einlesen' }).click()
  await expect(page.getByText('2 Seiten und 1 Dokumente gelesen · 1 neue Dateiversionen gespeichert')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('PRIMUSS wurde nur teilweise gelesen')
})
