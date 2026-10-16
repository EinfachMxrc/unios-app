// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ advanced: true })))
  // The isolated fake server already has a configured Moodle connector.
  // Avoid response interception racing with full-page navigation/refetches.
  const system = await page.request.get('/api/system')
  expect(system.ok()).toBeTruthy()
  expect((await system.json()).moodle_configured).toBe(true)
})

async function openMaterials(page: Page) {
  await page
    .getByRole('navigation', { name: 'Kursansichten' })
    .getByRole('link', { name: /Unterlagen/ })
    .click()
}

test.describe.serial('Phase 1 dashboard with isolated fake Moodle', () => {
  test('courses, group choice and downloads work through the real API', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Im Kurs zuordnen/ })).toBeVisible()
    await expect(page.getByText(/Neue Datei: 04_Schleifen\.pdf/)).toBeVisible()
    await page.goto('/courses')
    await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: 'Programmieren 1' })).toBeVisible()
    await openMaterials(page)
    await expect(page.getByText('Gruppe Schmidt')).toBeVisible()
    await page.getByRole('button', { name: 'Vorschlag bestätigen' }).click()
    await expect(page.getByRole('button', { name: 'Vorschlag bestätigen' })).toHaveCount(0)
    const download = page.waitForEvent('download')
    await page
      .getByRole('link', { name: /Herunterladen/ })
      .first()
      .click()
    expect((await download).suggestedFilename()).toContain('Schleifen')
    const savedGroupPreference = page.waitForResponse(
      (response) => response.url().includes('/group-download') && response.request().method() === 'POST',
    )
    await page.getByRole('checkbox', { name: 'Material anderer Gruppen herunterladen' }).uncheck()
    expect((await savedGroupPreference).ok()).toBeTruthy()
    await expect(page.getByRole('checkbox', { name: 'Material anderer Gruppen herunterladen' })).not.toBeChecked()
    const detail = await (
      await page.request.get(`/api/courses/${new URL(page.url()).pathname.split('/').pop()}`)
    ).json()
    expect(detail.course.download_other_groups).toBe(false)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Im Kurs zuordnen/ })).toHaveCount(0)
  })

  test('activity events open the exact file, assignment and sync run', async ({ page }) => {
    await page.goto('/activity')
    await page.getByRole('link', { name: /Neue Datei: 04_Schleifen\.pdf/ }).click()
    await expect(page).toHaveURL(/\/courses\/\d+#resource-\d+$/)
    await expect(page.locator('.resource-row.is-target')).toContainText('04_Schleifen.pdf')
    await expect(page.locator('.resource-row.is-target')).toBeFocused()

    await page.goto('/activity')
    await page.getByRole('link', { name: 'Neue Aufgabe: Schleifen üben' }).click()
    await expect(page).toHaveURL(/\/courses\/\d+#assignment-\d+$/)
    await expect(page.getByRole('dialog', { name: 'Schnellansicht' })).toContainText('Schleifen üben')
    await page.getByRole('button', { name: 'Schnellansicht schließen' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await page.goto('/activity')
    await page
      .getByRole('link', { name: /Sync erfolgreich: 2 Kurse/ })
      .last()
      .click()
    await expect(page).toHaveURL(/\/system#sync-\d+$/)
    await expect(page.locator('.data-row.is-target')).toContainText('2 Kurse')
    await expect(page.locator('.data-row.is-target')).toBeFocused()
  })

  test('calendar feed, activity filter and manual sync work', async ({ page }) => {
    await page.goto('/deadlines')
    await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
    await expect(
      page.getByRole('table', { name: 'Fristen als Tabelle' }).getByText('Schleifen üben', { exact: true }),
    ).toBeVisible()
    await page.locator('.deadline-page-switch').getByRole('button', { name: 'Kalender', exact: true }).click()
    // The fixture event lies in the past, so it waits behind the past-events disclosure.
    await page.getByText(/^Vergangene Termine/).click()
    await expect(page.getByText('Semesterstart')).toBeVisible()
    const calendar = await page.request.get('/calendar.ics')
    expect(calendar.ok()).toBeTruthy()
    expect(await calendar.text()).toContain('BEGIN:VCALENDAR')
    await page.goto('/activity')
    await page.getByLabel('Ereignis filtern').selectOption('new')
    await expect(page.getByText(/Neue Datei: 04_Schleifen\.pdf/)).toBeVisible()
    const futureDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    await page.getByLabel('Von', { exact: true }).fill(futureDate)
    await expect(page.getByText('0 Ereignisse')).toBeVisible()
    await page.getByLabel('Von', { exact: true }).fill('')
    await expect(page.getByText(/Neue Datei: 04_Schleifen\.pdf/)).toBeVisible()
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    await page.getByLabel('Bis', { exact: true }).fill(pastDate)
    await expect(page.getByText('0 Ereignisse')).toBeVisible()
    await page.goto('/system')
    await page.getByRole('button', { name: 'Moodle aktualisieren' }).click()
    await expect(page.getByText('Deine Daten sind wieder aktuell.')).toBeVisible()
  })

  test('command palette navigates and starts a manual sync', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Befehlspalette öffnen' })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
    await expect(palette).toBeVisible()
    await palette.getByRole('textbox', { name: 'Befehl suchen' }).fill('Termine')
    await palette.getByRole('textbox', { name: 'Befehl suchen' }).press('Enter')
    await expect(page).toHaveURL(/\/deadlines$/)
    await expect(palette).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 850 })
    await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
    await palette.getByRole('textbox', { name: 'Befehl suchen' }).fill('aktualisieren')
    await expect(palette.getByRole('button', { name: 'Daten aktualisieren' })).toBeEnabled()
    await palette.getByRole('button', { name: 'Daten aktualisieren' }).click()
    await expect(palette.getByText('Daten sind aktuell.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: screenshotPath(path.join(output, 'command-palette-390.png')), fullPage: true })
    await palette.getByRole('button', { name: 'Befehlspalette schließen' }).click()
    await expect(palette).toHaveCount(0)
  })

  test('all main pages render in both themes at desktop and 390 px', async ({ page }) => {
    const courseResponse = await page.request.get('/api/courses?all_semesters=true')
    expect(courseResponse.ok()).toBeTruthy()
    const courseList = (await courseResponse.json()) as { courses: { id: number; name: string }[] }
    const course = courseList.courses.find((item) => item.name === 'Programmieren 1')
    if (!course) throw new Error('Fake-Kurs fehlt für den visuellen Test')
    const routes = [
      { path: '/', name: 'heute' },
      { path: '/courses', name: 'courses' },
      { path: `/courses/${course.id}`, name: 'course-detail' },
      { path: '/search', name: 'search' },
      { path: '/deadlines', name: 'deadlines' },
      { path: '/activity', name: 'activity' },
      { path: '/system', name: 'system' },
    ]
    const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
    await mkdir(output, { recursive: true })
    for (const theme of ['light', 'dark']) {
      await page.goto('/')
      await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 850 })
        for (const route of routes) {
          await page.goto(route.path)
          await expect(
            page
              .locator(
                '.course-grid:visible,.course-list:visible,.glass-card:visible,.metric-grid:visible,.today-intro:visible',
              )
              .first(),
          ).toBeVisible()
          if (route.name === 'course-detail') {
            await page.getByText('Kurseinstellungen', { exact: true }).click()
            await expect(page.getByLabel('Semester zuordnen')).toBeEnabled()
          }
          if (route.name === 'activity' && width === 390) {
            const from = page.getByLabel('Von', { exact: true })
            const to = page.getByLabel('Bis', { exact: true })
            await expect(from).toBeVisible()
            await expect(to).toBeVisible()
            const fromBox = await from.boundingBox()
            const toBox = await to.boundingBox()
            if (!fromBox || !toBox) throw new Error('Datumsfilter fehlen')
            expect(Math.abs(fromBox.y - toBox.y)).toBeLessThan(5)
          }
          await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          await page.screenshot({
            path: screenshotPath(path.join(output, `${route.name}-${theme}-${width}.png`)),
            fullPage: true,
          })
        }
      }
    }
  })

  test('semester creation and course reassignment are saved', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 })
    await page.goto('/system')
    const semesterForm = page.locator('.semester-form')
    const nameField = page.getByRole('textbox', { name: 'Semestername' })
    await expect(semesterForm.getByText('Beginn')).toBeVisible()
    await expect(semesterForm.getByText('Ende')).toBeVisible()
    expect((await nameField.boundingBox())?.width).toBeGreaterThan(250)
    expect((await page.getByRole('button', { name: 'Semester anlegen' }).boundingBox())?.width).toBeGreaterThan(250)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.getByLabel('Semestername').fill('Wintersemester 2026/27')
    await page.getByLabel('Beginn').fill('2026-10-01')
    // Scoped to the form: an unscoped getByLabel('Ende') also substring-matches
    // the sidebar's "Seitenleiste ausblenden" button added by the redesign.
    await semesterForm.getByLabel('Ende').fill('2027-03-31')
    await page.getByRole('button', { name: 'Semester anlegen' }).click()
    await expect(page.getByText('Wintersemester 2026/27')).toBeVisible()
    await page.goto('/courses')
    await page.getByRole('button', { name: 'Alle Semester' }).click()
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    await page.getByText('Kurseinstellungen', { exact: true }).click()
    const savedSemester = page.waitForResponse(
      (response) => response.url().includes('/semester') && response.request().method() === 'POST',
    )
    await page.getByLabel('Semester zuordnen').selectOption({ label: 'Wintersemester 2026/27' })
    expect((await savedSemester).ok()).toBeTruthy()
    await expect(page.getByLabel('Semester zuordnen')).toHaveValue(/\d+/)
    await page.goto('/courses')
    // .first(): the sidebar's own "Aktuelle Kurse" list (populated once
    // /api/courses resolves) also renders a "Programmieren 1" link, and which
    // one paints first is a race — same fix as every other click on this link
    // in this file already uses.
    await expect(page.getByRole('link', { name: /Programmieren 1/ }).first()).toBeVisible()
  })

  test('stored deadline sends a reminder without a Moodle sync', async ({ page }) => {
    const response = await page.request.post('/api/__test__/deadline-reminder')
    expect(response.ok()).toBeTruthy()
    const outcome = (await response.json()) as { sent: { title: string; body: string }[] }
    expect(outcome.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Frist nähert sich',
          body: expect.stringContaining('Eine Frist nähert sich.'),
        }),
      ]),
    )
    await page.goto('/deadlines')
    await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
    await expect(
      page.getByRole('table', { name: 'Fristen als Tabelle' }).getByText('Abgabe aus Fake-Server', { exact: true }),
    ).toBeVisible()
  })

  test('expired Moodle token is visible and sends one safe push', async ({ page }) => {
    const response = await page.request.post('/api/__test__/expire-token')
    expect(response.ok()).toBeTruthy()
    const outcome = (await response.json()) as {
      status: string
      sent: { title: string; body: string }[]
    }
    expect(outcome.status).toBe('error')
    expect(outcome.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Moodle neu verbinden',
          body: expect.stringContaining('Moodle braucht deine Aufmerksamkeit.'),
        }),
      ]),
    )
    await page.goto('/system')
    await expect(page.locator('dl').getByText('Moodle-Token erneuern', { exact: true })).toBeVisible()
  })

  test('broken Moodle data shows a visible warning and keeps saved courses', async ({ page }) => {
    const broken = await page.request.post('/api/__test__/broken-course-list')
    expect(broken.ok()).toBeTruthy()
    const outcome = (await broken.json()) as {
      status: string
      sent: { title: string; body: string }[]
    }
    expect(outcome.status).toBe('error')
    expect(outcome.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Uni-Verbindung prüfen',
          body: expect.stringContaining('Eine Uni-Verbindung braucht deine Aufmerksamkeit.'),
        }),
      ]),
    )

    await page.goto('/')
    await expect(page.getByText('Moodle braucht deine Aufmerksamkeit')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Moodle prüfen' })).toBeVisible()
    await page.goto('/system')
    await expect(
      page.locator('dl').getByText('MoodleError: Ungültige Kursliste von Moodle', { exact: true }),
    ).toBeVisible()
    const courses = (await (await page.request.get('/api/courses?all_semesters=true')).json()) as {
      courses: { id: number }[]
    }
    expect(courses.courses).toHaveLength(2)

    const recovered = await page.request.post('/api/sync')
    expect(recovered.ok()).toBeTruthy()
    expect(await recovered.json()).toMatchObject({ status: 'success' })
    await page.goto('/')
    await expect(page.getByText('Moodle braucht deine Aufmerksamkeit')).toHaveCount(0)
  })

  test('a missed sync catches up once when the host wakes', async ({ page }) => {
    const before = (await (await page.request.get('/api/system')).json()) as { runs: { id: number }[] }
    const response = await page.request.post('/api/__test__/wake-after-missed-sync')
    expect(response.ok()).toBeTruthy()
    const result = (await response.json()) as { previous_id: number; latest_id: number; status: string }
    expect(result).toEqual({ previous_id: before.runs[0].id, latest_id: before.runs[0].id + 1, status: 'success' })
    await page.goto('/system')
    await expect(page.getByText('Synchronisationsverlauf')).toBeVisible()
    const after = (await (await page.request.get('/api/system')).json()) as { runs: { id: number }[] }
    expect(after.runs[0].id).toBe(result.latest_id)
  })

  test('backup status is visible on the system page', async ({ page }) => {
    await page.goto('/system')
    const backup = page.locator('[data-slot="card"]').filter({ has: page.getByText('Backup', { exact: true }) })
    await expect(backup).toContainText('Noch kein Backup-Status')
    const response = await page.request.post('/api/__test__/backup-status')
    expect(response.ok()).toBeTruthy()
    await page.reload()
    await expect(backup).toContainText('Erfolgreich')
    await expect(backup).toContainText('Test-Backup geprüft')
    const failure = await page.request.post('/api/__test__/backup-status?fail=true')
    expect(failure.ok()).toBeTruthy()
    await page.reload()
    await expect(backup).toContainText('Fehler')
    await expect(backup).toContainText('Backup fehlgeschlagen')
  })

  test('host and verified database snapshot are visible', async ({ page }) => {
    const host = (await (await page.request.get('/api/host')).json()) as {
      mode: string
      device_name: string
      heartbeat_at: string
    }
    expect(host.mode).toBe('host')
    expect(host.device_name).toBe('Test-Mac')
    expect(host.heartbeat_at).toBeTruthy()
    const system = (await (await page.request.get('/api/system')).json()) as {
      snapshot: { status: string; generation: number; age_seconds: number }
    }
    expect(system.snapshot.status).toBe('ok')
    expect(system.snapshot.generation).toBe(1)
    expect(system.snapshot.age_seconds).toBeGreaterThanOrEqual(0)
    await page.goto('/system')
    await expect(page.getByText('Dieses Gerät schreibt')).toBeVisible()
    await expect(page.getByText('Halter: Test-Mac')).toBeVisible()
    await expect(page.getByText('Snapshot geprüft')).toBeVisible()

    expect((await page.request.post('/api/__test__/snapshot-status?fail=true')).ok()).toBeTruthy()
    await page.reload()
    await expect(page.getByText('Letzter Datenbank-Snapshot ist ungültig')).toBeVisible()
    const savedSnapshot = page.waitForResponse(
      (response) => response.url().includes('/api/host/snapshot') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Jetzt Sicherung erstellen' }).click()
    expect((await savedSnapshot).ok()).toBeTruthy()
    await expect(page.getByText('Sicherung erstellt und geprüft')).toBeVisible()
    await expect(page.getByText('Snapshot geprüft')).toBeVisible()
  })

  test('local device checks are visible without exposing credentials', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('unios-theme', 'light'))
    await page.goto('/system')
    await expect(
      page.getByText('Prüfe die lokalen Voraussetzungen ohne Anmeldung bei Hochschulsystemen.'),
    ).toBeVisible()
    const response = page.waitForResponse(
      (item) => item.url().endsWith('/api/doctor') && item.request().method() === 'GET',
    )
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    const result = await response
    expect(result.ok()).toBeTruthy()
    const report = (await result.json()) as {
      ready_for_sync: boolean
      ready_for_takeover: boolean
      diagnostics: Record<string, { status: string }>
    }
    expect(report.ready_for_sync).toBe(true)
    expect(report.ready_for_takeover).toBe(false)
    expect(report.diagnostics.takeover.status).toBe('warning')
    expect(JSON.stringify(report)).not.toContain('fixture-token')
    await expect(page.getByText('Lokaler Moodle-Sync: Voraussetzungen vorhanden')).toBeVisible()
    await expect(page.getByText('Mehrgeräte-Übernahme: noch nicht eingerichtet')).toBeVisible()
    await expect(page.getByText('Datenbank erreichbar')).toBeVisible()
    await expect(page.getByText('Moodle-Token vorhanden; Gültigkeit nur beim eigenen Sync prüfbar')).toBeVisible()
    await expect(page.getByText('Der bisherige Host hat den Staffelstab noch nicht freigegeben')).toBeVisible()
    const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
    await mkdir(output, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 850 })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.screenshot({ path: screenshotPath(path.join(output, 'system-doctor-light-1280.png')), fullPage: true })
    await page.setViewportSize({ width: 390, height: 850 })
    {
      const returnTo = page.url()
      await page.goto('/settings#appearance')
      await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption('dark')
      await page.goto(returnTo)
    }
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({ path: screenshotPath(path.join(output, 'system-doctor-dark-390.png')), fullPage: true })
    const mobileResponse = page.waitForResponse(
      (item) => item.url().endsWith('/api/doctor') && item.request().method() === 'GET',
    )
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    expect((await mobileResponse).ok()).toBeTruthy()
    await expect(page.getByText('Moodle-Token vorhanden; Gültigkeit nur beim eigenen Sync prüfbar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gerät prüfen' })).toBeEnabled()
    await page.screenshot({ path: screenshotPath(path.join(output, 'system-doctor-dark-390-viewport.png')) })
    await page.route('**/api/doctor', (route) =>
      route.fulfill({ status: 503, json: { detail: 'Diagnose nicht erreichbar' } }),
    )
    await page.getByRole('button', { name: 'Gerät prüfen' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Prüfung fehlgeschlagen' })).toContainText(
      'Diagnose nicht erreichbar',
    )
    await expect(page.getByText('Lokaler Moodle-Sync: Voraussetzungen vorhanden')).toHaveCount(0)
  })

  test('changed files retain both downloads and removed files remain archived', async ({ page }) => {
    const changed = await page.request.post('/api/__test__/change-file')
    expect(changed.ok()).toBeTruthy()
    expect(await changed.json()).toMatchObject({ status: 'success', new_downloads: 1 })

    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    const versionedResource = page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
    await versionedResource.getByText('Mehr', { exact: true }).click()
    await versionedResource.getByText('Frühere Versionen', { exact: true }).click()
    await expect(versionedResource.getByRole('link', { name: 'Herunterladen' })).toBeVisible()
    await expect(versionedResource.getByRole('link', { name: /Version 1/ })).toBeVisible()
    const courseId = new URL(page.url()).pathname.split('/').pop()
    const detail = (await (await page.request.get(`/api/courses/${courseId}`)).json()) as {
      resources: { id: number; name: string; removed_upstream: boolean }[]
      versions: Record<string, { id: number; version: number }[]>
    }
    const resource = detail.resources.find((item) => item.name === '04_Schleifen.pdf')
    expect(resource).toBeDefined()
    expect(detail.versions[String(resource?.id)].map((item) => item.version)).toEqual([2])
    const versions = (await (await page.request.get(`/api/resources/${resource?.id}/versions`)).json()).versions as {
      id: number
      version: number
    }[]
    expect(versions.map((item) => item.version)).toEqual([2, 1])
    const newest = await page.request.get(`/files/${versions[0].id}`)
    const oldest = await page.request.get(`/files/${versions[1].id}`)
    expect(newest.ok()).toBeTruthy()
    expect(oldest.ok()).toBeTruthy()
    expect((await newest.body()).equals(await oldest.body())).toBe(false)

    const removed = await page.request.post('/api/__test__/remove-file')
    expect(removed.ok()).toBeTruthy()
    expect(await removed.json()).toMatchObject({ status: 'success', new_downloads: 0 })
    await page.reload()
    await versionedResource.getByText('Mehr', { exact: true }).click()
    await versionedResource.getByText('Frühere Versionen', { exact: true }).click()
    await expect(versionedResource.getByText('Nicht mehr online')).toBeVisible()
    await expect(versionedResource.getByRole('link', { name: 'Herunterladen' })).toBeVisible()
    await expect(versionedResource.getByRole('link', { name: /Version 1/ })).toBeVisible()
  })

  test('Moodle session links are cleaned across the course and calendar', async ({ page }) => {
    const synced = await page.request.post('/api/__test__/unsafe-urls')
    expect(synced.ok()).toBeTruthy()
    expect(await synced.json()).toMatchObject({ status: 'success' })
    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    await page
      .getByRole('button', { name: /Schleifen üben/ })
      .first()
      .click()
    await expect(page.locator('.course-source-link')).toHaveAttribute(
      'href',
      'https://moodle.example.invalid/mod/assign/view.php?id=701',
    )
    await expect(page.getByText('Willkommen')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Willkommen' })).toHaveCount(0)
    const detail = await page.request.get(`/api/courses/${new URL(page.url()).pathname.split('/').pop()}`)
    expect(JSON.stringify(await detail.json())).not.toContain('example-value')
    const calendar = await page.request.get('/calendar.ics')
    expect(await calendar.text()).not.toContain('example-value')
  })

  test('the source repository is linked from the More menu', async ({ page }) => {
    const source = 'https://github.com/EinfachMxrc/unios-app'
    await page.setViewportSize({ width: 1280, height: 850 })
    await page.goto('/more')
    await expect(page.locator('.more-source')).toHaveAttribute('href', source)
    await page.setViewportSize({ width: 390, height: 850 })
    await page.goto('/more')
    await expect(page.locator('.more-source')).toHaveAttribute('href', source)
    const oldHtml = await page.request.get('http://127.0.0.1:8173/courses/1')
    expect(oldHtml.status()).toBe(404)
  })

  test('foreign group files stay separate and a new section asks for a choice', async ({ page }) => {
    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    const courseId = new URL(page.url()).pathname.split('/').pop()
    const downloadOption = page.getByRole('checkbox', { name: 'Material anderer Gruppen herunterladen' })
    await openMaterials(page)
    if (!(await downloadOption.isChecked())) {
      const enabled = page.waitForResponse(
        (response) => response.url().includes('/group-download') && response.request().method() === 'POST',
      )
      await downloadOption.check()
      expect((await enabled).ok()).toBeTruthy()
    }
    const before = (await (await page.request.get('/api/overview')).json()) as { new_files: number }
    const existing = await page.request.post('/api/__test__/foreign-group')
    expect(existing.ok()).toBeTruthy()
    const first = (await existing.json()) as { status: string; download_count: number; new_file_notifications: number }
    expect(first.status).toBe('success')
    expect(first.new_file_notifications).toBe(0)
    await page.reload()
    await openMaterials(page)
    await expect(page.getByText('Zusatzmaterial anderer Gruppen')).toBeVisible()
    await expect(page.getByText('Fremdes_Material.pdf', { exact: true })).toBeVisible()
    // The material of the user's own group is the important one and comes first.
    const ownMaterials = await page.locator('#course-materials').boundingBox()
    const extraMaterials = await page.locator('.course-materials-extra').boundingBox()
    expect(ownMaterials).not.toBeNull()
    expect(extraMaterials).not.toBeNull()
    expect(extraMaterials!.y).toBeGreaterThan(ownMaterials!.y + ownMaterials!.height - 1)
    await page.setViewportSize({ width: 390, height: 850 })
    await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
    await page.reload()
    await openMaterials(page)
    await expect(page.getByText('Fremdes_Material.pdf', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    expect((await page.getByRole('heading', { name: 'Programmieren 1' }).boundingBox())?.height).toBeLessThan(50)
    const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
    await mkdir(output, { recursive: true })
    await page.screenshot({
      path: screenshotPath(path.join(output, 'course-other-group-dark-390.png')),
      fullPage: true,
    })
    const after = (await (await page.request.get('/api/overview')).json()) as { new_files: number }
    expect(after.new_files).toBe(before.new_files)
    await page.goto('/')
    await expect(page.getByText('Fremdes_Material.pdf', { exact: true })).toHaveCount(0)

    await page.goto(`/courses/${courseId}`)
    await openMaterials(page)
    const disabled = page.waitForResponse(
      (response) => response.url().includes('/group-download') && response.request().method() === 'POST',
    )
    await downloadOption.uncheck()
    expect((await disabled).ok()).toBeTruthy()
    const fresh = await page.request.post('/api/__test__/foreign-group?new_section=true')
    expect(fresh.ok()).toBeTruthy()
    expect(await fresh.json()).toMatchObject({
      status: 'success',
      download_count: first.download_count,
      new_file_notifications: 0,
    })
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Im Kurs zuordnen/ })).toBeVisible()
    const detail = await (await page.request.get(`/api/courses/${courseId}`)).json()
    expect(detail.sections.some((item: { name: string }) => item.name === 'Gruppe Weber')).toBe(true)
    expect(detail.resources.some((item: { name: string }) => item.name === 'Noch_Fremd.pdf')).toBe(false)
  })

  test('a long sync gap is visible and clears after recovery', async ({ page }) => {
    const stale = await page.request.post('/api/__test__/sync-gap')
    expect(stale.ok(), await stale.text()).toBeTruthy()
    const outcome = (await stale.json()) as { sent: { title: string; body: string }[] }
    const warnings = outcome.sent.filter((item) => item.title === 'Uni-Verbindung prüfen')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].body).toContain('Die Uni-Verbindung sollte geprüft werden.')
    await page.goto('/')
    await expect(page.getByText('Neue Inhalte könnten fehlen')).toBeVisible()
    await page.goto('/system')
    await expect(page.getByRole('alert').filter({ hasText: 'Uni-Sync ist überfällig' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 850 })
    await page.evaluate(() => localStorage.setItem('unios-theme', 'dark'))
    await page.reload()
    const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: screenshotPath(path.join(output, 'system-sync-gap-dark-390.png')), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const recovered = await page.request.post('/api/__test__/sync-gap?recover=true')
    expect(recovered.ok()).toBeTruthy()
    expect(await recovered.json()).toMatchObject({ status: 'success' })
    await page.goto('/')
    // The redesign (commit e87beac, "simplify study workspace") dropped the
    // persistent "Alles aktuell" online-status indicator in favor of showing
    // nothing when there is nothing to act on; the warning clearing is the
    // observable signal that recovery worked.
    await expect(page.getByText('Neue Inhalte könnten fehlen')).toHaveCount(0)
  })

  test('a new file sends one push and is not downloaded again', async ({ page }) => {
    const response = await page.request.post('/api/__test__/new-file-push')
    expect(response.ok(), await response.text()).toBeTruthy()
    const outcome = (await response.json()) as {
      first_status: string
      second_status: string
      first_downloads: number
      second_downloads: number
      sent: { title: string; body: string }[]
    }
    expect(outcome.first_status).toBe('success')
    expect(outcome.second_status).toBe('success')
    expect(outcome.first_downloads).toBe(1)
    expect(outcome.second_downloads).toBe(0)
    expect(outcome.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Neue Unterlagen',
          body: expect.stringContaining('Neue Unterlagen sind da.'),
        }),
      ]),
    )
    await page.goto('/')
    await expect(page.getByText('Neue Datei: Neue_Hinweise.pdf (v1)')).toBeVisible()
    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    await openMaterials(page)
    await expect(page.getByText('Neue_Hinweise.pdf', { exact: true })).toBeVisible()
  })

  test('Moodle update hint retains a changed file with unchanged metadata', async ({ page }) => {
    const response = await page.request.post('/api/__test__/moodle-update-hint')
    expect(response.ok(), await response.text()).toBeTruthy()
    expect(await response.json()).toEqual({
      statuses: ['success', 'success', 'success'],
      downloads: [1, 1, 0],
    })
    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    const row = page.locator('.resource-row').filter({ hasText: 'Versionshinweis.txt' })
    await openMaterials(page)
    await row.getByText('Mehr', { exact: true }).click()
    await row.getByText('Frühere Versionen', { exact: true }).click()
    await expect(row.getByRole('link', { name: 'Herunterladen' })).toBeVisible()
    await expect(row.getByRole('link', { name: /Version 1/ })).toBeVisible()
    const current = await page.request.get(
      (await row.getByRole('link', { name: 'Herunterladen' }).getAttribute('href')) ?? '',
    )
    const original = await page.request.get(
      (await row.getByRole('link', { name: /Version 1/ }).getAttribute('href')) ?? '',
    )
    expect(await current.text()).toBe('Version B\n')
    expect(await original.text()).toBe('Version A\n')
  })

  test('a group assignment can be corrected again and stays saved', async ({ page }) => {
    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    const group = page.getByLabel('Gruppe für Gruppe Schmidt')
    await openMaterials(page)
    const savedOwn = page.waitForResponse(
      (response) => response.url().includes('/group') && response.request().method() === 'POST',
    )
    await group.selectOption('own_group')
    expect((await savedOwn).ok()).toBeTruthy()
    await page.reload()
    await openMaterials(page)
    await expect(group).toHaveValue('own_group')
    const savedOther = page.waitForResponse(
      (response) => response.url().includes('/group') && response.request().method() === 'POST',
    )
    await group.selectOption('other_group')
    expect((await savedOther).ok()).toBeTruthy()
    await page.reload()
    await openMaterials(page)
    await expect(group).toHaveValue('other_group')
  })

  test('an insecure credential file prevents a ready status in device checks', async ({ page }) => {
    const changed = await page.request.post('/api/__test__/doctor-credential-file?insecure=true')
    expect(changed.ok()).toBeTruthy()
    try {
      await page.goto('/system')
      const response = page.waitForResponse(
        (item) => item.url().endsWith('/api/doctor') && item.request().method() === 'GET',
      )
      await page.getByRole('button', { name: 'Gerät prüfen' }).click()
      const result = await response
      expect(result.ok()).toBeTruthy()
      const report = (await result.json()) as {
        ready_for_sync: boolean
        diagnostics: { credential_file: { status: string; message: string } }
      }
      expect(report.ready_for_sync).toBe(false)
      expect(report.diagnostics.credential_file.status).toBe('warning')
      await expect(page.getByText('Lokaler Moodle-Sync: Voraussetzungen fehlen')).toBeVisible()
      await expect(page.getByText('.env-Datei ist für andere Benutzer lesbar')).toBeVisible()
    } finally {
      const restored = await page.request.post('/api/__test__/doctor-credential-file?insecure=false')
      expect(restored.ok()).toBeTruthy()
    }
  })

  test('a Moodle token error during file download is warned about without saving a fake file', async ({ page }) => {
    const response = await page.request.post('/api/__test__/file-token-error')
    expect(response.ok(), await response.text()).toBeTruthy()
    const result = (await response.json()) as { status: string }
    expect(result.status).toBe('error')
    await page.goto('/')
    await expect(page.getByText('Moodle braucht deine Aufmerksamkeit')).toBeVisible()
    await page.goto('/courses')
    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    await expect(page.getByText('Tokenfehler.pdf', { exact: true })).toHaveCount(0)
  })

  test('an archived assignment remains reachable from its activity event', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 })
    const removed = await page.request.post('/api/__test__/remove-assignment')
    expect(removed.ok()).toBeTruthy()
    expect(await removed.json()).toMatchObject({ status: 'success' })
    await page.goto('/activity')
    await page.getByRole('link', { name: 'Aufgabe nicht mehr auf Moodle: Schleifen üben' }).click()
    await expect(page).toHaveURL(/\/courses\/\d+#assignment-\d+$/)
    const drawer = page.getByRole('dialog', { name: 'Schnellansicht' })
    await expect(drawer).toContainText('Schleifen üben')
    await drawer.getByText('Aufgabendetails', { exact: true }).click()
    await expect(drawer).toContainText('Nicht mehr vorhanden')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase1')
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: screenshotPath(path.join(output, 'archived-assignment-mobile.png')), fullPage: true })
  })

  test('command palette sync refreshes the open overview without navigation', async ({ page }) => {
    await page.goto('/')
    const fileChange = 'Neue Datei: Befehlspalette_Aktuell.pdf (v1)'
    await expect(page.getByText(fileChange)).toHaveCount(0)
    const queued = await page.request.post('/api/__test__/queue-file-for-palette')
    expect(queued.ok()).toBeTruthy()
    await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
    const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
    await palette.getByRole('textbox', { name: 'Befehl suchen' }).fill('aktualisieren')
    await expect(palette.getByRole('button', { name: 'Daten aktualisieren' })).toBeEnabled()
    await palette.getByRole('button', { name: 'Daten aktualisieren' }).click()
    await expect(palette.getByText('Daten sind aktuell.')).toBeVisible()
    await palette.getByRole('button', { name: 'Befehlspalette schließen' }).click()
    await expect(page.getByText(fileChange)).toBeVisible()
  })

  test('Moodle files of different types retain their exact bytes through sync and browser download', async ({
    page,
  }) => {
    // Five formats start isolated parser processes; completion is the contract,
    // rather than the generic ten-second UI assertion deadline.
    test.setTimeout(60_000)
    const queued = await page.request.post('/api/__test__/queue-file-formats')
    expect(queued.ok()).toBeTruthy()
    const fixture = (await queued.json()) as {
      sha256: Record<string, string>
      download_count: number
    }
    await page.goto('/courses')
    await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
    const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
    await palette.getByRole('button', { name: 'Daten aktualisieren' }).click()
    await expect(palette.getByText('Daten sind aktuell.')).toBeVisible({ timeout: 30_000 })
    await palette.getByRole('button', { name: 'Befehlspalette schließen' }).click()
    const afterFirst = await page.request.get('/api/__test__/download-count')
    expect((await afterFirst.json()).download_count).toBe(fixture.download_count + 5)

    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    for (const [filename, digest] of Object.entries(fixture.sha256)) {
      await openMaterials(page)
      const row = page.locator('.resource-row').filter({ hasText: filename })
      await expect(row).toBeVisible()
      // Files UniOS shows itself (Word, Excel, pages) keep their download under "Mehr".
      const downloadLink = row.getByRole('link', { name: 'Herunterladen' })
      if (!(await downloadLink.isVisible())) await row.getByText('Mehr', { exact: true }).click()
      const downloadEvent = page.waitForEvent('download')
      await downloadLink.click()
      const download = await downloadEvent
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${filename.split('.').pop()}$`))
      const actual = await readFile(await download.path())
      expect(createHash('sha256').update(actual).digest('hex')).toBe(digest)
    }

    await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
    await palette.getByRole('button', { name: 'Daten aktualisieren' }).click()
    await expect(palette.getByText('Daten sind aktuell.')).toBeVisible()
    const afterSecond = await page.request.get('/api/__test__/download-count')
    expect((await afterSecond.json()).download_count).toBe(fixture.download_count + 5)
  })

  test('a Moodle file redirect stays downloadable and is not fetched again', async ({ page }) => {
    const queued = await page.request.post('/api/__test__/queue-redirected-file')
    expect(queued.ok()).toBeTruthy()
    const fixture = (await queued.json()) as { sha256: string; download_count: number }

    await page.goto('/courses')
    await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
    const palette = page.getByRole('dialog', { name: 'Befehlspalette' })
    await palette.getByRole('button', { name: 'Daten aktualisieren' }).click()
    await expect(palette.getByText('Daten sind aktuell.')).toBeVisible()
    await palette.getByRole('button', { name: 'Befehlspalette schließen' }).click()
    const afterFirst = await page.request.get('/api/__test__/download-count')
    expect((await afterFirst.json()).download_count).toBe(fixture.download_count + 2)

    await page
      .getByRole('link', { name: /Programmieren 1/ })
      .first()
      .click()
    // The course overview shows only a selection of the files; the full list has this one.
    await page.getByRole('link', { name: 'Alle Unterlagen' }).click()
    const row = page.locator('.resource-row').filter({ hasText: 'Umgeleitete_Vorlesung.pdf' })
    await expect(row).toBeVisible()
    const downloadEvent = page.waitForEvent('download')
    await row.getByRole('link', { name: 'Herunterladen' }).click()
    const download = await downloadEvent
    expect(
      createHash('sha256')
        .update(await readFile(await download.path()))
        .digest('hex'),
    ).toBe(fixture.sha256)

    await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
    await palette.getByRole('button', { name: 'Daten aktualisieren' }).click()
    await expect(palette.getByText('Daten sind aktuell.')).toBeVisible()
    const afterSecond = await page.request.get('/api/__test__/download-count')
    expect((await afterSecond.json()).download_count).toBe(fixture.download_count + 2)
  })
})
