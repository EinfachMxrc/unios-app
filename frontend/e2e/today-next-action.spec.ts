// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import type { Overview } from '../src/types'
import { expect, test } from './fixtures'

const noCards = async (page: Page) =>
  page.route('**/api/anki/study/status', (route) => route.fulfill({ json: { mode: 'external', due: 0, cards: 0 } }))
const noExercises = async (page: Page) =>
  page.route('**/api/learning/weekly', (route) =>
    route.fulfill({ json: { reviews_this_week: 0, attempts_this_week: 0, open_exercises: 0, weak_topics: [] } }),
  )
const overview = async (page: Page): Promise<Overview> => {
  const response = await page.request.get('/api/overview')
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}
const onlyDeadlines = async (page: Page, deadlines: Overview['deadlines']) => {
  const data = await overview(page)
  await page.route('**/api/overview', (route) => route.fulfill({ json: { ...data, deadlines } }))
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
})

test('Today resumes the exact saved note and source before other available work', async ({ page }) => {
  const response = await page.request.post('/api/__test__/focus-workspace')
  expect(response.ok(), await response.text()).toBeTruthy()
  const seed = await response.json()
  await page.addInitScript((value) => localStorage.setItem('unios-last-study-v1', JSON.stringify(value)), {
    reference: { kind: 'block', id: seed.block_id },
    options: { mode: 'notes', version: seed.version_id, page: 12, note: seed.note_id },
    title: 'Meine Grenzwert-Erklärung weiterbearbeiten',
  })
  await page.route('**/api/anki/study/status', (route) =>
    route.fulfill({ json: { mode: 'integrated', due: 5, cards: 5 } }),
  )
  await page.goto('/')
  const cue = page.locator('.today-learning-cue')
  await expect(cue).toHaveAttribute('data-learning-action', 'resume')
  await expect(cue).toContainText('Meine Grenzwert-Erklärung weiterbearbeiten')
  await expect(cue).toContainText('Deine letzte Lernsitzung: Quelle, Seite und Mitschrift stehen wieder bereit.')
  const action = page.getByRole('link', { name: 'Hier weitermachen', exact: true })
  await expect(action).toHaveAttribute(
    'href',
    `/learning/focus/block/${seed.block_id}?mode=notes&version=${seed.version_id}&note=${seed.note_id}&page=12`,
  )
  await action.click()
  await expect(page.locator('.note-canvas')).toContainText('Meine eigene Begründung.')
  await expect(page.locator('.focus-context')).toContainText(seed.course_name)
})

test('Today opens real integrated daily cards with a matching explanation', async ({ page }) => {
  const response = await page.request.post('/api/__test__/manual-card-scenario')
  expect(response.ok(), await response.text()).toBeTruthy()
  const seed = await response.json()
  const created = await page.request.post('/api/anki/manual-cards', {
    data: {
      mutation_id: randomUUID(),
      front: 'Was verbindet die Begriffe?',
      back: seed.quote,
      topic: 'Begriffe',
      source: {
        version_id: seed.version_id,
        annotation_id: seed.annotation.id,
        expected_revision: seed.annotation.revision,
        page: 12,
      },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const status = await (await page.request.get('/api/anki/study/status')).json()
  expect(status.due).toBe(1)
  await page.goto('/')
  const cue = page.locator('.today-learning-cue')
  await expect(cue).toHaveAttribute('data-learning-action', 'cards')
  await expect(cue).toContainText('1 Karte heute zum Lernen geplant')
  await expect(cue).toContainText('Ankis Tagesplanung mit neuen Karten und Lernschritten')
  await page.getByRole('link', { name: 'Karten lernen', exact: true }).click()
  await expect(page).toHaveURL('/study')
  await expect(page.getByRole('heading', { name: 'Deine Kartenstapel', exact: true })).toBeVisible()
  await expect(page.locator('.study-deck-link').filter({ hasText: seed.deck_name.replace(/^Uni::/, '') })).toBeVisible()
})

test('Today opens the selected assignment in its course and keeps the recommendation readable', async ({ page }) => {
  await noCards(page)
  await noExercises(page)
  const seeded = await page.request.post('/api/__test__/upcoming-assignment')
  expect(seeded.ok(), await seeded.text()).toBeTruthy()
  const data = await overview(page)
  const assignment = data.deadlines.find((item) => item.course_id && item.assignment_id)!
  expect(assignment).toBeTruthy()
  await onlyDeadlines(page, [assignment])
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const cue = page.locator('.today-learning-cue')
      await expect(cue).toHaveAttribute('data-learning-action', 'deadline')
      await expect(cue).toContainText(assignment.title)
      await expect(cue).toContainText(data.courses[assignment.course_id!])
      await expect(cue).toContainText('Nächste gespeicherte Frist:')
      const action = page.getByRole('link', { name: 'Aufgabe öffnen', exact: true })
      await expect(action).toHaveAttribute(
        'href',
        `/courses/${assignment.course_id}#assignment-${assignment.assignment_id}`,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(action).toBeInViewport()
      await page.screenshot({
        path: screenshotPath(`../docs/qa/comparison-improvements-20261014/today-${theme}-${width}.png`),
        fullPage: true,
      })
    }
  }
  await page.getByRole('link', { name: 'Aufgabe öffnen', exact: true }).click()
  await expect(page).toHaveURL(`/courses/${assignment.course_id}#assignment-${assignment.assignment_id}`)
  await expect(page.locator('.course-assignment-detail')).toContainText(assignment.title)
})

test('a standalone deadline opens its actual quick view without inventing a course task', async ({ page }) => {
  const created = await page.request.post('/api/__test__/budget-deadline')
  expect(created.ok()).toBeTruthy()
  const id = (await created.json()).id
  const data = await overview(page)
  const deadline = data.deadlines.find((item) => item.id === id)!
  expect(deadline).toBeTruthy()
  expect(deadline.assignment_id).toBeNull()
  await onlyDeadlines(page, [deadline])
  await noCards(page)
  await noExercises(page)
  await page.goto('/')
  const action = page.getByRole('button', { name: 'Frist ansehen', exact: true })
  await expect(action).toBeVisible()
  await action.click()
  const quickView = page.getByRole('dialog', { name: 'Schnellansicht', exact: true })
  await expect(quickView).toContainText('Planbare Übung')
  await expect(page).toHaveURL('/')
  await page.keyboard.press('Escape')
  await expect(quickView).toHaveCount(0)
  await expect(action).toBeFocused()
})

test('open exercises lead directly to available course practice and unknown topic ranking stays out of Today', async ({
  page,
}) => {
  const response = await page.request.post('/api/__test__/focus-workspace')
  expect(response.ok()).toBeTruthy()
  const seed = await response.json()
  await onlyDeadlines(page, [])
  await noCards(page)
  await page.goto('/')
  const cue = page.locator('.today-learning-cue')
  await expect(cue).toHaveAttribute('data-learning-action', 'practice')
  await expect(cue).toContainText('Übungen ohne gespeicherten Versuch')
  await expect(cue).not.toContainText('Thema mit dem größten Lernbedarf')
  await page.getByRole('link', { name: 'Übung auswählen', exact: true }).click()
  await expect(page).toHaveURL('/learning?practice=all#learning-practice')
  await expect(page.locator(`#practice-${seed.exercise_id}`)).toBeVisible()
})

test('empty and disabled learning do not pretend a saved next action exists', async ({ page }) => {
  await onlyDeadlines(page, [])
  await noCards(page)
  await noExercises(page)
  await page.goto('/')
  await expect(page.locator('.today-learning-cue')).toHaveAttribute('data-learning-action', 'choose')
  await expect(page.getByRole('link', { name: 'Weiterlernen', exact: true })).toHaveAttribute('href', '/learning')
  await page.addInitScript(() =>
    localStorage.setItem(
      'unios-ui-preferences-v1',
      JSON.stringify({
        modules: { courses: false },
      }),
    ),
  )
  await page.reload()
  await expect(page.locator('.today-learning-cue')).toHaveCount(0)
  await expect(page.locator('.today-primary-action')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Schnelle Notiz', exact: true })).toBeVisible()
})
