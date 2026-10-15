// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('integrated cards can be studied offline and replayed to the host', async ({ page, context }, testInfo) => {
  const detail = await (await page.request.get('/api/courses/1')).json()
  const resource = detail.resources.find((item: { name: string }) => item.name === '04_Schleifen.pdf')
  const version = detail.versions[resource.id][0].version

  await page.goto('/study')
  await page.getByRole('button', { name: 'Ohne bestehende Karten starten' }).click()
  await expect(page.getByRole('heading', { name: 'Deine Kartenstapel' })).toBeVisible()

  const created = await page.request.post('/api/anki/queue/import', {
    data: {
      schema_version: 1,
      generated_by: 'browser-test',
      generated_at: new Date().toISOString(),
      source: { resource_id: resource.id, version },
      cards: [
        {
          card_type: 'basic',
          front: 'Was wiederholt eine Schleife?',
          back: 'Anweisungen.',
          course: 'wird-lokal-gesetzt',
          topic: 'Schleifen',
          source_page: 1,
          confidence: 'high',
        },
        {
          card_type: 'basic',
          front: 'Was ist eine Abbruchbedingung?',
          back: 'Eine Bedingung, die die Wiederholung beendet.',
          course: 'wird-lokal-gesetzt',
          topic: 'Schleifen',
          source_page: 1,
          confidence: 'high',
        },
      ],
    },
  })
  expect(created.ok()).toBeTruthy()
  const items = await created.json()
  const approval = await page.request.post('/api/anki/queue/approve', {
    data: { ids: items.map((item: { id: number }) => item.id) },
  })
  expect(approval.ok()).toBeTruthy()
  await page.getByRole('button', { name: 'Freigegebene Karten übernehmen' }).click()
  await page.getByRole('button', { name: 'Kartenbrowser öffnen' }).click()
  await expect(page.getByText('Was wiederholt eine Schleife?')).toBeVisible()
  const studyDeck = (await (await page.request.get('/api/anki/study/due')).json()).cards[0].deck
  await page
    .locator('.study-deck-link')
    .filter({ hasText: studyDeck.replace(/^Uni::/, '').replaceAll('::', ' › ') })
    .click()
  await expect(page).toHaveURL(/\/study\/session\//)
  await expect(page.getByRole('link', { name: 'Alle Stapel', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Karten verwalten' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible()
  await expect(page.locator('.study-card-flow')).toHaveCSS('opacity', '1')

  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      localStorage.setItem('unios-theme', value)
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    await page.waitForTimeout(200)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`study-${theme}-${width}.png`), fullPage: true })
    }
  }

  await context.setOffline(true)
  await page.keyboard.press('Space')
  await expect(page.getByText('Anweisungen.')).toBeVisible()
  await expect(page.getByRole('button', { name: '3 · Gut' })).toBeVisible()
  await page.keyboard.press('3')
  await expect(page.locator('.study-card-flow.is-leaving')).toBeVisible()
  await expect(page.getByText('Was ist eine Abbruchbedingung?')).toBeVisible()
  expect(await page.locator('.study-card-flow').evaluate((node) => getComputedStyle(node).animationName)).toContain(
    'study-card-enter',
  )
  await expect(page.getByText('1 Bewertung wartet auf Übertragung.')).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Antwort zeigen' }).click()
  await page.getByRole('button', { name: '3 · Gut' }).click()
  await expect(page.getByText('Diese Sitzung abgeschlossen')).toBeVisible()
  expect(await page.locator('.study-card-flow').evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
  await expect(page.getByText('2 Bewertungen warten auf Übertragung.')).toBeVisible()

  let releaseMode: () => void = () => undefined
  const modeReady = new Promise<void>((resolve) => {
    releaseMode = resolve
  })
  let modeRequested = false
  let postedReviews = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/anki/study/reviews')) postedReviews += 1
  })
  await page.route('**/api/recovery/status', async (route) => {
    modeRequested = true
    await modeReady
    await route.continue()
  })
  await context.setOffline(false)
  try {
    await expect.poll(() => modeRequested).toBe(true)
    await expect(page.getByText('2 Bewertungen warten auf Übertragung.')).toBeVisible()
    expect(postedReviews).toBe(0)
  } finally {
    releaseMode()
  }
  await expect(page.getByText('2 Bewertungen warten auf Übertragung.')).toHaveCount(0)
  await expect.poll(async () => (await (await page.request.get('/api/anki/study/status')).json()).reviews).toBe(2)
})
