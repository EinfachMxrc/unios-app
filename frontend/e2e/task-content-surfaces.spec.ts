// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import type { Assignment, CourseDetail, PracticeItem } from '../src/types'
import { expect, test } from './fixtures'

const qaDirectory = path.resolve(import.meta.dirname, '../../docs/qa/task-presentation-20261010')
const taskText =
  '# Synthetische Aufgabe\n\nPrüfe $x^2+1$ und `values`.\n\n' +
  '```java\nint[] a = {1,4,7};\nint s = 0;\n```\n\n' +
  '- Initialisierung lesen\n- Bedingung prüfen\n\n' +
  '| A | B |\n| --- | --- |\n| 0 | 1 |\n| 1 | 0 |'
const sample =
  '## Erst nach dem Aufdecken\n\nDas Ergebnis ist $x=1$.\n\n' +
  '```python\nreturn values[::-1]\n```\n\n- Ergebnis vergleichen\n- Randfall prüfen'

async function enableProposals(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('unios-ui-preferences-v1', JSON.stringify({ modules: { ai: true }, language: 'de' }))
  })
}

async function fit(page: Page) {
  const viewport = page.viewportSize()!
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
}

async function formatted(surface: Locator) {
  await expect(surface.locator('.assessment-code-block').first()).toBeVisible()
  await expect(surface.locator('.katex').first()).toBeVisible()
  await expect(surface.locator('.assessment-document-list').first()).toBeVisible()
  await expect(surface.getByRole('table')).toHaveCount(1)
  await expect(surface.getByRole('columnheader', { name: 'A', exact: true })).toBeVisible()
  await expect(surface.locator('.assessment-code-block code').first()).toContainText('int[] a')
}

async function image(page: Page, info: TestInfo, name: string) {
  await mkdir(qaDirectory, { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  const destination = path.join(qaDirectory, `${name}-${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath(destination), fullPage: true, animations: 'disabled' })
  await info.attach(name, { path: screenshotPath(destination), contentType: 'image/png' })
}

test('Übung zeigt strukturierte Inhalte, hält die Lösung verborgen und sendet den Originalwert der Radioauswahl', async ({
  page,
}, info) => {
  const item: PracticeItem = {
    id: 9901,
    exercise_id: null,
    course_id: 1,
    course_name: 'Fiktiver Darstellungskurs',
    resource_id: 9902,
    resource_name: 'Synthetische Quelle.pdf',
    question: taskText,
    topic: 'Darstellung prüfen',
    difficulty: 'easy',
    sample_solution: sample,
    solution_steps: '1. Bedingung $x=0$ prüfen\n2. `values` umdrehen',
    source_page: 12,
    choices: ['`LIFO`', '`FIFO`'],
    correct_choice: 0,
    attempt_count: 0,
    last_correct: null,
  }
  const writes: Record<string, unknown>[] = []
  await page.route(/\/api\/learning\/practice(?:\?.*)?$/, (route) => route.fulfill({ json: [item] }))
  await page.route(/\/api\/learning\/practice\/history(?:\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.route('**/api/learning/practice/9901/attempt', async (route) => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ json: { id: 9903, correct: true } })
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/learning?practice=all')
  const row = page.locator('#practice-9901')
  await formatted(row)
  await expect(row.getByText('Erst nach dem Aufdecken', { exact: true })).toHaveCount(0)
  await expect(row.locator('.assessment-code-block')).toHaveCount(1)
  await row.getByRole('button', { name: 'Aufgabe üben', exact: true }).click()
  const choice = row.getByRole('radio', { name: 'LIFO', exact: true })
  await expect(choice).toHaveAttribute('value', '`LIFO`')
  await choice.check()
  await expect(row.getByText('Erst nach dem Aufdecken', { exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: 'Lösung ansehen', exact: true }).click()
  await expect(row.getByRole('heading', { name: 'Erst nach dem Aufdecken', exact: true })).toBeVisible()
  await expect(row.locator('[data-language="python"] code')).toHaveText('return values[::-1]')
  for (const view of [
    { width: 1280, theme: 'light', font: '100%' },
    { width: 1280, theme: 'dark', font: '150%' },
    { width: 390, theme: 'light', font: '100%' },
    { width: 390, theme: 'dark', font: '150%' },
  ]) {
    await page.setViewportSize({ width: view.width, height: view.width === 390 ? 844 : 720 })
    await page.evaluate(({ theme, font }) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.style.fontSize = font
    }, view)
    await formatted(row)
    await fit(page)
    if (view.width === 1280 && view.theme === 'light') await image(page, info, 'task-practice-light-1280-720')
  }
  await row.getByRole('button', { name: 'Ergebnis speichern', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({ answer: '`LIFO`', correct: true })
})

test('Vorschlagseditor bleibt auf 390 px untereinander, die Vorschau verändert den Quelltext nicht', async ({
  page,
}, info) => {
  await enableProposals(page)
  let question = taskText
  const writes: Record<string, unknown>[] = []
  const proposal = () => ({
    id: 9911,
    resource_id: 9912,
    resource_name: 'Synthetischer Vorschlag.pdf',
    course_id: 1,
    course_name: 'Fiktiver Darstellungskurs',
    status: 'proposed',
    exercise: {
      question,
      topic: 'Darstellung prüfen',
      difficulty: 'easy',
      sample_solution: sample,
      solution_steps: '1. Formel prüfen\n2. Ergebnis vergleichen',
      source_page: 4,
      choices: ['`LIFO`', '`FIFO`'],
      correct_choice: 0,
    },
  })
  await page.route(/\/api\/ai\/exercises(?:\?.*)?$/, (route) => route.fulfill({ json: [proposal()] }))
  await page.route('**/api/ai/exercises/9911', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    writes.push(body)
    question = String(body.question)
    await route.fulfill({ json: proposal() })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/exercises')
  const row = page.locator('#exercise-9911')
  await formatted(row)
  await row.getByRole('button', { name: 'Vorschlag öffnen', exact: true }).click()
  const field = row.getByRole('textbox', { name: 'Aufgabe', exact: true })
  await expect(field).toHaveValue(taskText)
  expect(await row.evaluate((node) => getComputedStyle(node).display)).toBe('block')
  await row.locator('.exercise-proposal-preview > summary').click()
  await formatted(row.locator('.exercise-proposal-preview'))
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
      document.documentElement.style.fontSize = '150%'
    }, theme)
    const rowBox = await row.boundingBox()
    const fieldBox = await field.boundingBox()
    expect(fieldBox!.width).toBeGreaterThan(rowBox!.width * 0.75)
    await expect(field).toBeEditable()
    await fit(page)
    const title = page.getByRole('heading', { name: 'Übungsaufgaben', exact: true })
    expect(
      await title.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getClientRects().length
      }),
    ).toBe(1)
    if (theme === 'dark') await image(page, info, 'task-proposal-dark-390-font150')
  }
  const edited = `${taskText}\n\nZusätzlicher Ausdruck $n+1$.`
  await field.fill(edited)
  await expect(row.locator('.exercise-proposal-preview')).toContainText('Zusätzlicher Ausdruck')
  await row.getByRole('button', { name: 'Änderungen speichern', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].question).toBe(edited)
  await expect(field).toHaveValue(edited)
})

test('Kursaufgabe und Fristklärung zeigen dieselbe formatierte Beschreibung mit erreichbaren langen Titeln', async ({
  page,
}) => {
  const assignment: Assignment = {
    id: 9921,
    course_id: 1,
    title: `Darstellungsaufgabe_${'A'.repeat(150)}`,
    description: taskText,
    due_at: null,
    due_note: '',
    due_origin: 'unknown',
    delivery: 'in_person',
    removed_upstream: false,
    url: null,
  }
  const course: CourseDetail = {
    course: {
      id: 1,
      name: 'Fiktiver Darstellungskurs',
      source: 'moodle',
      source_id: 'synthetic-1',
      short_name: null,
      semester_id: null,
      is_active: true,
      download_other_groups: false,
    },
    assignments: [assignment],
    resources: [],
    announcements: [],
    sections: [],
    semesters: [],
    group_assignments: [],
    versions: {},
  }
  await page.route(/\/api\/courses\/1(?:\?.*)?$/, (route) => route.fulfill({ json: course }))
  await page.route('**/api/assignments/unresolved', (route) => route.fulfill({ json: [assignment] }))
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/courses/1#assignment-9921')
  const drawer = page.getByRole('dialog', { name: 'Schnellansicht', exact: true })
  await expect(drawer).toBeVisible()
  await formatted(drawer.locator('.course-assignment-body'))
  await expect(drawer.getByRole('heading', { name: assignment.title, exact: true })).toHaveText(assignment.title)
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
      document.documentElement.style.fontSize = '150%'
    }, theme)
    await fit(page)
    expect(await drawer.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(390)
    await expect(drawer.getByRole('button', { name: 'Schnellansicht schließen', exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  const unresolved = page
    .locator('.data-row')
    .filter({ has: page.getByRole('link', { name: assignment.title, exact: true }) })
  await unresolved.locator('details > summary').filter({ hasText: 'Aufgabentext' }).click()
  await formatted(unresolved)
  await fit(page)
})
