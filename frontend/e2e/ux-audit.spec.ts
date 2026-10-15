// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'
import { createEmptyCard } from 'ts-fsrs'
import type { components } from '../src/generated/api'

test('daily actions stay within two clicks on a phone', async ({ page }) => {
  await page.request.post('/api/__test__/upcoming-assignment')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('link', { name: /Neue Datei: 04_Schleifen\.pdf/ }).click()
  await expect(page).toHaveURL(/\/courses\/\d+#resource-\d+$/)
  await page.locator('.resource-row.is-target').getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()

  await page.goto('/')
  await page.getByRole('link', { name: 'Hier weitermachen', exact: true }).click()
  await expect(page).toHaveURL(/\/learning\/focus\/course\/\d+\?mode=source&version=\d+&page=1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Fokussiert lernen', exact: true })).toBeVisible()
  await expect(page.getByText('Seite 1 von 2', { exact: true })).toBeVisible()

  await page.goto('/')
  await page.locator('[aria-labelledby="today-next-heading"]').getByRole('button', { name: 'Schleifen üben' }).click()
  await expect(page.getByRole('dialog')).toContainText('Schleifen üben')
  await page.keyboard.press('Escape')

  await page.locator('.more-top-link').click()
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Neue Notiz' }).click()
  await expect(page.getByRole('textbox', { name: 'Notizinhalt' })).toBeVisible()
})

test('core surfaces at desktop and phone sizes', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  await page.addInitScript(() =>
    localStorage.setItem(
      'marc-ui-preferences-v1',
      JSON.stringify({
        advanced: true,
        language: 'de',
        modules: {
          courses: true,
          deadlines: true,
          notifications: true,
          search: true,
          ai: true,
          projects: true,
          grades: true,
          mail: true,
        },
      }),
    ),
  )
  await page.clock.install({ time: new Date('2026-10-02T08:30:00Z') })
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      name: 'Erfundene Semesterarbeit',
      course_id: 1,
      deadline_at: null,
      notes: 'Planung und gemeinsame Aufgaben.',
      members: [{ name: 'Alex', github_username: null }],
      links: [],
      todos: [{ title: 'Gliederung schreiben', done: false }],
      assignment_ids: [],
      github_repo: null,
    },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = (await projectResponse.json()) as { id: number }
  const addons = (await (await page.request.get('/api/addons/catalog')).json()) as { id: string; fingerprint: string }[]
  const focus = addons.find((addon) => addon.id === 'org.unios.focus-timer')!
  for (const action of ['install', 'approve', 'enable']) {
    const response = await page.request.post(`/api/addons/${focus.id}/${action}`, {
      data: { fingerprint: focus.fingerprint },
    })
    expect(response.ok()).toBeTruthy()
  }
  const deckName = 'Uni::Teststapel'
  const deckId = 90
  const fsrs = createEmptyCard(new Date('2026-10-02T08:00:00Z'))
  const due: components['schemas']['StudyDueResponse'] = {
    cards: [{
      id: 900, note_id: 900, deck: deckName, tags: [], due: 0, queue: 0,
      front: 'Was wiederholt eine Schleife?', back: 'Eine Folge von Anweisungen.',
      front_html: 'Was wiederholt eine Schleife?', back_html: 'Eine Folge von Anweisungen.',
      fsrs: { ...fsrs, due: fsrs.due.toISOString(), last_review: null },
    }],
    generated_at: '2026-10-02T08:00:00Z', has_more: false,
    scope: { deck_id: deckId, deck_name: deckName, includes_subdecks: true },
    counts: { new: 1, learning: 0, review: 0 },
  }
  const stats: components['schemas']['StudyStatsResponse'] = {
    daily_reviews: ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
      '2026-09-30', '2026-10-01', '2026-10-02'].map(day => ({ day, count: 0 })),
    retention: null,
    decks: [{ deck_id: deckId, name: deckName, cards: 1, scope_cards: 1, counts: due.counts }],
  }
  await page.route('**/api/anki/study/status', (route) => route.fulfill({ json: {
    mode: 'integrated', cards: 1, notes: 1, due: 1, reviews: 0, counts: due.counts,
  } satisfies components['schemas']['StudyStatusResponse'] }))
  await page.route('**/api/anki/study/stats', route => route.fulfill({ json: stats }))
  await page.route(url => url.pathname === '/api/anki/study/due' &&
    (url.searchParams.get('deck') === null || url.searchParams.get('deck') === deckName), route => {
    const scoped = new URL(route.request().url()).searchParams.has('deck')
    return route.fulfill({ json: { ...due, scope: scoped ? due.scope : null } satisfies components['schemas']['StudyDueResponse'] })
  })
  await page.route('**/api/mensa/services', (route) =>
    route.fulfill({
      json: {
        canteens: [{ slug: 'test-canteen', name: 'Test-Mensa' }],
        timezone: 'Europe/Berlin',
        mail_url: 'https://outlook.office.com/',
      },
    }),
  )
  await page.route('**/api/mensa/plan?**', (route) =>
    route.fulfill({
      json: {
        date: '2026-10-02',
        canteen: 'test-canteen',
        source_url: 'https://sls.swo.bayern/test-canteen',
        fetched_at: '2026-10-02T08:00:00Z',
        stale: false,
        meals: [
          { name: 'Gemüsepfanne mit Reis', category: 'main', dietary: 'vegan', student_price: 3.5, allergens: 'a1' },
          { name: 'Kartoffeln aus dem Ofen', category: 'side', dietary: 'vegan', student_price: 1.5, allergens: '' },
          {
            name: 'Dessert der Test-Mensa',
            category: 'dessert',
            dietary: 'vegetarian',
            student_price: 1,
            allergens: 'g',
          },
        ],
      },
    }),
  )
  await page.route('**/api/timetable/status', (route) =>
    route.fulfill({
      json: {
        subscribed: true,
        keyring_available: true,
        last_error: '',
        last_success_at: '2026-10-02T08:00:00Z',
        session_link: true,
      },
    }),
  )
  await page.route('**/api/timetable/events?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 710,
          title: 'Mathematik · R101, Erfundener Campus',
          starts_at: '2026-10-02T08:00:00',
          ends_at: '2026-10-02T09:30:00',
        },
        {
          id: 711,
          title: 'Programmieren · R201, Erfundener Campus',
          starts_at: '2026-10-02T09:45:00',
          ends_at: '2026-10-02T11:15:00',
        },
      ],
    }),
  )

  const routes = [
    ['courses', '/courses'],
    ['university-documents', '/university-documents'],
    ['campus', '/campus'],
    ['assessment', '/assessment'],
    ['coding', '/coding'],
    ['welcome', '/welcome'],
    ['import', '/import'],
    ['addons', '/addons'],
    ['settings', '/settings'],
    ['drop', '/drop'],
    ['digest', '/digest'],
    ['jots', '/jots'],
    ['journal', '/journal'],
    ['journal-date', '/journal/2026-10-01'],
    ['rules', '/rules'],
    ['voice', '/voice'],
    ['analytics', '/analytics'],
    ['projects', '/projects'],
    ['grades', '/grades'],
    ['explanations', '/explanations'],
    ['anki', '/anki'],
    ['exercises', '/exercises'],
    ['ai', '/ai'],
    ['not-found', '/absent-page'],
    ['note-editor', '/notes?new=1'],
    ['today', '/'],
    ['course', '/courses/1'],
    ['learning', '/learning'],
    ['inbox', '/inbox'],
    ['collections', '/collections'],
    ['more', '/more'],
    ['calendar', '/deadlines'],
    ['mensa', '/mensa'],
    ['rooms', '/rooms'],
    ['search', '/search'],
    ['mail', '/mail'],
    ['jobs', '/jobs'],
    ['marketplace', '/marketplace'],
    ['notifications', '/notifications'],
    ['activity', '/activity'],
    ['notes', '/notes'],
    ['study', '/study'],
    ['setup', '/setup'],
    ['system', '/system'],
    ['project-detail', `/projects/${project.id}`],
    ['addon-detail', `/addons/${focus.id}`],
    ['study-session', '/study/session/Uni%3A%3ATeststapel'],
  ] as const
  for (const theme of ['light', 'dark'] as const) {
    for (const size of ['desktop', 'phone'] as const) {
      await page.setViewportSize(size === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 })
      await page.goto('/')
      await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
      for (const [name, route] of routes) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0)
        if (name === 'today' || name === 'calendar')
          await expect(page.locator('#timetable').getByText('Programmieren', { exact: true })).toBeVisible()
        if (name === 'mensa') await expect(page.getByRole('heading', { name: 'Gemüsepfanne mit Reis' })).toBeVisible()
        if (name === 'study') {
          const deckLink = page.getByRole('link', { name: /^Teststapel\b/ })
          await expect(deckLink).toBeVisible()
          await expect(deckLink).toHaveAttribute('href', `/study/session/${encodeURIComponent(deckName)}`)
        }
        if (name === 'study-session')
          await expect(page.getByText('Was wiederholt eine Schleife?', { exact: true })).toBeVisible()
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
        const header = page.locator('.app-topbar')
        if (await header.count()) {
          const frame = (await header.boundingBox())!
          for (const control of await header.locator('a, button').all()) {
            if (!(await control.isVisible())) continue
            const box = (await control.boundingBox())!
            expect(box.y + box.height, `${name}: header control wrapped`).toBeLessThanOrEqual(frame.y + frame.height)
          }
        }
        if (size === 'phone')
          expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(390)
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${theme}-${size}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }
      await page.addInitScript(() => {
        const saved = JSON.parse(localStorage.getItem('unios-ui-preferences-v1') || localStorage.getItem('marc-ui-preferences-v1') || '{}')
        localStorage.setItem('unios-ui-preferences-v1', JSON.stringify({ ...saved, modules: { ...saved.modules, mail: true } }))
      })
      await page.goto('/mail')
      await page.locator('.mail-settings > summary').click()
      await expect(page.getByLabel('Gespeicherte Mail wählen')).toBeVisible()
      if (size === 'phone')
        expect(await page.evaluate(() => document.documentElement.scrollWidth), 'mail-settings').toBeLessThanOrEqual(
          390,
        )
      await page.screenshot({
        path: testInfo.outputPath(`mail-settings-${theme}-${size}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      await page.goto('/courses/1')
      await page
        .locator('.resource-row')
        .filter({ hasText: '04_Schleifen.pdf' })
        .getByRole('link', { name: 'PDF öffnen' })
        .click()
      await expect(page.getByText('Seite 1 von 2')).toBeVisible()
      if (size === 'phone')
        expect(await page.evaluate(() => document.documentElement.scrollWidth), 'material').toBeLessThanOrEqual(390)
      await page.screenshot({ path: testInfo.outputPath(`material-${theme}-${size}.png`) })
    }
  }
})
