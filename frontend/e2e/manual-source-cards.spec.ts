// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import type { components } from '../src/generated/api'
import { expect, test } from './fixtures'

type SourceScenario = {
  version_id: number; next_version_id: number; resource_id: number; course_id: number
  deck_name: string; quote: string; page: number
  annotation: components['schemas']['MaterialAnnotationView']
}
type Saved = components['schemas']['ManualCardResponse']
type Sent = components['schemas']['ManualCardInput']
let scenario: SourceScenario

async function captureReadyUi(page: Page, target: Locator, filename: string) {
  // Fast-forwarding Radix presence animations can close a portal during capture.
  // Wait for the real UI to settle without changing its animation lifecycle.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity,
  ).length)).toBe(0)
  await expect(target).toBeVisible()
  await page.screenshot({ path: screenshotPath(path.resolve('..', `docs/qa/manual-source-cards-20261007/${filename}`)) })
  await expect(target).toBeVisible()
}

async function openAnnotations(page: Page) {
  await expect(page.locator('[data-material-page="12"] canvas')).toBeVisible()
  if (!await page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true }).isVisible()) {
    await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  }
}

async function openDraft(page: Page) {
  await page.goto(`/material/${scenario.version_id}?page=12`)
  await openAnnotations(page)
  await page.getByRole('button', { name: 'Als Lernkarte', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Eigene Lernkarte', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Eigene Frage', exact: true })).toBeEnabled()
  return dialog
}

async function reanchor(page: Page) {
  const response = await page.request.get(`/api/material/${scenario.next_version_id}`)
  expect(response.ok()).toBeTruthy()
  const viewed: components['schemas']['MaterialView'] = await response.json()
  const annotation = viewed.annotations.find(item => item.id === scenario.annotation.id)!
  expect(annotation.anchor.page).toBe(17)
  const moved = await page.request.post(`/api/material/${scenario.next_version_id}/annotations/${annotation.id}/reanchor`, {
    data: { expected_revision: annotation.revision, quote: annotation.quote, page: 17, rects: annotation.anchor.rects },
  })
  expect(moved.ok(), await moved.text()).toBeTruthy()
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const response = await page.request.post('/api/__test__/manual-card-scenario')
  expect(response.ok(), await response.text()).toBeTruthy()
  scenario = await response.json()
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('own PDF source card survives reanchor and supports a complete native review', async ({ page }) => {
  const dialog = await openDraft(page)
  await expect(dialog.getByRole('textbox', { name: 'Eigene Antwort', exact: true })).toHaveValue(scenario.quote)
  await expect(dialog).toContainText('Version 1')
  await expect(dialog).toContainText('Seite 12')
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {
      localStorage.setItem('unios-theme', theme)
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await expect(dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true })).toBeEnabled()
      await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.manual-card-dialog'))).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await captureReadyUi(page, dialog, `dialog-${theme}-${width}.png`)
    }
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  const sourceAction = page.getByRole('button', { name: 'Als Lernkarte', exact: true })
  await expect(sourceAction).toBeFocused()
  await sourceAction.press('Enter')
  await expect(dialog).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  const storing = page.waitForResponse(response => response.url().endsWith('/api/anki/manual-cards') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  const response = await storing
  expect(response.status(), await response.text()).toBe(201)
  const saved: Saved = await response.json()
  await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  expect(saved.source.version_id).toBe(scenario.version_id)
  expect(saved.source.page).toBe(12)
  expect(saved.card.confidence).toBeNull()
  await reanchor(page)
  await page.goto(`/study/session/${encodeURIComponent(saved.deck_name)}`)
  await expect(page.locator('.study-session-card')).toContainText('Wie bleiben Begriffe')
  const source = page.getByRole('link', { name: /Quelle öffnen/ })
  await expect(source).toHaveAttribute('href', `/material/${scenario.version_id}?page=12`)
  await source.click()
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await page.goto(`/study/session/${encodeURIComponent(saved.deck_name)}`)
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  await expect(page.locator('.study-session-answer')).toContainText(scenario.quote)
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {
      localStorage.setItem('unios-theme', theme)
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await expect(source).toBeVisible()
      await expect(page.getByRole('button', { name: /Gut/ })).toBeEnabled()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await captureReadyUi(page, page.locator('.study-session-answer'), `session-${theme}-${width}.png`)
    }
  }
  const reviewing = page.waitForResponse(response => response.url().endsWith('/api/anki/study/reviews') && response.request().method() === 'POST')
  await page.getByRole('button', { name: /Gut/ }).click()
  expect((await reviewing).ok()).toBeTruthy()
  const native = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
  expect(native.cards).toBe(1)
  expect(native.reviews).toBe(1)
  expect(native.receipts).toHaveLength(1)
  await page.reload()
  await expect(page.locator('.study-session')).toBeVisible()
  expect((await (await page.request.get('/api/__test__/study-deck-scenario')).json()).reviews).toBe(1)
})

test('lost save response replays the frozen request after reload and annotation change', async ({ page }) => {
  let stored: Saved | undefined
  const sent: Sent[] = []
  let loseFirst = true
  await page.route('**/api/anki/manual-cards', async route => {
    sent.push(route.request().postDataJSON() as Sent)
    const response = await route.fetch()
    if (loseFirst) {
      loseFirst = false
      expect(response.status()).toBe(201)
      stored = await response.json()
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Synthetisch verlorene Bestätigung' }) })
    } else await route.fulfill({ response })
  })
  const dialog = await openDraft(page)
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Identischen Request erneut senden', exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Eigene Frage', exact: true })).toBeDisabled()
  await reanchor(page)
  await page.reload()
  await openAnnotations(page)
  await page.getByRole('button', { name: 'Als Lernkarte', exact: true }).click()
  const recovered = page.getByRole('dialog', { name: 'Eigene Lernkarte', exact: true })
  await recovered.getByRole('button', { name: 'Identischen Request erneut senden', exact: true }).click()
  await expect(recovered).toContainText('Gespeichert und in Anki übernommen')
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  const queue: components['schemas']['QueueItem'][] = await (await page.request.get('/api/anki/queue')).json()
  expect(queue).toHaveLength(1)
  expect(queue[0].id).toBe(stored!.queue_id)
  expect((await (await page.request.get('/api/__test__/study-deck-scenario')).json()).cards).toBe(1)
})

test('offline own draft survives reload and remains visibly pending in external mode', async ({ page, context }) => {
  const response = await page.request.post('/api/__test__/manual-card-scenario?mode=external')
  expect(response.ok()).toBeTruthy()
  scenario = await response.json()
  const dialog = await openDraft(page)
  await context.setOffline(true)
  await dialog.getByRole('textbox', { name: 'Eigene Frage', exact: true }).fill('Meine offline formulierte Frage')
  await expect(dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true })).toBeDisabled()
  await expect(dialog).toContainText('Entwurf auf diesem Gerät gespeichert.')
  await context.setOffline(false)
  await page.reload()
  await openAnnotations(page)
  await page.getByRole('button', { name: 'Als Lernkarte', exact: true }).click()
  const recovered = page.getByRole('dialog', { name: 'Eigene Lernkarte', exact: true })
  await expect(recovered.getByRole('textbox', { name: 'Eigene Frage', exact: true })).toHaveValue('Meine offline formulierte Frage')
  await recovered.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(recovered).toContainText('Gespeichert, Übernahme ausstehend')
  await expect(recovered.getByRole('link', { name: 'Gespeicherte Karte öffnen', exact: true })).toHaveAttribute('href', /\/study\/cards#card-\d+$/)
  await recovered.getByRole('link', { name: 'Gespeicherte Karte öffnen', exact: true }).click()
  await expect(page).toHaveURL(/\/study\/cards#card-\d+$/)
  await expect(page.getByRole('heading', { name: 'Eigene Lernkarten', exact: true })).toBeVisible()
  const queueCard = page.locator('article[id^="card-"]')
  await expect(queueCard).toContainText('Meine offline formulierte Frage')
  await expect(queueCard).toContainText('Eigene Karte')
  await expect(page.getByRole('heading', { name: 'Vorschläge importieren', exact: true })).toHaveCount(0)
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {
      localStorage.setItem('unios-theme', theme)
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await expect(queueCard).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await captureReadyUi(page, queueCard, `cards-${theme}-${width}.png`)
    }
  }
})

test('a rejected stale source preserves own text and requires explicit source recheck', async ({ page }) => {
  const sent: Sent[] = []
  page.on('request', request => {
    if (request.url().endsWith('/api/anki/manual-cards') && request.method() === 'POST') sent.push(request.postDataJSON() as Sent)
  })
  const dialog = await openDraft(page)
  await dialog.getByRole('textbox', { name: 'Eigene Frage', exact: true }).fill('Meine bewusste Frage')
  await dialog.getByRole('textbox', { name: 'Eigene Antwort', exact: true }).fill('Meine selbst geschriebene Antwort')
  const update = await page.request.patch(`/api/material/annotations/${scenario.annotation.id}`, {
    data: { expected_revision: 1, comment: 'Extern korrigierter Kommentar', resolved: false },
  })
  expect(update.ok()).toBeTruthy()
  const rejecting = page.waitForResponse(response => response.url().endsWith('/api/anki/manual-cards') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  const rejected = await rejecting
  expect(rejected.status()).toBe(409)
  expect((await rejected.json()).code).toBe('MANUAL_SOURCE_CHANGED')
  expect(await (await page.request.get('/api/anki/queue')).json()).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Quelle erneut prüfen', exact: true }).click()
  await dialog.getByRole('button', { name: 'Geprüfte Quelle übernehmen', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Eigene Frage', exact: true })).toHaveValue('Meine bewusste Frage')
  await expect(dialog.getByRole('textbox', { name: 'Eigene Antwort', exact: true })).toHaveValue('Meine selbst geschriebene Antwort')
  await dialog.getByRole('button', { name: 'Speichern & freigeben', exact: true }).click()
  await expect(dialog).toContainText('Gespeichert und in Anki übernommen')
  expect(sent).toHaveLength(2)
  expect(sent[1].mutation_id).not.toBe(sent[0].mutation_id)
  expect(sent[1].front).toBe(sent[0].front)
  expect(sent[1].back).toBe(sent[0].back)
  expect(sent[1].source.expected_revision).toBe(2)
  expect(await (await page.request.get('/api/anki/queue')).json()).toHaveLength(1)
})
