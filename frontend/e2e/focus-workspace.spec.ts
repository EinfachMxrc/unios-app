// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import type { components } from '../src/generated/api'
import { expect, test } from './fixtures'

type Scenario = {
  version_id: number; next_version_id: number; course_id: number; block_id: number; cycle_id: number
  exercise_id: number; topic_id: number; note_id: string; foreign_note_id: string; foreign_course_id: number; foreign_version_id: number
  course_name: string; deck_name: string; quote: string
  annotation: components['schemas']['MaterialAnnotationView']
}
let seed: Scenario
const focus = () => `/learning/focus/block/${seed.block_id}`
const source = () => `${focus()}?mode=source&version=${seed.version_id}&page=12`
const scopedStudy = () => `/study?focus=block%3A${seed.block_id}`

async function openSource(page: Page) {
  await page.goto(source())
  await expect(page.locator('[data-material-page="12"] canvas')).toBeVisible()
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await expect(page.locator('[data-material-page="12"] canvas')).toBeInViewport()
}

async function createCard(page: Page) {
  const response = await page.request.post('/api/anki/manual-cards', { data: {
    mutation_id: randomUUID(), front: 'Welche Rolle spielt die Steigung?', back: seed.quote, topic: 'Grenzwerte',
    source: { version_id: seed.version_id, annotation_id: seed.annotation.id,
      expected_revision: seed.annotation.revision, page: 12 },
  } satisfies components['schemas']['ManualCardInput'] })
  expect(response.status(), await response.text()).toBe(201)
  return await response.json() as components['schemas']['ManualCardResponse']
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const response = await page.request.post('/api/__test__/focus-workspace')
  expect(response.ok(), await response.text()).toBeTruthy()
  seed = await response.json()
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('accepted work opens its course and preserves a 120-page source draft across modes', async ({ page }) => {
  await page.goto('/learning')
  await page.locator('.learning-now').getByRole('link', { name: 'Jetzt lernen', exact: true }).click()
  await expect(page).toHaveURL(focus())
  await expect(page.locator('.focus-context')).toContainText(seed.course_name)
  await expect(page.locator('.focus-context')).toContainText('Grenzwerte')
  await expect(page.locator('.focus-context')).toContainText('Gespeicherter Prüfungstermin:')
  await expect(page.locator('.focus-catalog-row')).not.toHaveCount(0)
  await openSource(page)
  await expect(page.getByRole('tab', { name: 'Mitschrift', exact: true })).toHaveAttribute('data-state', 'active')
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.fill('Mein Kerngedanke zu Seite 12 bleibt beim Wechsel erhalten.')
  await expect(page.getByRole('button', { name: 'Kursübungen', exact: true })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => {
    const modes = document.querySelector('.focus-mode-nav')!.getBoundingClientRect()
    const controls = document.querySelector('.focus-material-frame .material-controls')!.getBoundingClientRect()
    return controls.top >= modes.bottom - 1
  })).toBe(true)
  await page.getByRole('button', { name: 'Kursübungen', exact: true }).click()
  await expect(page.locator(`#practice-${seed.exercise_id}`)).toContainText('δ = ε / 3')
  await page.getByRole('button', { name: 'Quelle & Mitschrift', exact: true }).click()
  await expect(body).toHaveValue('Mein Kerngedanke zu Seite 12 bleibt beim Wechsel erhalten.')
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await expect(page.locator('.material-toolbar select')).toHaveValue(String(seed.version_id))
  await expect(page.getByRole('button', { name: 'Kursnotizen', exact: true })).toBeInViewport()
  const saving = page.waitForResponse(response => response.url().endsWith('/api/notes') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  const response = await saving
  expect(response.ok(), await response.text()).toBeTruthy()
  const saved = await response.json()
  const link = page.getByRole('link', { name: 'Notiz öffnen', exact: true })
  await expect(link).toHaveAttribute('href', new RegExp(`/learning/focus/block/${seed.block_id}\\?.*note=${saved.note.id}`))
  await link.click()
  await expect(page.locator('.note-canvas')).toContainText('Mein Kerngedanke zu Seite 12')
  expect((await (await page.request.get(`/api/notes/${saved.note.id}`)).json()).note.course_id).toBe(seed.course_id)
})

test('an older untouched course exercise stays available and keeps its revealed answer', async ({ page }) => {
  await page.goto(`${focus()}?mode=practice`)
  const exercise = page.locator(`#practice-${seed.exercise_id}`)
  await expect(exercise).toContainText('δ = ε / 3')
  await expect(page.locator('.focus-workarea')).not.toContainText('Fremde Programmieraufgabe')
  await exercise.getByRole('button', { name: 'Aufgabe üben', exact: true }).click()
  await exercise.getByRole('textbox', { name: 'Deine Antwort', exact: true }).fill('Der Abstand wird mit drei multipliziert.')
  await exercise.getByRole('button', { name: 'Lösung ansehen', exact: true }).click()
  await page.getByRole('button', { name: 'Kursnotizen', exact: true }).click()
  await expect(page.locator('.focus-catalog-row')).toContainText('Meine Grenzwert-Erklärung')
  await page.getByRole('button', { name: 'Kursübungen', exact: true }).click()
  await expect(exercise.getByRole('textbox', { name: 'Deine Antwort', exact: true })).toHaveValue('Der Abstand wird mit drei multipliziert.')
  await expect(exercise).toContainText('Die Steigung ist 3.')
  // This private answer is RAM-only: an actual reload must warn before it is lost.
  const documentMarker = randomUUID()
  await page.evaluate(marker => { document.documentElement.dataset.unloadProbe = marker }, documentMarker)
  const warning = page.waitForEvent('dialog')
  // Playwright's navigation promise stays pending when beforeunload is dismissed.
  const blockedReload = page.evaluate(() => window.location.reload())
  const dialog = await warning
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await blockedReload
  await expect(page.locator('html')).toHaveAttribute('data-unload-probe', documentMarker)
  await expect(exercise.getByRole('textbox', { name: 'Deine Antwort', exact: true })).toHaveValue('Der Abstand wird mit drei multipliziert.')
  await expect(exercise).toContainText('Die Steigung ist 3.')
  const saving = page.waitForResponse(response => response.url().endsWith(`/api/learning/practice/${seed.exercise_id}/attempt`))
  await exercise.getByRole('button', { name: 'Richtig · speichern', exact: true }).click()
  expect((await saving).ok()).toBeTruthy()
  await expect(page.getByRole('heading', { name: 'Letzte Versuche', exact: true })).toBeVisible()
  const history = await (await page.request.get(`/api/learning/practice/history?course_id=${seed.course_id}`)).json()
  expect(history).toHaveLength(1)
  expect(history[0]).toMatchObject({ course_id: seed.course_id, correct: true, answer: 'Der Abstand wird mit drei multipliziert.' })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Letzte Versuche', exact: true })).toBeVisible()
  await expect(page.locator('.practice-history-item')).toContainText('Der Abstand wird mit drei multipliziert.')
  await expect(exercise.getByRole('button', { name: 'Aufgabe üben', exact: true })).toBeVisible()
  expect(await (await page.request.get(`/api/learning/practice/history?course_id=${seed.course_id}`)).json()).toEqual(history)
  const foreign = await (await page.request.get(`/api/learning/practice/history?course_id=${seed.foreign_course_id}`)).json()
  expect(foreign).toEqual([])
})

test('mobile course exercise keeps its title, question and answer inside a readable full-width panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${focus()}?mode=practice`)
  const exercise = page.locator(`#practice-${seed.exercise_id}`)
  await expect(exercise).toContainText('δ = ε / 3')
  await exercise.getByRole('button', { name: 'Aufgabe üben', exact: true }).click()
  const answer = exercise.getByRole('textbox', { name: 'Deine Antwort', exact: true })
  await answer.fill('Ich wähle δ = ε / 3, damit sich der Abstand bei der Multiplikation mit 3 genau zu ε vergrößert.')
  await expect(answer).toHaveValue(/Ich wähle δ/)
  const bounds = await exercise.evaluate(row => {
    const panel = row.closest<HTMLElement>('[data-slot="card"]')!
    const content = row.closest<HTMLElement>('[data-slot="card-content"]')!
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect()
      return { left: value.left, right: value.right, width: value.width, top: value.top, bottom: value.bottom }
    }
    return { panel: rect(panel), title: rect(panel.querySelector('[data-slot="card-title"]')!),
      intro: rect(content.querySelector('p')!), question: rect(row.querySelector('.assessment-question-document')!),
      answer: rect(row.querySelector('textarea')!), viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth }
  })
  expect(bounds.panel.left).toBeGreaterThanOrEqual(0)
  expect(bounds.panel.right).toBeLessThanOrEqual(bounds.viewport)
  for (const element of [bounds.title, bounds.intro, bounds.question, bounds.answer]) {
    expect(element.left).toBeGreaterThanOrEqual(bounds.panel.left - 1)
    expect(element.right).toBeLessThanOrEqual(bounds.panel.right + 1)
  }
  expect(bounds.question.width).toBeGreaterThanOrEqual(250)
  expect(bounds.answer.width).toBeGreaterThanOrEqual(250)
  expect(bounds.answer.top).toBeGreaterThan(bounds.question.bottom)
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewport)
})

test('course membership guards notes and sources before rendering foreign content', async ({ page }) => {
  await page.goto(`${focus()}?mode=notes&note=${seed.note_id}`)
  await expect(page.locator('.note-canvas')).toContainText('Meine eigene Begründung.')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notizinhalt', exact: true }).fill('# Mein Beweis\n\nIm echten Kursdokument gespeichert.')
  await expect(page.getByRole('status').filter({ hasText: 'Auf dem Hauptgerät gespeichert' })).toBeVisible()
  expect((await (await page.request.get(`/api/notes/${seed.note_id}`)).json()).body).toContain('Im echten Kursdokument gespeichert.')
  await page.goto(`${focus()}?mode=notes&note=${seed.foreign_note_id}`)
  await expect(page.getByRole('alert')).toContainText('Diese Notiz gehört nicht zum Kurs')
  await expect(page.locator('.note-canvas')).toHaveCount(0)
  const fileRequests: string[] = []
  page.on('request', request => { if (/\/files\/\d+\/inline/.test(request.url())) fileRequests.push(request.url()) })
  await page.goto(`${focus()}?mode=source&version=${seed.foreign_version_id}`)
  await expect(page.getByRole('alert')).toContainText('Diese Quelle gehört nicht zum Kurs')
  await expect(page.locator('.material-layout')).toHaveCount(0)
  expect(fileRequests).toEqual([])
})

test('real native course cards retain their source and revealed session after a course rename', async ({ page }) => {
  const saved = await createCard(page)
  const rename = await page.request.post(`/api/__test__/focus-course-rename?course_id=${seed.course_id}`)
  expect(rename.ok()).toBeTruthy()
  await page.goto(scopedStudy())
  await expect(page.locator('.learning-focus-bar')).toContainText('Analysis – aktueller Kursname')
  const deck = page.locator('.study-deck-link').filter({ hasText: saved.deck_name.replace(/^Uni::/, '') })
  await expect(deck).toBeVisible()
  await deck.click()
  await expect(page).toHaveURL(new RegExp(`focus=block%3A${seed.block_id}`))
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  await expect(page.locator('.study-session-answer')).toContainText(seed.quote)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const returnSource = page.getByRole('link', { name: /Quelle öffnen/ })
  await expect(returnSource).toHaveAttribute('href', source())
  await returnSource.click()
  await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
  await page.goBack()
  await expect(page.locator('.study-session-answer')).toContainText(seed.quote)
  const rating = page.waitForResponse(response => response.url().endsWith('/api/anki/study/reviews') && response.request().method() === 'POST')
  await page.getByRole('button', { name: /Gut/ }).click()
  expect((await rating).ok()).toBeTruthy()
  const native = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
  expect(native.reviews).toBe(1)
  expect(native.receipts).toHaveLength(1)
})

test('an online-opened focused card session resumes after an offline reload', async ({ page, context }) => {
  const saved = await createCard(page)
  await page.goto(`/study/session/${encodeURIComponent(saved.deck_name)}?focus=block%3A${seed.block_id}`)
  await page.getByRole('button', { name: /Antwort zeigen/ }).click()
  await expect(page.locator('.study-session-answer')).toContainText(seed.quote)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect.poll(() => page.evaluate(() => new Promise<boolean>(resolve => {
    const request = indexedDB.open('marc-uni-os-read-cache')
    request.onerror = () => resolve(false)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('queries').objectStore('queries').get('read-queries-v1')
      read.onsuccess = () => { db.close(); resolve(read.result?.clientState.queries.some((query: { queryKey: unknown[] }) =>
        String(query.queryKey[1]).startsWith('/api/learning/focus/block/')) ?? false) }
      read.onerror = () => { db.close(); resolve(false) }
    }
  }))).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.locator('.learning-focus-bar')).toContainText(seed.course_name)
    await expect(page.locator('.study-session-card')).toContainText('Welche Rolle spielt die Steigung?')
    await page.getByRole('button', { name: /Antwort zeigen/ }).click()
    await expect(page.locator('.study-session-answer')).toContainText(seed.quote)
    await expect(page.getByRole('button', { name: /Gut/ })).toBeVisible()
  } finally { await context.setOffline(false) }
})

test('mobile cycle context remains usable and an invalid focus never opens global cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/learning/focus/cycle/${seed.cycle_id}?mode=practice`)
  await expect(page.locator('.focus-context')).toContainText('Anwenden und üben')
  await expect(page.locator(`#practice-${seed.exercise_id}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kursnotizen', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.goto('/study?focus=block%3A0')
  await expect(page.getByRole('alert')).toContainText('Dieser Lernauftrag ist nicht verfügbar')
  await expect(page.locator('.study-deck-link')).toHaveCount(0)
  await page.goto(`/study/session/${encodeURIComponent('Fremder Stapel')}?focus=block%3A${seed.block_id}`)
  await expect(page.getByRole('alert')).toContainText('Dieser Stapel gehört nicht zum gewählten Lernauftrag')
  await expect(page.locator('.study-session-card')).toHaveCount(0)
})
