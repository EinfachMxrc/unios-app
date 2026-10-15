// SPDX-License-Identifier: AGPL-3.0-or-later
import { writeFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { createEmptyCard } from 'ts-fsrs'
import type { Page } from '@playwright/test'
import type { components } from '../src/generated/api'

test.use({ hasTouch: true })
let clicks = 0
let started = 0
test.beforeEach(async ({ page }) => {
  expect((await page.request.post('http://127.0.0.1:8173/api/__test__/reset')).ok()).toBeTruthy()
  clicks = 0
  started = performance.now()
  await page.exposeFunction('qualityClick', () => {
    clicks++
  })
  await page.addInitScript(() =>
    document.addEventListener(
      'click',
      () => {
        void (window as unknown as { qualityClick: () => Promise<void> }).qualityClick()
      },
      true,
    ),
  )
})
test.afterEach(async ({ page }, info) => {
  const browserClosed = page.isClosed()
  const result = {
    schema: 1,
    fixture_only: true,
    automated: true,
    browser_closed: browserClosed,
    mission: info.title,
    clicks,
    elapsed_ms: Math.round(performance.now() - started),
    status: info.status,
    errors: info.errors.length,
    aborted: info.status === 'interrupted',
    includes_navigation_and_assertion_time: true,
  }
  await writeFile(info.outputPath('mission.json'), JSON.stringify(result, null, 2))
  await info.attach('mission.json', { body: JSON.stringify(result), contentType: 'application/json' })
})
async function reader(page: Page) {
  await page.goto('/courses/1')
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
}
async function subscribe(page: Page) {
  await page.request.delete('/api/timetable/subscription')
  await page.goto('/deadlines#timetable')
  await page.getByText('Hochschulkalender hinzufügen', { exact: true }).click()
  await page
    .getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true })
    .fill('https://calendar.example.test/feed.ics')
  await page.getByRole('button', { name: 'Stundenplan abonnieren', exact: true }).click()
  await expect(page.locator('.timetable-navigation')).toBeVisible()
}

test('01 Today to course list', async ({ page }) => {
  await page.goto('/')
  await page.locator('.app-nav a[href="/courses"]').click()
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true, level: 1 })).toBeVisible()
})
test('02 open a course from the list', async ({ page }) => {
  await page.goto('/courses')
  await page.locator('main a[href="/courses/1"]').first().click()
  await expect(page.locator('.course-tabs')).toBeVisible()
})
test('03 course filter and tab survive return', async ({ page }) => {
  await page.goto('/courses/1')
  await page.locator('.course-tabs a').filter({ hasText: 'Unterlagen' }).click()
  await page.getByRole('searchbox', { name: 'Unterlagen durchsuchen' }).fill('Schleifen')
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Neue Notiz' }).click()
  await expect(page).toHaveURL(/notes/)
  await page.goBack()
  await expect(page.getByRole('searchbox', { name: 'Unterlagen durchsuchen' })).toHaveValue('Schleifen')
  await expect(page.locator('.course-tabs [aria-current="page"]')).toContainText('Unterlagen')
})
test('04 find a document through search', async ({ page }) => {
  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Schleifen')
  await page.locator('.search-form button[type="submit"]').click()
  await expect(page.locator('.search-result .result-title').first()).toBeVisible()
  await expect(page.locator('.search-result mark').first()).toBeVisible()
})
test('05 preview a source before opening', async ({ page }) => {
  await page.goto('/search?q=Schleifen')
  await page.locator('.source-preview summary').first().click()
  await expect(page.locator('.source-preview[open] p')).toBeVisible()
  await page.locator('.source-preview[open]').getByRole('link', { name: 'Quelle öffnen' }).click()
  await expect(page.locator('.material-reader')).toBeVisible()
})
test('06 PDF page and completed search survive note and back', async ({ page }) => {
  await reader(page)
  const search = page.getByRole('search')
  await search.getByRole('searchbox').fill('Rekursionstiefe')
  await search.getByRole('button', { name: 'Suchen', exact: true }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 2')
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Neue Notiz' }).click()
  await expect(page).toHaveURL(/notes/)
  await page.goBack()
  await expect(search.getByRole('searchbox')).toHaveValue('Rekursionstiefe')
  await expect(page.locator('.material-search-feedback')).toContainText('1 Treffer auf 1 Seiten')
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 2')
})
test('07 calendar week survives navigation', async ({ page }) => {
  await subscribe(page)
  await page.getByRole('button', { name: 'Nächste Woche', exact: true }).click()
  const week = await page.locator('.timetable-navigation strong').textContent()
  await page.locator('.app-nav a[href="/courses"]').click()
  await page.goBack()
  await expect(page.locator('.timetable-navigation strong')).toHaveText(week!)
})
test('08 invalid calendar link has an inline correction and sends nothing', async ({ page }) => {
  await page.request.delete('/api/timetable/subscription')
  let writes = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/timetable/subscribe') && request.method() === 'POST') writes++
  })
  await page.goto('/deadlines#timetable')
  await page.getByText('Hochschulkalender hinzufügen', { exact: true }).click()
  await page.getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true }).fill('not-a-calendar')
  await page.getByRole('button', { name: 'Stundenplan abonnieren', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTPS-Kalenderlink')
  await expect(page.getByLabel('Persönlicher Kalender-/iCal-Link', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(writes).toBe(0)
})
test('09 reader focus mode is reversible and preserved', async ({ page }) => {
  await reader(page)
  await page.getByRole('button', { name: 'Fokusmodus', exact: true }).click()
  await expect(page.locator('.app-sidebar')).not.toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Fokus beenden', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fokus beenden', exact: true }).click()
  await expect(page.locator('.app-sidebar')).toBeVisible()
})
test('10 new note has a visible required title', async ({ page }) => {
  await page.goto('/notes?new=1&course_id=1')
  const title = page.locator('.note-title-input')
  await expect(title).toHaveAttribute('required', '')
  await expect(page.locator('.field-heading > label')).toContainText(/titel/i)
  await title.fill('Testentwurf')
  await page.locator('.app-nav a[href="/courses"]').click()
  await page.goBack()
  await expect(title).toHaveValue('Testentwurf')
})
test('11 learning tabs retain the visible shell', async ({ page }) => {
  await page.goto('/learning')
  for (const path of ['/study', '/assessment', '/coding', '/learning']) {
    await page.locator(`.learning-tabs a[href="${path}"]`).click()
    await expect(page.locator('.app-topbar')).toBeVisible()
    await expect(page.locator(`.learning-tabs a[href="${path}"].active`)).toBeVisible()
  }
})
test('12 ratings advance even while an upload is held', async ({ page }) => {
  const deckName = 'Quality'
  const cards: components['schemas']['StudyCard'][] = [1, 2].map((id) => {
    const fsrs = createEmptyCard(new Date())
    return {
      id,
      note_id: id,
      front: `Testfrage ${id}`,
      back: 'Antwort',
      front_html: `Testfrage ${id}`,
      back_html: 'Antwort',
      deck: deckName,
      tags: [],
      due: 0,
      queue: 0,
      fsrs: { ...fsrs, due: fsrs.due.toISOString(), last_review: null },
    }
  })
  const due: components['schemas']['StudyDueResponse'] = {
    cards,
    generated_at: new Date().toISOString(),
    has_more: false,
    scope: { deck_id: 42, deck_name: deckName, includes_subdecks: true },
    counts: { new: 2, learning: 0, review: 0 },
  }
  await page.route('**/api/anki/study/status', (route) =>
    route.fulfill({
      json: {
        mode: 'integrated',
        cards: 2,
        notes: 2,
        due: 2,
        reviews: 0,
        counts: due.counts,
      } satisfies components['schemas']['StudyStatusResponse'],
    }),
  )
  await page.route(
    (url) =>
      url.pathname === '/api/anki/study/due' &&
      (url.searchParams.get('deck') === null || url.searchParams.get('deck') === deckName),
    (route) => {
      const scoped = new URL(route.request().url()).searchParams.has('deck')
      return route.fulfill({
        json: { ...due, scope: scoped ? due.scope : null } satisfies components['schemas']['StudyDueResponse'],
      })
    },
  )
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let uploads = 0
  await page.route('**/api/anki/study/reviews', async (route) => {
    uploads++
    await held
    const input = route.request().postDataJSON() as { card_id: number }
    const card = cards.find((candidate) => candidate.id === input.card_id)!
    await route.fulfill({
      json: { card, already_applied: false } satisfies components['schemas']['StudyReviewResponse'],
    })
  })
  await page.goto('/study/session/Quality')
  try {
    for (let index = 0; index < 2; index++) {
      await page.getByRole('button', { name: /Antwort zeigen/ }).click()
      await page.getByRole('button', { name: /3.*Gut/ }).click()
    }
    await expect(page.locator('.study-session-done')).toBeVisible()
    expect(uploads).toBe(1)
  } finally {
    release()
  }
  await expect.poll(() => uploads).toBe(2)
})
test('13 programming focus keeps an exit control', async ({ page }) => {
  await page.goto('/coding')
  await page.getByRole('button', { name: 'Fokusmodus', exact: true }).click()
  await expect(page.locator('.app-topbar')).not.toBeVisible()
  await page.getByRole('button', { name: 'Fokus beenden', exact: true }).click()
  await expect(page.locator('.app-topbar')).toBeVisible()
})
test('14 command palette opens and closes from keyboard', async ({ page }) => {
  await page.goto('/courses')
  await expect(page.locator('.top-search-trigger')).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('15 dietary choice persists', async ({ page }) => {
  await page.route('**/api/mensa/services', (route) =>
    route.fulfill({ json: { canteens: [{ slug: 'test-canteen', name: 'Test-Mensa' }], timezone: 'Europe/Berlin' } }),
  )
  await page.route('**/api/mensa/plan?**', (route) => route.fulfill({ json: { meals: [], stale: false } }))
  await page.goto('/mensa')
  await page.getByRole('combobox', { name: 'Ernährung', exact: true }).selectOption('vegan')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Ernährung', exact: true })).toHaveValue('vegan')
})
test('16 room source is discoverable without inventing availability', async ({ page }) => {
  await page.route('**/api/rooms/config', (route) =>
    route.fulfill({
      json: { url: 'https://booking.example.test/', rooms: ['4-031'], start_times: ['09:00'], durations: [30] },
    }),
  )
  await page.goto('/search?q=Raumbuchung')
  await page.getByRole('link', { name: 'Räume & Buchung' }).click()
  await expect(page.getByText('Noch kein Raum geprüft')).toBeVisible()
})
test('17 mark seen clears the unread badge', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Benachrichtigungen(?:: \d+\+? ungelesen)?$/ }).click()
  const popup = page.getByRole('dialog', { name: 'Benachrichtigungen', exact: true })
  await popup.getByRole('button', { name: 'Alle als gesehen markieren' }).click()
  await expect(popup.getByText('Alles gesehen', { exact: true })).toBeVisible()
  await expect(page.locator('.topbar-notification-count')).toHaveCount(0)
})
test('18 density is optional and persisted', async ({ page }) => {
  await page.goto('/settings#appearance')
  const density = page.getByRole('combobox', { name: 'Abstände', exact: true })
  await expect(density).toHaveValue('comfortable')
  await density.selectOption('compact')
  await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'compact')
  await page.reload()
  await expect(density).toHaveValue('compact')
})
test('19 read failure offers recovery without replaying writes', async ({ page }) => {
  let failed = true
  await page.route('**/api/courses/1', (route) =>
    failed ? route.fulfill({ status: 500, json: { detail: 'HTTP 500 /api/private' } }) : route.continue(),
  )
  await page.goto('/courses/1')
  await expect(page.getByRole('alert')).toContainText('Daten konnten nicht geladen werden')
  await expect(page.getByRole('link', { name: 'Verbindung prüfen', exact: true })).toBeVisible()
  failed = false
  await page.getByRole('button', { name: 'Daten erneut laden', exact: true }).click()
  await expect(page.locator('.course-tabs')).toBeVisible()
})
test('20 mobile focus control is reachable and 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.goto('/coding')
  const focus = page.getByRole('button', { name: 'Fokusmodus', exact: true })
  await expect(page.locator('.learning-tabs')).toBeVisible()
  await expect(focus).toBeVisible()
  expect((await focus.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await focus.click()
  await expect(page.getByRole('button', { name: 'Fokus beenden', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
