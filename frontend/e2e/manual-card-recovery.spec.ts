// SPDX-License-Identifier: AGPL-3.0-or-later

import type { BrowserContext, Locator, Page } from '@playwright/test'
import type { components } from '../src/generated/api'
import { expect, test } from './fixtures'

type Scenario = { version_id: number; annotation: { id: string }; deck_name: string }
type Sent = components['schemas']['ManualCardInput']
type ReviewSent = components['schemas']['ReviewInput']
type NativeSnapshot = {
  cards: number
  reviews: number
  receipts: Array<{ review_id: string; card_id: number; rating: number }>
  revlog: Array<{ id: number; card_id: number; rating: number }>
  sql_reviews: Array<{ id: number; card_id: number; rating: number; review_id: string | null; reviewed_at: string }>
  sql_cards: Array<{ id: number; queue_id: number; note_id: string }>
}
let scenario: Scenario

async function openDraft(page: Page) {
  await page.goto(`/material/${scenario.version_id}?page=12`)
  await expect(page.locator('[data-material-page="12"] canvas')).toBeVisible()
  const annotations = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  if (!(await annotations.isVisible())) {
    await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  }
  await page.getByRole('button', { name: 'Als Lernkarte', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Eigene Lernkarte', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

function front(dialog: Locator) {
  return dialog.getByRole('textbox', { name: 'Eigene Frage', exact: true })
}

async function visibleDraftText(dialog: Locator) {
  return dialog.evaluate((element) => {
    const controls = Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'))
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => control.value)
    return `${(element as HTMLElement).innerText}\n${controls.join('\n')}`
  })
}

async function pendingNativeReviews(page: Page): Promise<ReviewSent[]> {
  return page.evaluate(
    () =>
      new Promise<ReviewSent[]>((resolve, reject) => {
        const opening = indexedDB.open('marc-uni-os-study')
        opening.onupgradeneeded = () => opening.transaction?.abort()
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const database = opening.result
          const reading = database.transaction('review-queue', 'readonly').objectStore('review-queue').get('pending-v1')
          reading.onerror = () => {
            database.close()
            reject(reading.error)
          }
          reading.onsuccess = () => {
            database.close()
            resolve(reading.result ?? [])
          }
        }
      }),
  )
}

async function staleBackgroundPage(context: BrowserContext) {
  const second = await context.newPage()
  await second.addInitScript(() => {
    // Notifications are hints. A background document missing all of them must
    // still compare its old revision with the real shared IDB transaction.
    for (const type of ['storage', 'focus']) {
      window.addEventListener(type, (event) => event.stopImmediatePropagation(), true)
    }
    const addListener = BroadcastChannel.prototype.addEventListener
    BroadcastChannel.prototype.addEventListener = function (...args: Parameters<typeof addListener>) {
      if (args[0] !== 'message') addListener.apply(this, args)
    }
    Object.defineProperty(BroadcastChannel.prototype, 'onmessage', {
      configurable: true,
      get: () => null,
      set: () => {},
    })
  })
  return second
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const seeded = await page.request.post('/api/__test__/manual-card-scenario')
  expect(seeded.ok(), await seeded.text()).toBeTruthy()
  scenario = await seeded.json()
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('stale windows preserve both own texts through reload instead of overwriting a draft', async ({
  page,
  context,
}) => {
  const first = await openDraft(page)
  await expect(front(first)).toBeEnabled()
  const secondPage = await staleBackgroundPage(context)
  const second = await openDraft(secondPage)
  await expect(front(second)).toBeEnabled()
  const textA = 'Fenster A: Meine Erklärung zum unveränderlichen Quellenbezug'
  const textB = 'Fenster B: Meine alternative Herleitung desselben Konzepts'
  await front(first).fill(textA)
  await expect(first).toContainText('Entwurf auf diesem Gerät gespeichert.')
  await front(second).fill(textB)
  await expect(second).toContainText('Entwurf auf diesem Gerät gespeichert.')
  const reopenedFirst = await openDraft(page)
  const reopenedSecond = await openDraft(secondPage)
  for (const dialog of [reopenedFirst, reopenedSecond]) {
    await expect.poll(() => visibleDraftText(dialog)).toContain(textA)
    await expect.poll(() => visibleDraftText(dialog)).toContain(textB)
  }
  const retained = reopenedFirst
    .getByRole('region', { name: 'Gesicherte Fassungen', exact: true })
    .locator('article')
    .filter({ hasText: textB })
  await retained.getByRole('button', { name: 'Diese Fassung übernehmen', exact: true }).click()
  await expect(front(reopenedFirst)).toHaveValue(textB)
  const storing = page.waitForResponse(
    (response) => response.url().endsWith('/api/anki/manual-cards') && response.request().method() === 'POST',
  )
  await reopenedFirst.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  const saved: components['schemas']['ManualCardResponse'] = await (await storing).json()
  expect(saved.card.front).toBe(textB)
  await expect(reopenedFirst).toContainText('Gespeichert und in Anki übernommen')
  expect(await (await page.request.get('/api/anki/queue?origin=manual')).json()).toHaveLength(1)
})

test('simultaneous save reserves one exact payload across both windows', async ({ page, context }) => {
  const first = await openDraft(page)
  const second = await openDraft(await context.newPage())
  await expect(front(first)).toBeEnabled()
  await expect(front(second)).toBeEnabled()
  const sent: Sent[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route('**/api/anki/manual-cards', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    sent.push(route.request().postDataJSON() as Sent)
    const response = await route.fetch()
    await gate
    await route.fulfill({ response })
  })
  try {
    // Both controls are initially enabled. Native click() respects a button
    // disabled by a reservation that arrives just ahead of the second click.
    await Promise.all(
      [first, second].map((dialog) =>
        dialog
          .getByRole('button', {
            name: 'Speichern & freigeben',
            exact: true,
          })
          .evaluate((button) => (button as HTMLButtonElement).click()),
      ),
    )
    await expect.poll(() => sent.length).toBeGreaterThan(0)
    await expect(front(first)).toBeDisabled()
    await expect(front(second)).toBeDisabled()
  } finally {
    release()
  }
  for (const dialog of [first, second]) {
    await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  }
  for (const payload of sent) expect(payload).toEqual(sent[0])
  expect(await (await page.request.get('/api/anki/queue?origin=manual')).json()).toHaveLength(1)
  expect((await (await page.request.get('/api/__test__/study-deck-scenario')).json()).cards).toBe(1)
})

test('another window recovers the exact lost acknowledgement after the sender closes', async ({ page, context }) => {
  const first = await openDraft(page)
  const secondPage = await context.newPage()
  const second = await openDraft(secondPage)
  await expect(front(first)).toBeEnabled()
  await expect(front(second)).toBeEnabled()
  const sent: Sent[] = []
  await context.route('**/api/anki/manual-cards', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    sent.push(route.request().postDataJSON() as Sent)
    const response = await route.fetch()
    expect(response.status(), await response.text()).toBe(201)
    if (sent.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Synthetisch verlorene Fenster-Bestätigung' }),
      })
    } else await route.fulfill({ response })
  })
  await first.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Identischen Request erneut senden', exact: true })).toBeVisible()
  await page.close()
  const recovered = await openDraft(secondPage)
  await expect(front(recovered)).toBeDisabled()
  await recovered.getByRole('button', { name: 'Identischen Request erneut senden', exact: true }).click()
  await expect(recovered).toContainText('Gespeichert und in Anki übernommen')
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  expect(await (await secondPage.request.get('/api/anki/queue?origin=manual')).json()).toHaveLength(1)
  expect((await (await secondPage.request.get('/api/__test__/study-deck-scenario')).json()).cards).toBe(1)
})

test('a delayed old acknowledgement cannot overwrite an explicitly started second card', async ({ page, context }) => {
  const first = await openDraft(page)
  const secondPage = await context.newPage()
  await openDraft(secondPage)
  const sent: Sent[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route('**/api/anki/manual-cards', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    sent.push(route.request().postDataJSON() as Sent)
    const requestIndex = sent.length
    const response = await route.fetch()
    if (requestIndex === 1) await gate
    await route.fulfill({ response })
  })
  try {
    await first.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
    await expect.poll(() => sent.length).toBe(1)
    const recovered = await openDraft(secondPage)
    await recovered.getByRole('button', { name: 'Identischen Request erneut senden', exact: true }).click()
    await expect(recovered).toContainText('Gespeichert und in Anki übernommen')
    await recovered.getByRole('button', { name: 'Weitere eigene Karte aus dieser Quelle', exact: true }).click()
    await expect(front(recovered)).toBeEnabled()
    await front(recovered).fill('Die zweite bewusste Frage bleibt nach dem verspäteten ACK erhalten')
    await expect(recovered).toContainText('Entwurf auf diesem Gerät gespeichert.')
  } finally {
    release()
  }
  const current = secondPage.getByRole('dialog', { name: 'Eigene Lernkarte', exact: true })
  await expect(front(current)).toHaveValue('Die zweite bewusste Frage bleibt nach dem verspäteten ACK erhalten')
  await current.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(current).toContainText('Gespeichert und in Anki übernommen')
  expect(sent).toHaveLength(3)
  expect(sent[1]).toEqual(sent[0])
  expect(sent[2].mutation_id).not.toBe(sent[0].mutation_id)
  expect(sent[2].front).toBe('Die zweite bewusste Frage bleibt nach dem verspäteten ACK erhalten')
  expect(await (await secondPage.request.get('/api/anki/queue?origin=manual')).json()).toHaveLength(2)
  expect((await (await secondPage.request.get('/api/__test__/study-deck-scenario')).json()).cards).toBe(2)
})

test('a native review survives SQL failure and repairs the original mirror on browser reload', async ({ page }) => {
  const dialog = await openDraft(page)
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  await page.goto(`/study/session/${encodeURIComponent(scenario.deck_name)}`)
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  expect((await page.request.post('/api/__test__/study-review-fault')).ok()).toBeTruthy()
  const sent: ReviewSent[] = []
  let observed!: (value: NativeSnapshot) => void
  const failedSnapshot = new Promise<NativeSnapshot>((resolve) => {
    observed = resolve
  })
  await page.route('**/api/anki/study/reviews', async (route) => {
    sent.push(route.request().postDataJSON() as ReviewSent)
    const response = await route.fetch()
    if (sent.length === 1) {
      expect(response.status(), await response.text()).toBe(503)
      observed((await (await page.request.get('/api/__test__/study-deck-scenario')).json()) as NativeSnapshot)
    }
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: /Gut/ }).click()
  const failed = await failedSnapshot
  expect(failed.reviews).toBe(1)
  expect(failed.receipts).toHaveLength(1)
  expect(failed.sql_reviews).toHaveLength(0)
  await page.reload()
  await expect(page.locator('.study-session')).toBeVisible()
  await expect
    .poll(async () => {
      const current: NativeSnapshot = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
      return current.sql_reviews.length
    })
    .toBe(1)
  const repaired: NativeSnapshot = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  expect(repaired.reviews).toBe(1)
  expect(repaired.receipts).toHaveLength(1)
  expect(repaired.sql_reviews[0].review_id).toBe(sent[0].review_id)
  expect(repaired.sql_reviews[0].card_id).toBe(failed.sql_cards[0].id)
  expect(repaired.sql_reviews[0].rating).toBe(3)
  expect(new Date(repaired.sql_reviews[0].reviewed_at).getTime()).toBe(failed.revlog[0].id)
})

test('the source and original SQL progress identity survive a changed native note ID', async ({ page }) => {
  const dialog = await openDraft(page)
  const storing = page.waitForResponse(
    (response) => response.url().endsWith('/api/anki/manual-cards') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  const saved: components['schemas']['ManualCardResponse'] = await (await storing).json()
  await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  const moved = await page.request.post(`/api/__test__/study-note-rebind?queue_id=${saved.queue_id}`)
  expect(moved.ok(), await moved.text()).toBeTruthy()
  const binding: { new_note_id: string; sql_card_id: number } = await moved.json()
  await page.goto(`/study/session/${encodeURIComponent(scenario.deck_name)}`)
  await expect(page.getByRole('link', { name: /Quelle öffnen/ })).toHaveAttribute(
    'href',
    `/material/${scenario.version_id}?page=12`,
  )
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  await page.getByRole('button', { name: /Gut/ }).click()
  await expect
    .poll(async () => {
      const current: NativeSnapshot = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
      return current.sql_reviews.length
    })
    .toBe(1)
  const current: NativeSnapshot = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
  expect(current.reviews).toBe(1)
  expect(current.sql_cards[0].id).toBe(binding.sql_card_id)
  expect(current.sql_cards[0].note_id).toBe(binding.new_note_id)
  expect(current.sql_reviews[0].card_id).toBe(binding.sql_card_id)
  expect(new Date(current.sql_reviews[0].reviewed_at).getTime()).toBe(current.revlog[0].id)
})

test('two offline deck windows retain both ratings and replay each UUID once', async ({ page, context }) => {
  const seeded = await page.request.post('/api/__test__/study-deck-scenario')
  expect(seeded.ok(), await seeded.text()).toBeTruthy()
  const decks: { deck_a: { name: string; card_ids: number[] }; deck_b: { name: string; card_ids: number[] } } =
    await seeded.json()
  const second = await context.newPage()
  await page.goto(`/study/session/${encodeURIComponent(decks.deck_a.name)}`)
  await second.goto(`/study/session/${encodeURIComponent(decks.deck_b.name)}`)
  await expect(page.locator('.study-session-card')).toContainText('A-Karte 001')
  await expect(second.locator('.study-session-card')).toContainText('B-Karte 001')
  for (const window of [page, second]) {
    await expect.poll(() => window.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  }
  try {
    await context.setOffline(true)
    await Promise.all([page, second].map((window) => window.getByRole('button', { name: /Antwort zeigen/ }).click()))
    await Promise.all(
      [page, second].map((window) =>
        window.getByRole('button', { name: /Gut/ }).evaluate((button) => (button as HTMLButtonElement).click()),
      ),
    )
    await expect
      .poll(async () => (await pendingNativeReviews(page)).map((review) => review.card_id).sort())
      .toEqual([decks.deck_a.card_ids[0], decks.deck_b.card_ids[0]].sort())
    const beforeReload = await pendingNativeReviews(page)
    expect(new Set(beforeReload.map((review) => review.review_id)).size).toBe(2)
    await Promise.all([page.reload(), second.reload()])
    expect(await pendingNativeReviews(page)).toEqual(beforeReload)
    await context.setOffline(false)
    await expect.poll(async () => (await pendingNativeReviews(page)).length).toBe(0)
    const current: NativeSnapshot = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
    expect(current.reviews).toBe(2)
    expect(current.receipts).toHaveLength(2)
    expect(new Set(current.receipts.map((receipt) => receipt.review_id))).toEqual(
      new Set(beforeReload.map((review) => review.review_id)),
    )
  } finally {
    await context.setOffline(false)
  }
})

test('returning immediately to the learning overview shows the acknowledged topic progress', async ({ page }) => {
  const dialog = await openDraft(page)
  await dialog.getByRole('textbox', { name: 'Thema', exact: true }).fill('Synthetisches Fortschrittsthema')
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  await page.goto('/learning')
  const topic = page
    .locator('.data-row')
    .filter({ has: page.getByText('Synthetisches Fortschrittsthema', { exact: true }) })
  await expect(topic).toContainText('(0 Wiederholungen)')
  await page.locator('.learning-tabs').getByRole('link', { name: 'Karteikarten', exact: true }).click()
  await page.locator(`a[href="/study/session/${encodeURIComponent(scenario.deck_name)}"]`).click()
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  const reviewing = page.waitForResponse(
    (response) => response.url().endsWith('/api/anki/study/reviews') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /Gut/ }).click()
  expect((await reviewing).ok()).toBeTruthy()
  await page.goBack()
  await page.locator('.learning-tabs').getByRole('link', { name: 'Überblick & Übungen', exact: true }).click()
  await expect(topic).toContainText('(1 Wiederholungen)')
  await expect(page.getByText('Gelernt: 1 Anki-Wiederholungen, 0 Übungen.', { exact: true })).toBeVisible()
})

test('a committed receipt repairs progress after the original native card is removed', async ({ page }) => {
  const dialog = await openDraft(page)
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  await page.goto(`/study/session/${encodeURIComponent(scenario.deck_name)}`)
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  expect((await page.request.post('/api/__test__/study-review-fault')).ok()).toBeTruthy()
  const sent: ReviewSent[] = []
  let observed!: (value: NativeSnapshot) => void
  const failedSnapshot = new Promise<NativeSnapshot>((resolve) => {
    observed = resolve
  })
  await page.route('**/api/anki/study/reviews', async (route) => {
    sent.push(route.request().postDataJSON() as ReviewSent)
    const response = await route.fetch()
    if (sent.length === 1) {
      expect(response.status(), await response.text()).toBe(503)
      observed((await (await page.request.get('/api/__test__/study-deck-scenario')).json()) as NativeSnapshot)
    } else {
      expect(response.ok(), await response.text()).toBeTruthy()
      expect(await response.json()).toMatchObject({ already_applied: true, card: null })
    }
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: /Gut/ }).click()
  const failed = await failedSnapshot
  expect(failed.reviews).toBe(1)
  expect(failed.sql_reviews).toHaveLength(0)
  expect(
    (await page.request.post(`/api/__test__/study-native-card-remove?card_id=${sent[0].card_id}`)).ok(),
  ).toBeTruthy()
  await page.reload()
  await expect.poll(async () => (await pendingNativeReviews(page)).length).toBe(0)
  const repaired: NativeSnapshot = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  expect(repaired.cards).toBe(0)
  expect(repaired.receipts).toHaveLength(1)
  expect(repaired.sql_reviews).toHaveLength(1)
  expect(repaired.sql_reviews[0].review_id).toBe(sent[0].review_id)
  expect(repaired.sql_reviews[0].card_id).toBe(failed.sql_cards[0].id)
  expect(new Date(repaired.sql_reviews[0].reviewed_at).getTime()).toBe(failed.revlog[0].id)
})
