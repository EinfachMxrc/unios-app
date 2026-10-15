// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('switching to English updates shell, Today, and Settings, and persists across reload', async ({ page }) => {
  // Projects, Grades and AI are optional modules (off by default) — enable
  // them up front via the same localStorage preferences trick other specs
  // use, so the later navigations to /projects, /grades and /ai render. This
  // init script re-runs on every navigation in this test (including the ones
  // that follow the language switch), so it merges into whatever is already
  // stored instead of overwriting it — otherwise it would wipe out the
  // `language: 'en'` preference the Settings page writes further down.
  await page.addInitScript(() => {
    const storageKey = 'unios-ui-preferences-v1'
    const current = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...current,
        modules: { ...(current.modules ?? {}), projects: true, grades: true, ai: true },
      }),
    )
  })

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')

  const languageSelect = page.getByRole('combobox', { name: 'Sprache' })
  await expect(languageSelect).toBeVisible()

  // The switcher lists every discovered language by its OWN native name
  // (German and English first — see src/i18n/localeMeta.ts), not translated
  // into whichever UI language happens to be active.
  await expect(languageSelect.locator('option')).toHaveText(['Deutsch', 'English'])

  await languageSelect.selectOption('en')

  // Settings page itself switches immediately.
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByText('Your areas', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible()

  // Shell chrome and navigation (present on every page) switch too.
  await expect(page.getByRole('link', { name: 'More', exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Today' }),
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Courses' }),
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Deadlines' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open command palette' })).toBeVisible()

  // Today page.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByText('Up next', { exact: true })).toBeVisible()
  await expect(page.getByText('Recently happened', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Continue learning/ })).toBeVisible()

  // Persists across a full reload (preference is read from localStorage
  // before the app renders — see src/i18n/index.ts / src/preferences.ts).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Today' }),
  ).toBeVisible()

  // Learning page.
  await page.goto('/learning')
  await expect(page.getByRole('heading', { name: 'Learning', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Overview & exercises' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Flashcards', exact: true })).toBeVisible()
  await expect(page.getByText('YOUR NEXT STEP', { exact: true })).toBeVisible()

  // Inbox page.
  await page.goto('/inbox')
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible()
  await expect(page.getByText('What would you like to classify?', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Received', exact: true })).toBeVisible()

  // Material viewer: find a PDF version through the fake server's own data
  // instead of hardcoding an id, then open it directly.
  const courseDetail = await (await page.request.get('/api/courses/1')).json()
  const pdfResource = courseDetail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const versionId = courseDetail.versions[pdfResource.id][0].id
  await page.goto(`/material/${versionId}`)
  await expect(page.getByRole('link', { name: '← Back to course' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Highlights & questions/ })).toBeVisible()

  // Projects page.
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()

  // Grades page.
  await page.goto('/grades')
  await expect(page.getByRole('heading', { name: 'Grades and ECTS', exact: true })).toBeVisible()
  await expect(page.getByText('Progress', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add module' })).toBeVisible()

  // AI page.
  await page.goto('/ai')
  await expect(page.getByRole('heading', { name: 'AI package', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Share course material for AI packages' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download card package' })).toBeVisible()

  // Switch back to German and confirm everything reverts.
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Language' }).selectOption('de')
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
  await expect(page.getByText('Als Nächstes', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()

  await page.goto('/learning')
  await expect(page.getByRole('heading', { name: 'Lernen', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Überblick & Übungen' })).toBeVisible()

  await page.goto('/inbox')
  await expect(page.getByRole('heading', { name: 'Eingang', exact: true })).toBeVisible()
  await expect(page.getByText('Was möchtest du einordnen?', { exact: true })).toBeVisible()

  await page.goto(`/material/${versionId}`)
  await expect(page.getByRole('link', { name: '← Zurück zum Kurs' })).toBeVisible()

  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projekte', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Neues Projekt' })).toBeVisible()

  await page.goto('/grades')
  await expect(page.getByRole('heading', { name: 'Noten und ECTS', exact: true })).toBeVisible()
  await expect(page.getByText('Fortschritt', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modul ergänzen' })).toBeVisible()

  await page.goto('/ai')
  await expect(page.getByRole('heading', { name: 'KI-Paket', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Kursmaterial für KI-Pakete freigeben' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kartenpaket herunterladen' })).toBeVisible()
})
