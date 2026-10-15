// SPDX-License-Identifier: AGPL-3.0-or-later

import type { APIResponse, Page } from '@playwright/test'
import type { components } from '../src/generated/api'
import { expect, test } from './fixtures'

type Due = components['schemas']['StudyDueResponse']
type Stats = components['schemas']['StudyStatsResponse']
type Review = components['schemas']['ReviewInput']
type SeedDeck = { id: number; name: string; card_ids: number[]; fronts: string[] }
type Scenario = {
  parent: SeedDeck
  deck_a: SeedDeck
  deck_b: SeedDeck
  deck_bb: SeedDeck
  deck_c: SeedDeck
  selected_deck_id: number
  first_parent_card_id: number
  native_parent_counts: Due['counts']
  total_cards: number
}
type Inspection = {
  present: boolean
  selected_deck_id: number
  cards: number
  reviews: number
  receipts: { review_id: string; card_id: number; rating: number }[]
}
type ReadCache = {
  clientState: { queries: { queryKey: unknown[]; state: { data?: Due } }[] }
}

const scenarioPath = '/api/__test__/study-deck-scenario'
const duePath = (name: string) => `/api/anki/study/due?deck=${encodeURIComponent(name)}`
const sessionPath = (name: string) => `/study/session/${encodeURIComponent(name)}`
let scenario: Scenario

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `HTTP ${response.status()} ${response.url()}`).toBeTruthy()
  return response.json()
}

async function browserValue<T>(page: Page, database: string, store: string, key: string): Promise<T | undefined> {
  return page.evaluate(({ database, store, key }) => new Promise<unknown>((resolve) => {
    const open = indexedDB.open(database)
    // Inspection must not create a store or change the product's storage schema.
    open.onupgradeneeded = () => open.transaction?.abort()
    open.onerror = () => resolve(undefined)
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(store)) {
        db.close()
        resolve(undefined)
        return
      }
      const read = db.transaction(store, 'readonly').objectStore(store).get(key)
      read.onerror = () => { db.close(); resolve(undefined) }
      read.onsuccess = () => { db.close(); resolve(read.result) }
    }
  }), { database, store, key }) as Promise<T | undefined>
}

async function outbox(page: Page) {
  return (await browserValue<Review[]>(page, 'marc-uni-os-study', 'review-queue', 'pending-v1')) ?? []
}

async function waitForScopeCache(page: Page, deck: SeedDeck) {
  await expect.poll(async () => {
    const saved = await browserValue<ReadCache>(page, 'marc-uni-os-read-cache', 'queries', 'read-queries-v1')
    return saved?.clientState.queries.find(query => query.queryKey[1] === duePath(deck.name))?.state.data?.scope?.deck_id
  }).toBe(deck.id)
}

async function waitForOfflineShell(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

const deckLink = (page: Page, deck: SeedDeck) => page.locator(`.study-deck-link[href="${sessionPath(deck.name)}"]`)

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  scenario = await json<Scenario>(await page.request.post(scenarioPath))
})

test.afterEach(async ({ page, context }) => {
  await context.setOffline(false)
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
})

test('deck B has its real card beyond the global 100-card window and counts do not shrink to that window', async ({ page }) => {
  const global = await json<Due>(await page.request.get('/api/anki/study/due'))
  expect(global.cards).toHaveLength(100)
  expect(global.cards.every(card => card.deck === scenario.deck_a.name)).toBe(true)
  expect(global.counts.new).toBe(104)
  expect(global.has_more).toBe(true)
  const a = await json<Due>(await page.request.get(duePath(scenario.deck_a.name)))
  expect(a.cards).toHaveLength(100)
  expect(a.counts.new).toBe(101)
  expect(a.has_more).toBe(true)
  const b = await json<Due>(await page.request.get(duePath(scenario.deck_b.name)))
  expect(b.scope).toEqual({ deck_id: scenario.deck_b.id, deck_name: scenario.deck_b.name, includes_subdecks: true })
  expect(b.cards.map(card => card.id)).toEqual(scenario.deck_b.card_ids)
  expect(b.counts.new).toBe(1)
  expect(b.has_more).toBe(false)
  const stats = await json<Stats>(await page.request.get('/api/anki/study/stats'))
  expect(stats.decks.find(deck => deck.deck_id === scenario.deck_a.id)).toMatchObject({ cards: 101, scope_cards: 101, counts: { new: 101 } })
  expect(stats.decks.find(deck => deck.deck_id === scenario.deck_b.id)).toMatchObject({ cards: 1, scope_cards: 1, counts: { new: 1 } })

  await page.goto('/study')
  await expect(deckLink(page, scenario.deck_a)).toContainText('101 heute geplant · 101 Karten mit Unterstapeln')
  await expect(deckLink(page, scenario.deck_b)).toContainText('1 heute geplant · 1 Karte mit Unterstapeln')
  await deckLink(page, scenario.deck_b).click()
  await expect(page.getByText(scenario.deck_b.fronts[0], { exact: true })).toBeVisible()
  await expect(page.getByText(scenario.deck_bb.fronts[0], { exact: true })).toHaveCount(0)
  await expect(page.getByText('0 von 1 Karte bearbeitet', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible()
  const inspected = await json<Inspection>(await page.request.get(scenarioPath))
  expect(inspected.selected_deck_id).toBe(scenario.selected_deck_id)
})

test('parent reviews keep the parent scope across offline reload and replay exactly once', async ({ page, context }) => {
  const parent = await json<Due>(await page.request.get(duePath(scenario.parent.name)))
  expect(parent.scope?.deck_id).toBe(scenario.parent.id)
  expect(parent.cards[0].id).toBe(scenario.first_parent_card_id)
  expect(parent.cards[0].deck).toBe(scenario.deck_a.name)
  expect(parent.cards).toHaveLength(100)
  expect(parent.counts.new).toBe(104)
  const first = parent.cards[0]
  const next = parent.cards[1]
  await page.goto(sessionPath(scenario.parent.name))
  await expect(page.getByText(first.front, { exact: true })).toBeVisible()
  await waitForScopeCache(page, scenario.parent)
  await waitForOfflineShell(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Antwort zeigen' }).click()
  await page.getByRole('button', { name: '3 · Gut' }).click()
  await expect(page.getByText(next.front, { exact: true })).toBeVisible()
  await expect.poll(async () => (await outbox(page)).length).toBe(1)
  const pending = (await outbox(page))[0]
  expect(pending).toMatchObject({ card_id: first.id, rating: 3, offline: true, study_deck_id: scenario.parent.id })

  await page.reload()
  await expect(page.getByText(next.front, { exact: true })).toBeVisible()
  await expect(page.getByText(first.front, { exact: true })).toHaveCount(0)
  await expect(page.getByText('1 von 100 Karten bearbeitet', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '3 · Gut' })).toHaveCount(0)
  await expect(page.getByText('1 Bewertung wartet auf Übertragung.', { exact: true })).toBeVisible()
  expect(await outbox(page)).toEqual([pending])

  const posted: Review[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/anki/study/reviews')) posted.push(request.postDataJSON() as Review)
  })
  await context.setOffline(false)
  await expect.poll(async () => (await json<Inspection>(await page.request.get(scenarioPath))).reviews).toBe(1)
  await expect.poll(async () => (await outbox(page)).length).toBe(0)
  expect(posted).toEqual([pending])
  const inspected = await json<Inspection>(await page.request.get(scenarioPath))
  expect(inspected.selected_deck_id).toBe(scenario.selected_deck_id)
  expect(inspected.receipts).toEqual([{ review_id: pending.review_id, card_id: first.id, rating: 3 }])
  const replay = await json<components['schemas']['StudyReviewResponse']>(await page.request.post('/api/anki/study/reviews', { data: pending }))
  expect(replay.already_applied).toBe(true)
  expect((await json<Inspection>(await page.request.get(scenarioPath))).reviews).toBe(1)
  await page.reload()
  await expect(page.getByText(next.front, { exact: true })).toBeVisible()
  await expect(page.getByText(first.front, { exact: true })).toHaveCount(0)
})

test('visited B survives an offline restart while never visited C is honestly unavailable', async ({ page, context }) => {
  await page.goto(sessionPath(scenario.deck_a.name))
  await expect(page.getByText(scenario.deck_a.fronts[0], { exact: true })).toBeVisible()
  await expect(page.getByText('0 von 100 Karten bearbeitet', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Alle Stapel', exact: true }).click()
  await deckLink(page, scenario.deck_b).click()
  await expect(page.getByText(scenario.deck_b.fronts[0], { exact: true })).toBeVisible()
  await expect(page.getByText(scenario.deck_a.fronts[0], { exact: true })).toHaveCount(0)
  await waitForScopeCache(page, scenario.deck_b)
  await waitForOfflineShell(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(scenario.deck_b.fronts[0], { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible()
  await page.getByRole('link', { name: 'Alle Stapel', exact: true }).click()
  await expect(deckLink(page, scenario.deck_b)).toContainText('1 heute geplant · 1 Karte mit Unterstapeln')
  await deckLink(page, scenario.deck_c).click()
  await expect(page.getByRole('heading', { name: 'Dieses Deck ist offline noch nicht gespeichert', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Verbindung öffnen', exact: true })).toHaveAttribute('href', '/system')
  await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toHaveCount(0)
  await expect(page.getByText(scenario.deck_b.fronts[0], { exact: true })).toHaveCount(0)
  await expect(page.getByText('Heute nichts zu lernen', { exact: true })).toHaveCount(0)
})

test('online reload waits for a fresh scoped queue instead of freezing stale cached cards', async ({ page }) => {
  await page.goto(sessionPath(scenario.parent.name))
  await expect(page.getByText(scenario.deck_a.fronts[0], { exact: true })).toBeVisible()
  await waitForScopeCache(page, scenario.parent)
  // A second device acknowledges a review while this device keeps its cached queue.
  const review: Review = { card_id: scenario.first_parent_card_id, rating: 3, review_id: crypto.randomUUID(),
    offline: true, reviewed_at: new Date().toISOString(), study_deck_id: scenario.parent.id }
  await json(await page.request.post('/api/anki/study/reviews', { data: review }))
  const fresh = await json<Due>(await page.request.get(duePath(scenario.parent.name)))
  expect(fresh.cards[0].id).not.toBe(review.card_id)
  let requested = false
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  // Delay the real server response; no fabricated queue or scheduler result is used.
  await page.route(`**${duePath(scenario.parent.name)}`, async route => {
    requested = true
    await gate
    await route.continue()
  })
  try {
    await page.reload()
    await expect.poll(() => requested).toBe(true)
    await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toHaveCount(0)
    await expect(page.getByText(scenario.deck_a.fronts[0], { exact: true })).toHaveCount(0)
  } finally {
    release()
  }
  await expect(page.getByText(fresh.cards[0].front, { exact: true })).toBeVisible()
  await expect(page.getByText(scenario.deck_a.fronts[0], { exact: true })).toHaveCount(0)
})

test('pending replay cannot freeze a scoped GET that was read before acknowledgement', async ({ page }) => {
  const pending: Review = { card_id: scenario.deck_a.card_ids[0], rating: 3, review_id: crypto.randomUUID(),
    offline: true, reviewed_at: new Date().toISOString(), study_deck_id: scenario.deck_a.id }
  let releaseReview: () => void = () => undefined
  let releaseOldQueue: () => void = () => undefined
  const reviewGate = new Promise<void>(resolve => { releaseReview = resolve })
  const oldQueueGate = new Promise<void>(resolve => { releaseOldQueue = resolve })
  let scopedRequests = 0
  let oldQueue: Due | undefined
  const posted: Review[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/anki/study/reviews'))
      posted.push(request.postDataJSON() as Review)
  })
  await page.route('**/api/anki/study/reviews', async route => {
    await reviewGate
    await route.continue()
  })
  await page.route(url => url.pathname === '/api/anki/study/due' && url.searchParams.get('deck') === scenario.deck_a.name,
    async route => {
      scopedRequests += 1
      if (scopedRequests !== 1) {
        await route.continue()
        return
      }
      // Read the real native queue before ACK, but hold its HTTP response until after ACK.
      const response = await route.fetch()
      expect(response.ok()).toBeTruthy()
      oldQueue = await response.json() as Due
      await oldQueueGate
      try { await route.fulfill({ response }) } catch (error) {
        // The freshness fix cancels this obsolete request before making a distinct GET.
        // A genuine HTTP/fulfilment failure must still fail the test.
        if (route.request().failure()?.errorText !== 'net::ERR_ABORTED') throw error
      }
    })
  try {
    await page.goto('/study')
    await expect(deckLink(page, scenario.deck_a)).toBeVisible()
    expect(scopedRequests).toBe(0)
    const cached = await browserValue<ReadCache>(page, 'marc-uni-os-read-cache', 'queries', 'read-queries-v1')
    expect(cached?.clientState.queries.some(query => query.queryKey[1] === duePath(scenario.deck_a.name)) ?? false).toBe(false)

    // Fixture for a previous offline visit: a real durable UUID, without a scoped query cache.
    await page.evaluate(review => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('marc-uni-os-study')
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('review-queue')) open.result.createObjectStore('review-queue')
      }
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('review-queue', 'readwrite')
        const store = transaction.objectStore('review-queue')
        const read = store.get('pending-v1')
        read.onsuccess = () => {
          if (read.result?.length) { transaction.abort(); return }
          store.put([review], 'pending-v1')
        }
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
        transaction.onabort = () => { db.close(); reject(new Error('Synthetic outbox must start empty')) }
      }
    }), pending)
    expect(await outbox(page)).toEqual([pending])
    await deckLink(page, scenario.deck_a).click()
    await expect.poll(() => oldQueue?.cards[0].id).toBe(pending.card_id)
    expect((await json<Inspection>(await page.request.get(scenarioPath))).reviews).toBe(0)
    // Upload ownership is durable before HTTP; an in-flight answer cannot be
    // treated as an unuploaded offline review by another window's Undo.
    await expect.poll(() => outbox(page)).toEqual([{ ...pending, upload_started: true }])

    releaseReview()
    await expect.poll(async () => (await json<Inspection>(await page.request.get(scenarioPath))).reviews).toBe(1)
    await expect.poll(async () => (await outbox(page)).length).toBe(0)
    expect(posted).toEqual([pending])
    const acknowledged = await json<Inspection>(await page.request.get(scenarioPath))
    expect(acknowledged.receipts).toEqual([{ review_id: pending.review_id, card_id: pending.card_id, rating: 3 }])
    releaseOldQueue()

    const fresh = await json<Due>(await page.request.get(duePath(scenario.deck_a.name)))
    expect(fresh.cards[0].id).toBe(oldQueue!.cards[1].id)
    await expect(page.getByText(fresh.cards[0].front, { exact: true })).toBeVisible()
    await expect(page.getByText(oldQueue!.cards[0].front, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible()
    expect(scopedRequests).toBeGreaterThanOrEqual(2)
    const final = await json<Inspection>(await page.request.get(scenarioPath))
    expect(final.reviews).toBe(1)
    expect(final.receipts).toEqual(acknowledged.receipts)
    expect(final.selected_deck_id).toBe(scenario.selected_deck_id)
  } finally {
    releaseReview()
    releaseOldQueue()
  }
})
