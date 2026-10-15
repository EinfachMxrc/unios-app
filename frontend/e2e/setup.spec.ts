// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('desktop Moodle sign-in reports opening and callback failures beside its button', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('unios-alpha-welcome-v1', 'seen')
    let attempt = 0
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: () =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            if (attempt++ === 0) reject(new Error('invented window failure'))
            else resolve(null)
          }, 150)
        }),
    }
  })
  let launches = 0
  await page.route('**/api/setup/**', async (route) => {
    if (route.request().url().endsWith('/moodle/start')) {
      await route.fulfill({
        json: {
          login_url: `https://moodle.example.invalid/admin/tool/mobile/launch.php?passport=invented-${++launches}`,
        },
      })
      return
    }
    await route.fulfill({
      json: {
        installed: true,
        completed: false,
        institution: 'hs-coburg',
        institution_name: 'Beispielhochschule',
        profiles: [],
        pending_institution: 'hs-coburg',
        institution_confirmed: true,
        moodle_available: true,
        moodle_connected: false,
        notifications: null,
        initial_sync: null,
        study_program: 'Bachelor Informatik',
        study_program_confirmed: true,
        portals: [],
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Moodle verbinden', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Anmeldefenster wird geöffnet …' })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Das Anmeldefenster konnte nicht geöffnet werden')
  await expect(
    page.getByText('Die offizielle Moodle-Seite ist in einem eigenen UniOS-Fenster geöffnet.', { exact: false }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Stattdessen im Browser öffnen' })).toBeVisible()
  await page.getByRole('button', { name: 'Anmeldefenster erneut öffnen' }).click()
  await expect.poll(() => launches).toBe(2)
  await expect(page.getByRole('link', { name: 'Stattdessen im Browser öffnen' })).toHaveAttribute(
    'href',
    /passport=invented-2/,
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(
    page.getByText('Die offizielle Moodle-Seite ist in einem eigenen UniOS-Fenster geöffnet.', { exact: false }),
  ).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('unios-moodle-login-result', { detail: { connected: false } })),
  )
  await expect(page.getByRole('alert')).toContainText('Die Moodle-Anmeldung konnte nicht übernommen werden')
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('unios-moodle-login-result', { detail: { pending: true } })),
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Moodle-Verbindung wird geprüft' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Moodle verbinden', exact: true })).toBeDisabled()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('unios-moodle-login-result', { detail: { connected: false, error: 'keychain' } }),
    ),
  )
  await expect(page.getByRole('alert')).toContainText('Erlaube „uniosd“ den Zugriff')
  await expect(page.getByRole('status').filter({ hasText: 'Moodle-Verbindung wird geprüft' })).toHaveCount(0)
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('unios-moodle-login-result', { detail: { connected: false, error: 'expired' } }),
    ),
  )
  await expect(page.getByRole('alert')).toContainText('Diese Moodle-Anmeldung ist abgelaufen')
  await page.getByRole('button', { name: 'Anmeldefenster erneut öffnen' }).click()
  await expect.poll(() => launches).toBe(3)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('unios-moodle-login-result', { detail: { connected: true } })),
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('first-run setup confirms university, Moodle and notification choice', async ({ page }, testInfo) => {
  const status = {
    installed: true,
    completed: false,
    institution: 'hs-coburg',
    institution_name: 'Hochschule Coburg',
    profiles: [
      { slug: 'generic', name: 'Eigene Hochschule' },
      { slug: 'hs-coburg', name: 'Hochschule Coburg' },
    ],
    pending_institution: 'hs-coburg',
    institution_confirmed: false,
    moodle_available: true,
    study_program: null as string | null,
    study_program_confirmed: false,
    moodle_connected: false,
    notifications: null as 'tested' | 'off' | null,
    initial_sync: null as { status: string; course_count: number; resource_count: number; change_count: number } | null,
  }
  await page.route('**/api/sync', async (route) => {
    status.initial_sync = { status: 'success', course_count: 3, resource_count: 12, change_count: 15 }
    await route.fulfill({ json: status.initial_sync })
  })
  await page.route('**/api/setup/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST') {
      if (path.endsWith('/institution')) status.institution_confirmed = true
      if (path.endsWith('/program')) {
        status.study_program = route.request().postDataJSON().name
        status.study_program_confirmed = true
      }
      if (path.endsWith('/moodle/start')) {
        setTimeout(() => {
          status.moodle_connected = true
        }, 300)
        await route.fulfill({ json: { login_url: 'https://moodle.example.invalid/login' } })
        return
      }
      if (path.endsWith('/notifications')) status.notifications = 'off'
      if (path.endsWith('/complete')) status.completed = true
    }
    await route.fulfill({ json: status })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Willkommen zur UniOS Alpha' })).toBeVisible()
  await expect(page.getByText('Du musst nicht gezielt nach Fehlern suchen.')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('alpha-welcome.png') })
  await page.getByRole('button', { name: 'Weiter zur Einrichtung' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Willkommen zur UniOS Alpha' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Dein Studium an einem Ort' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Hochschule bestätigen' }).click()
  await expect(page.getByRole('heading', { name: 'Was studierst du?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Moodle verbinden' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Studiengang bestätigen' })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Studiengang und Abschluss' }).fill('Bachelor Betriebswirtschaft')
  await page.getByRole('button', { name: 'Studiengang bestätigen' }).click()
  await page.reload()
  await expect(page.getByText('Dein Studiengang: Bachelor Betriebswirtschaft')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Moodle verbinden' })).toBeVisible()
  await page.getByRole('button', { name: 'Moodle verbinden' }).click()
  await expect(page.getByRole('link', { name: 'Offizielle Moodle-Anmeldung im Browser öffnen →' })).toBeVisible()
  await expect(page.getByText('3 Kurse · 12 Unterlagen · 15 Änderungen gefunden.')).toBeVisible()
  await page.getByRole('button', { name: 'Ohne Handy-Hinweise starten' }).click()
  await page.getByRole('button', { name: 'UniOS öffnen' }).click()
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible()
})

test('first-run university choice continues without restart', async ({ page }) => {
  const status = {
    installed: true,
    completed: false,
    institution: 'generic',
    institution_name: 'Eigene Hochschule',
    profiles: [
      { slug: 'generic', name: 'Eigene Hochschule' },
      { slug: 'hs-coburg', name: 'Hochschule Coburg' },
    ],
    pending_institution: 'generic',
    institution_confirmed: false,
    moodle_available: false,
    moodle_connected: false,
    notifications: null,
    initial_sync: null,
    portals: [],
  }
  await page.route('**/api/setup/**', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().endsWith('/institution')) {
      status.pending_institution = route.request().postDataJSON().slug
      status.institution = status.pending_institution
      status.institution_name = 'Hochschule Coburg'
      status.institution_confirmed = true
      status.moodle_available = true
      await route.fulfill({ json: status })
      return
    }
    await route.fulfill({ json: status })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter zur Einrichtung' }).click()
  await page.getByRole('searchbox', { name: 'Hochschule suchen' }).fill('Coburg')
  await expect(
    page.getByRole('group', { name: 'Hochschule auswählen' }).getByRole('button', { name: /Eigene Hochschule/ }),
  ).toHaveCount(0)
  await page
    .getByRole('group', { name: 'Hochschule auswählen' })
    .getByRole('button', { name: /Hochschule Coburg/ })
    .click()
  await page.getByRole('button', { name: 'Auswahl speichern' }).click()
  await expect(page.getByRole('heading', { name: 'Was studierst du?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Moodle verbinden' })).toHaveCount(0)
  await expect(page.getByText('Profil gespeichert. Starte UniOS neu')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'UniOS öffnen' })).toHaveCount(0)
})

test('setup signs in to myCampus and PRIMUSS through the desktop app windows', async ({ page }) => {
  const status = {
    installed: true,
    completed: false,
    institution: 'hs-coburg',
    institution_name: 'Hochschule Coburg',
    profiles: [{ slug: 'hs-coburg', name: 'Hochschule Coburg' }],
    pending_institution: 'hs-coburg',
    institution_confirmed: true,
    moodle_available: true,
    study_program_confirmed: true,
    study_program: 'Bachelor Betriebswirtschaft',
    moodle_connected: true,
    notifications: null,
    initial_sync: { status: 'success', course_count: 1, resource_count: 1, change_count: 1 },
    portals: [
      { portal: 'mycampus', connected: false, login_url: 'https://mycampus.example.edu/' },
      { portal: 'primuss', connected: false, login_url: 'https://mycampus.example.edu/' },
    ],
  }
  const posted: unknown[] = []
  await page.addInitScript(() => {
    const calls: Array<[string, unknown]> = []
    ;(window as unknown as { __desktopCalls: typeof calls }).__desktopCalls = calls
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (command: string, args: unknown) => {
        calls.push([command, args])
        return Promise.resolve(
          command === 'capture_portal_login'
            ? {
                entry_url: 'https://mycampus.example.edu/',
                cookies: [{ name: 'sid', value: 'invented', domain: 'mycampus.example.edu' }],
              }
            : null,
        )
      },
    }
  })
  await page.route('**/api/setup/**', async (route) => {
    const url = route.request().url()
    if (route.request().method() === 'POST' && url.endsWith('/portals/mycampus/session')) {
      posted.push(route.request().postDataJSON())
      status.portals[0].connected = true
    }
    await route.fulfill({ json: status })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter zur Einrichtung' }).click()
  await expect(page.getByRole('heading', { name: 'Weitere Dienste deiner Hochschule' })).toBeVisible()
  const takeOver = page.getByRole('button', { name: 'Anmeldung übernehmen' })
  await expect(takeOver.first()).toBeDisabled()
  await page.getByRole('button', { name: 'Für die Studiengangwahl bei myCampus anmelden' }).click()
  await expect(takeOver.first()).toBeEnabled()
  await takeOver.first().click()
  await expect(page.getByText('myCampus-Anmeldung erneuern')).toBeVisible()
  expect(posted).toEqual([
    {
      entry_url: 'https://mycampus.example.edu/',
      cookies: [{ name: 'sid', value: 'invented', domain: 'mycampus.example.edu' }],
    },
  ])
  await expect.poll(() => page.evaluate(
    () => (window as unknown as { __desktopCalls: Array<[string, unknown]> }).__desktopCalls
      .some(([command]) => command === 'close_portal_login'),
  )).toBe(true)
  const calls = await page.evaluate(
    () => (window as unknown as { __desktopCalls: Array<[string, unknown]> }).__desktopCalls,
  )
  const loginCalls = calls.filter(([command]) => command !== 'portal_capture_capabilities')
  expect(calls.some(([command]) => command === 'portal_capture_capabilities')).toBe(true)
  expect(loginCalls.map(([command]) => command)).toEqual([
    'open_portal_login',
    'capture_portal_login',
    'close_portal_login',
  ])
  expect(loginCalls[0][1]).toEqual({ portal: 'mycampus', url: 'https://mycampus.example.edu/' })
})

test('setup collects portal pages and saves them as an anonymised sample', async ({ page }) => {
  const status = {
    installed: true,
    completed: false,
    institution: 'hs-coburg',
    institution_name: 'Hochschule Coburg',
    profiles: [{ slug: 'hs-coburg', name: 'Hochschule Coburg' }],
    pending_institution: 'hs-coburg',
    institution_confirmed: true,
    moodle_available: true,
    moodle_connected: true,
    notifications: null,
    initial_sync: { status: 'success', course_count: 1, resource_count: 1, change_count: 1 },
    portals: [{ portal: 'mycampus', connected: true, login_url: 'https://mycampus.example.edu/' }],
  }
  const saved: unknown[] = []
  await page.addInitScript(() => {
    let counter = 0
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (command: string) => {
        if (command === 'snapshot_portal_page') {
          counter += 1
          return Promise.resolve({
            url: `https://mycampus.example.edu/blog/${counter}`,
            title: 'Blog',
            html: `<html><body>Beitrag ${counter}</body></html>`,
          })
        }
        return Promise.resolve(null)
      },
    }
  })
  await page.route('**/api/setup/**', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().endsWith('/portals/mycampus/samples')) {
      saved.push(route.request().postDataJSON())
      await route.fulfill({ json: { file: 'mycampus-beispiel-1.zip', folder: 'UniOS-Beispielseiten', pages: 2 } })
      return
    }
    await route.fulfill({ json: status })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter zur Einrichtung' }).click()
  await page.getByText('Beispielseiten für den Datenabruf erstellen').click()
  const remember = page.getByRole('button', { name: 'Aktuelle Seite merken' })
  await expect(remember).toBeDisabled() // no sign-in window opened yet
  await page.getByText('myCampus-Anmeldung erneuern').click()
  await page.getByRole('button', { name: 'Erneut anmelden' }).click()
  await expect(remember).toBeEnabled()
  await page.getByRole('combobox', { name: 'Seitenart' }).selectOption('blog')
  await remember.click()
  await page.getByRole('combobox', { name: 'Seitenart' }).selectOption('timetable')
  await remember.click()
  await expect(page.getByText('2 von 30 Seiten gemerkt.')).toBeVisible()
  await page.getByRole('button', { name: 'Anonymisiert speichern' }).click()
  await expect(page.getByText(/2 Seiten anonymisiert gespeichert: Ordner „UniOS-Beispielseiten“/)).toBeVisible()
  await expect(page.getByText('0 von 30 Seiten gemerkt.')).toBeVisible()
  expect(saved).toEqual([
    {
      pages: [
        { kind: 'blog', html: '<html><body>Beitrag 1</body></html>' },
        { kind: 'timetable', html: '<html><body>Beitrag 2</body></html>' },
      ],
    },
  ])
})

for (const traversal of [true, false]) {
  test(`setup captures portal samples with ${traversal ? 'guarded traversal' : 'macOS page inspection'}`, async ({
    page,
  }) => {
    const status = {
      installed: true,
      completed: false,
      institution: 'hs-coburg',
      institution_name: 'Hochschule Coburg',
      profiles: [{ slug: 'hs-coburg', name: 'Hochschule Coburg' }],
      pending_institution: 'hs-coburg',
      institution_confirmed: true,
      moodle_available: true,
      moodle_connected: true,
      notifications: null,
      initial_sync: { status: 'success', course_count: 1, resource_count: 1, change_count: 1 },
      portals: [{ portal: 'mycampus', connected: true, login_url: 'https://mycampus.example.edu/' }],
    }
    const saved: Array<{ pages: Array<{ kind: string; html: string }> }> = []
    await page.addInitScript(
      ({ traversal }) => {
        const host = 'https://mycampus.example.edu'
        const site: Record<string, { html: string; links: Array<{ text: string; href: string }> }> = {
          [`${host}/`]: {
            html: '<html>start</html>',
            links: [
              { text: 'Blog', href: `${host}/blog` },
              { text: 'Abmelden', href: `${host}/logout` },
              { text: 'Stundenplan', href: `${host}/plan` },
            ],
          },
          [`${host}/blog`]: { html: '<html>blog</html>', links: [] },
          [`${host}/plan`]: { html: '<html>plan</html>', links: [] },
        }
        let current = `${host}/`
        const calls: string[] = []
        ;(window as unknown as { __calls: string[] }).__calls = calls
        ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
          invoke: (command: string, args: { url?: string; active?: boolean }) => {
            if (command === 'portal_capture_capabilities') return Promise.resolve({ traversal })
            calls.push(command === 'portal_navigate' ? `navigate ${args.url}` : command)
            if (command === 'portal_navigate') current = args.url ?? current
            if (command === 'portal_status')
              return Promise.resolve({ url: current, ready: 'complete', textLength: 300, hasPassword: false })
            if (command === 'portal_links') {
              return Promise.resolve({
                url: current,
                links: (site[current]?.links ?? []).map((link, index) => ({ index, visible: true, ...link })),
              })
            }
            if (command === 'snapshot_portal_page')
              return Promise.resolve({ url: current, title: 't', html: site[current]?.html ?? '' })
            return Promise.resolve(null)
          },
        }
      },
      { traversal },
    )
    await page.route('**/api/setup/**', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().endsWith('/portals/mycampus/samples')) {
        saved.push(route.request().postDataJSON())
        await route.fulfill({
          json: { file: 'mycampus-beispiel-1.zip', folder: 'UniOS-Beispielseiten', pages: saved[0].pages.length },
        })
        return
      }
      await route.fulfill({ json: status })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Weiter zur Einrichtung' }).click()
    await page.getByText('Beispielseiten für den Datenabruf erstellen').click()
    await page.getByText('myCampus-Anmeldung erneuern').click()
    await page.getByRole('button', { name: 'Erneut anmelden' }).click()
    await page.getByRole('button', { name: traversal ? 'Automatisch erfassen' : 'Geöffnete Seite erfassen' }).click()
    await expect(page.getByText(new RegExp(`${traversal ? 3 : 1} Seiten anonymisiert gespeichert`))).toBeVisible()
    expect(saved).toHaveLength(1)
    expect(saved[0].pages.map((entry) => entry.kind)).toEqual(traversal ? ['start', 'blog', 'timetable'] : ['start'])
    const calls = await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)
    expect(calls.filter((call) => call.includes('logout'))).toEqual([])
    if (traversal) {
      expect(calls.at(-1)).toBe('portal_guard')
    } else {
      expect(
        calls.filter((call) => call.startsWith('navigate') || call === 'portal_click' || call === 'portal_guard'),
      ).toEqual([])
    }
  })
}

test('the system page always offers the way to connect myCampus and PRIMUSS', async ({ page }) => {
  await page.route('**/api/setup/status', async (route) => {
    const real = await (await route.fetch()).json()
    await route.fulfill({
      json: {
        ...real,
        portals: [{ portal: 'mycampus', connected: false, login_url: 'https://mycampus.example.edu/' }],
      },
    })
  })
  await page.goto('/system')
  await page.getByRole('link', { name: 'Weitere Dienste verbinden' }).click()
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('heading', { name: 'Was studierst du?' })).toBeVisible()
})

test('first-run requires a catalogue programme and imports the selected BWL documents', async ({ page }, testInfo) => {
  const status = {
    installed: true,
    completed: false,
    institution: 'hs-coburg',
    institution_name: 'Hochschule Coburg',
    profiles: [{ slug: 'hs-coburg', name: 'Hochschule Coburg' }],
    pending_institution: 'hs-coburg',
    institution_confirmed: true,
    moodle_available: true,
    moodle_connected: true,
    notifications: 'off',
    initial_sync: { status: 'success', course_count: 1, resource_count: 1, change_count: 1 },
    study_program: null as string | null,
    study_program_confirmed: false,
    portals: [{ portal: 'mycampus', connected: true, login_url: 'https://mycampus.example.edu/' }],
  }
  const programs = [
    {
      name: 'Bachelor Informatik',
      url: 'https://mycampus.example.edu/de/studiengang/informatik',
      faculty: 'Fakultät Elektrotechnik und Informatik',
      degree: 'Bachelor',
    },
    {
      name: 'Master Data Science',
      url: 'https://mycampus.example.edu/de/studiengang/data-science',
      faculty: 'Fakultät Elektrotechnik und Informatik',
      degree: 'Master',
    },
    {
      name: 'Bachelor Betriebswirtschaft',
      url: 'https://mycampus.example.edu/de/studiengang/bwl',
      faculty: 'Fakultät Wirtschaftswissenschaften',
      degree: 'Bachelor',
    },
  ]
  const items = [
    {
      id: 1,
      kind: 'event',
      title: 'Erstsemestertage',
      summary: 'Ein guter Start.',
      url: 'https://mycampus.example.edu/de/veranstaltung/1',
      category: 'Projekt:ING',
      published_at: null,
      starts_at: '2026-09-29T08:00:00Z',
      file_label: null,
      study_program: null,
      material_id: null,
    },
    {
      id: 2,
      kind: 'news',
      title: 'Vortragsreihe Klimafit',
      summary: 'Im Garten.',
      url: '',
      category: '',
      published_at: '2026-07-17T13:00:00Z',
      starts_at: null,
      file_label: null,
      study_program: null,
      material_id: null,
    },
    {
      id: 3,
      kind: 'document',
      title: 'Stundenplan',
      summary: 'Version 1.0',
      url: 'https://mycampus.example.edu/f/plan.pdf',
      category: 'Stundenplan',
      published_at: '2026-09-28T14:17:00Z',
      starts_at: null,
      file_label: 'PDF | 74.02 KB',
      study_program: 'Bachelor Betriebswirtschaft',
      material_id: 42,
    },
  ]
  let chosen: unknown = null
  let polls = 0
  await page.route('**/api/setup/status', (route) => route.fulfill({ json: status }))
  await page.route('**/api/mycampus/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (url.pathname.endsWith('/programs')) return route.fulfill({ json: programs })
    if (url.pathname.endsWith('/import/status')) {
      polls += 1
      return route.fulfill({
        json:
          chosen && polls > 1
            ? {
                state: 'done',
                message: '',
                report: { events: 1, news: 1, documents: 1, files_stored: 1, new_items: 3, warnings: [] },
              }
            : { state: 'idle', message: '', report: null },
      })
    }
    if (url.pathname.endsWith('/import') && method === 'POST')
      return route.fulfill({ status: 202, json: { state: 'running' } })
    if (url.pathname.endsWith('/program') && method === 'POST') {
      chosen = route.request().postDataJSON()
      status.study_program = route.request().postDataJSON().name
      status.study_program_confirmed = true
      return route.fulfill({ json: chosen })
    }
    if (url.pathname.endsWith('/program')) return route.fulfill({ json: chosen })
    if (url.pathname.endsWith('/items')) {
      const kind = url.searchParams.get('kind')
      return route.fulfill({ json: items.filter((item) => !kind || item.kind === kind) })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter zur Einrichtung' }).click()
  await expect(page.getByRole('button', { name: 'UniOS öffnen' })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Dein Studiengang' }).fill('Betriebswirtschaft')
  await page.screenshot({ path: testInfo.outputPath('study-program-selection.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: testInfo.outputPath('study-program-selection-mobile.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('option', { name: /Bachelor Betriebswirtschaft/ }).click()
  await expect(page.getByRole('button', { name: 'UniOS öffnen' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Dein Studiengang: Bachelor Betriebswirtschaft')).toBeVisible()
  expect(chosen).toEqual({ name: 'Bachelor Betriebswirtschaft', url: programs[2].url })
  await page.getByRole('button', { name: 'Erneut einlesen' }).click()
  await expect(page.getByText('Fertig: 1 Termine, 1 News, 1 Dokumente (1 heruntergeladen, 3 neu).')).toBeVisible()

  // The first-run setup has no router; the link is a plain address and the app then opens as usual.
  const completeOnNavigation = (request: import('@playwright/test').Request) => {
    if (!request.isNavigationRequest()) return
    status.completed = true
    page.off('request', completeOnNavigation)
  }
  page.on('request', completeOnNavigation)
  await page
    .getByRole('region', { name: 'Was studierst du?' })
    .getByRole('link', { name: 'Ergebnisse ansehen' })
    .click()
  await expect(page).toHaveURL(/\/campus$/)
  await page.getByRole('tab', { name: 'Termine' }).click()
  await expect(page.getByText('Erstsemestertage')).toBeVisible()
  await page.getByRole('tab', { name: 'News' }).click()
  await expect(page.getByText('Vortragsreihe Klimafit')).toBeVisible()
  await page.getByRole('tab', { name: 'Dokumente' }).click()
  await expect(page.getByRole('heading', { name: 'Stundenplan' })).toBeVisible()
  await page.getByRole('link', { name: 'In UniOS öffnen' }).click()
  await expect(page).toHaveURL(/\/material\/42$/)
})

test('disconnected study program setup keeps actions inside phone viewport', async ({ page }, testInfo) => {
  await page.route('**/api/setup/status', async route => {
    const response = await route.fetch()
    const body = await response.json()
    body.study_program = null
    body.study_program_confirmed = false
    body.portals = (body.portals ?? []).map((portal: Record<string, unknown>) => ({ ...portal, connected: false }))
    await route.fulfill({ response, json: body })
  })
  await page.goto('/setup')
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(value => localStorage.setItem('unios-theme', value), theme)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/setup')
      const signIn = page.getByRole('button', { name: 'Für die Studiengangwahl bei myCampus anmelden' })
      await expect(signIn).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const box = (await signIn.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`setup-disconnected-${theme}-${width}.png`), fullPage: true })
    }
  }
})
