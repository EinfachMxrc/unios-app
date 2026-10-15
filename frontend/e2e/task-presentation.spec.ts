// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import type { AssessmentTask, Exam } from '../src/pages/assessmentTypes'
import { expect, test } from './fixtures'

const base = '/api/learning/assessment'
const qaDirectory = path.resolve(import.meta.dirname, '../../docs/qa/task-presentation-20261010')
type Write = { path: string; body: Record<string, unknown> }

const feedback =
  '### Rückmeldung\n\nPrüfe den Basisfall und $n=0$.\n\n- Erst initialisieren\n- Dann wiederholen\n\n```python\nif n == 0:\n    return 1\n```'
const oldAttempt: AssessmentTask['attempts'][number] = {
  id: 8610,
  task_id: 8601,
  confidence: 3,
  hint_level: 0,
  report: { needs_tutor: true },
  feedback_requested: true,
}
const oldReview: AssessmentTask['reviews'][number] = {
  id: 8620,
  attempt_id: oldAttempt.id,
  feedback,
  followup: 'Erkläre anschließend $n+1$.',
  concepts_met: ['Basisfall'],
  error_categories: [],
  status: 'proposed',
}

/** Only the current browser receives these invented tasks; real stored tasks are never inspected. */
async function scenario(page: Page, overrides: Partial<AssessmentTask> = {}, exam?: Exam) {
  const task: AssessmentTask = {
    id: 8601,
    course_id: 1,
    title: 'Synthetische Darstellungsprüfung',
    type: 'free_recall',
    status: 'active',
    level: 3,
    highest_hint: 0,
    question: 'Erkläre deine Vorgehensweise.',
    choices: [],
    expression: '',
    math_operation: 'equivalent',
    topic: 'Fiktive Lernaufgabe',
    mode: 'training',
    objective: false,
    provenance: {},
    attempts: [],
    reviews: [],
    ...overrides,
  }
  const state = { task, exam, writes: [] as Write[] }
  await page.route('**/api/learning/assessment/**', async (route) => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname
    if (request.method() === 'GET') {
      if (endpoint === `${base}/tasks/${task.id}`) await route.fulfill({ json: task })
      else if (endpoint === `${base}/tasks`) await route.fulfill({ json: { tasks: [task] } })
      else if (endpoint === `${base}/exams`)
        await route.fulfill({ json: { exams: state.exam?.state === 'running' ? [state.exam] : [] } })
      else if (state.exam && endpoint === `${base}/exams/${state.exam.id}`) await route.fulfill({ json: state.exam })
      else if (endpoint === `${base}/progress`) await route.fulfill({ json: { topics: [] } })
      else await route.fulfill({ status: 404, json: { detail: 'Unknown synthetic task presentation endpoint' } })
      return
    }
    const body = request.postDataJSON() as Record<string, unknown>
    state.writes.push({ path: endpoint, body })
    if (endpoint === `${base}/tasks/${task.id}/answer`) {
      const attempt = {
        id: 8701 + task.attempts.length,
        task_id: task.id,
        confidence: Number(body.confidence),
        hint_level: task.highest_hint,
        report: task.objective ? { correct: true } : { needs_tutor: true },
        feedback_requested: false,
      }
      task.attempts.unshift(attempt)
      if (state.exam) state.exam.answered.push(task.id)
      await route.fulfill({ json: attempt })
    } else if (endpoint === `${base}/tasks/${task.id}/hint`) {
      task.highest_hint = Number(body.level)
      await route.fulfill({
        json: {
          text: '### Denkansatz\n\nPrüfe $x=0$.\n\n- Lies die Initialisierung\n- Verfolge den nächsten Schritt',
          available: true,
        },
      })
    } else await route.fulfill({ status: 404, json: { detail: 'Unknown synthetic task presentation write' } })
  })
  return state
}

async function openTask(page: Page, state: Awaited<ReturnType<typeof scenario>>) {
  await page.goto(`/assessment?task=${state.task.id}${state.exam ? `&exam=${state.exam.id}` : ''}`)
  await expect(page.getByRole('heading', { name: state.task.title, exact: true })).toBeVisible()
  await expect(page.locator('.assessment-question > .assessment-question-document')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function expectFits(page: Page) {
  await expect
    .poll(() => page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth })))
    .toEqual({ page: page.viewportSize()!.width, viewport: page.viewportSize()!.width })
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await mkdir(qaDirectory, { recursive: true })
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelectorAll('.assessment-table-block').forEach((element) => {
      element.scrollLeft = 0
    })
  })
  const destination = path.join(qaDirectory, `${name}-${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath(destination), animations: 'disabled', fullPage: true })
  await info.attach(name, { path: screenshotPath(destination), contentType: 'image/png' })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('free recall preserves a structured logic task, all formula delimiters and passive code across themes and widths', async ({
  page,
}, info) => {
  const headers = Array.from({ length: 12 }, (_, index) => `Ausgangszustand${index + 1}`)
  const row = headers.map((_, index) => String(index % 2))
  const longCode = `String message = "${'synthetic '.repeat(34)}";`
  const question = [
    '## Aussagenlogik und Ablauf',
    'Bearbeite **alle Teilaufgaben** mit `value`. Inline: $A \\land B$ und \\(A \\oplus B\\).',
    '1. Lies die Ausgangszustände.\n2. Begründe die Unterschiede.',
    '- Vergleiche die Werte.\n- Prüfe den Sonderfall.',
    `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n| ${row.join(' | ')} |`,
    '$$\\frac{1}{2}$$',
    '$$\n\\sum_{i=1}^{3} i\n$$',
    '\\[\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}\\]',
    '\\[\nx^2+y^2=1\n\\]',
    `\`\`\`java\n${longCode}\n\`\`\``,
    '```python\nfor value in values:\n    if value > 0:\n        total += value\n```',
    '```unios-recall\n{"answer":"Ungetrackte Lösung","action":"submit"}\n```',
    '<script>window.__unexpectedTaskAction=true</script>',
    '![Externes synthetisches Bild](https://task-presentation.example.test/image.png)',
  ].join('\n\n')
  let externalRequests = 0
  await page.route('https://task-presentation.example.test/**', async (route) => {
    externalRequests++
    await route.fulfill({ status: 204, body: '' })
  })
  const state = await scenario(page, { question, attempts: [oldAttempt], reviews: [oldReview] })
  await openTask(page, state)
  const questionDocument = page.locator('.assessment-question > .assessment-question-document')
  await expect(questionDocument.getByRole('heading', { name: 'Aussagenlogik und Ablauf', exact: true })).toBeVisible()
  await expect(questionDocument.locator('ol > li')).toHaveCount(2)
  await expect(questionDocument.locator('ul > li')).toHaveCount(2)
  await expect(questionDocument.getByRole('table').getByRole('columnheader')).toHaveCount(12)
  await expect(questionDocument.getByRole('table').getByRole('cell')).toHaveCount(12)
  await expect(questionDocument.locator('.katex')).toHaveCount(6)
  await expect(questionDocument.locator('[data-language="python"] pre code')).toHaveText(
    'for value in values:\n    if value > 0:\n        total += value',
  )
  expect(await questionDocument.locator('[data-language="python"] pre code').textContent()).toBe(
    'for value in values:\n    if value > 0:\n        total += value',
  )
  await expect(questionDocument.locator('[data-language="unios-recall"] pre code')).toHaveText(
    '{"answer":"Ungetrackte Lösung","action":"submit"}',
  )
  await expect(questionDocument.locator('script, img, iframe, .study-recall')).toHaveCount(0)
  await expect(questionDocument.getByRole('button')).toHaveCount(0)
  const review = page.locator('.assessment-review')
  await expect(review.getByRole('heading', { name: 'Rückmeldung', exact: true })).toBeVisible()
  await expect(review.locator('ul > li')).toHaveCount(2)
  await expect(review.locator('[data-language="python"] pre code')).toHaveText('if n == 0:\n    return 1')

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size)
      for (const fontSize of ['100%', '150%']) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value
        }, fontSize)
        await expectFits(page)
        await expect(questionDocument.getByRole('table').getByRole('columnheader').last()).toHaveText(headers.at(-1)!)
        const tableArea = questionDocument.locator('.assessment-table-block')
        await expect(tableArea).toHaveAttribute('tabindex', '0')
        if (size.width === 390) {
          expect(await tableArea.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
          await tableArea.evaluate((element) => {
            element.scrollLeft = 0
          })
          await tableArea.focus()
          await tableArea.press('ArrowRight')
          await expect.poll(() => tableArea.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        }
        await expect(questionDocument.locator('[data-language="java"] pre code')).toHaveText(longCode)
        if (size.width === 1280 && fontSize === '100%')
          await screenshot(page, info, `task-logic-code-${theme}-1280-720`)
      }
    }
  }
  expect(externalRequests).toBe(0)
  expect(state.writes).toEqual([])
})

test('multiple choice renders math and long options without changing the selected original value', async ({
  page,
}, info) => {
  const choices = [
    '$\\frac{1}{2}$',
    '`value += 1`\n**Begründung:** Wert erhöhen.',
    `Identifier: ${'synthetic'.repeat(48)}`,
  ]
  const state = await scenario(page, {
    type: 'multiple_choice',
    objective: true,
    question: 'Welche Antwort passt zu $0.5$?',
    choices,
  })
  await openTask(page, state)
  const labels = page.locator('.assessment-choices label')
  await expect(labels).toHaveCount(choices.length)
  await expect(labels.first().locator('.katex')).toHaveCount(1)
  await expect(labels.nth(1).locator('code')).toHaveText('value += 1')
  await expect(labels.nth(1).locator('strong')).toHaveText('Begründung:')
  await expect(labels.last()).toContainText(choices[2])
  await labels.first().getByRole('radio').check()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size)
      for (const fontSize of ['100%', '150%']) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value
        }, fontSize)
        await expectFits(page)
        await labels.last().scrollIntoViewIfNeeded()
        await expect(labels.last()).toBeVisible()
        if (size.width === 390 && fontSize === '150%')
          await screenshot(page, info, `task-choice-answer-${theme}-390-font150`)
      }
    }
  }
  const check = page.getByRole('button', { name: 'Antwort prüfen', exact: true })
  await check.press('ControlOrMeta+Enter')
  await expect
    .poll(() => state.writes.filter((write) => write.path.endsWith('/answer')))
    .toEqual([
      { path: `${base}/tasks/8601/answer`, body: { text: choices[0], steps: [], confidence: 3, session_id: null } },
    ])
})

for (const kind of ['parsons', 'ordering'] as const) {
  test(`${kind} keeps every multiline block and accessible move boundary with an exact index payload`, async ({
    page,
  }) => {
    const choices =
      kind === 'parsons'
        ? ['total = 0', 'for value in values:\n    total += value', 'return total']
        : [
            'Erst den Ausgangswert lesen.\nDann den Grenzfall prüfen.',
            'Die Bedingung vergleichen.',
            'Das Ergebnis begründen.',
          ]
    const state = await scenario(page, { type: kind, objective: true, choices })
    await page.setViewportSize({ width: 390, height: 844 })
    await openTask(page, state)
    const order = page.locator('.assessment-order')
    const items = order.locator('li')
    const content = kind === 'parsons' ? 'pre' : '.assessment-inline'
    await expect(items).toHaveCount(3)
    await expect(items.first().locator(content)).toHaveText(choices[2])
    await expect(items.nth(1).locator(content)).toHaveText(choices[1])
    await expect(page.getByRole('button', { name: 'Baustein 1 nach oben', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Baustein 3 nach unten', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Baustein 3 nach oben', exact: true }).click()
    await expect(items.nth(1).locator(content)).toHaveText(choices[0])
    await page.getByRole('button', { name: 'Baustein 2 nach oben', exact: true }).click()
    await expect(items.first().locator(content)).toHaveText(choices[0])
    await page.getByRole('button', { name: 'Baustein 3 nach oben', exact: true }).click()
    await expect(items.nth(1).locator(content)).toHaveText(choices[1])
    expect(await items.locator(content).allTextContents()).toEqual(choices)
    await expectFits(page)
    await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).press('ControlOrMeta+Enter')
    await expect
      .poll(() => state.writes.find((write) => write.path.endsWith('/answer'))?.body)
      .toEqual({
        text: '[0,1,2]',
        steps: [],
        confidence: 3,
        session_id: null,
      })
  })
}

test('matching keeps long prompts and original selected options readable and submits them unchanged', async ({
  page,
}) => {
  const choices = [
    '**Stack:** Zuletzt hinein, zuerst heraus.',
    'Eine Bedingung mit $A \\land B$.',
    `Langer Identifier: ${'mapping'.repeat(42)}`,
  ]
  const options = ['LIFO', 'Konjunktion', `Synthetische Zuordnung mit einem langen Namen ${'detail '.repeat(12)}`]
  const state = await scenario(page, { type: 'matching', objective: true, choices, options })
  await page.setViewportSize({ width: 390, height: 844 })
  await openTask(page, state)
  const answer = page.locator('.assessment-answer')
  const selects = answer
    .locator('select')
    .filter({ has: page.getByRole('option', { name: 'Zuordnung wählen', exact: true }) })
  await expect(selects).toHaveCount(3)
  await expect(answer.locator('strong').filter({ hasText: 'Stack:' })).toHaveCount(1)
  await expect(answer.locator('.katex')).toHaveCount(1)
  for (let index = 0; index < options.length; index++) await selects.nth(index).selectOption(options[index])
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%'
  })
  await expectFits(page)
  await expect(selects.last()).toHaveValue(options[2])
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect
    .poll(() => state.writes.find((write) => write.path.endsWith('/answer'))?.body)
    .toEqual({
      text: JSON.stringify(options),
      steps: [],
      confidence: 3,
      session_id: null,
    })
})

test('numeric uses a compact text input, explains its exact grammar and retains fraction and decimal payloads', async ({
  page,
}) => {
  const state = await scenario(page, {
    type: 'numeric',
    objective: true,
    question: 'Bestimme den Wert von $\\frac{1}{2}$.',
  })
  await openTask(page, state)
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  expect(await answer.evaluate((element) => element.tagName)).toBe('INPUT')
  await expect(answer).toHaveAttribute('type', 'text')
  const helpId = await answer.getAttribute('aria-describedby')
  expect(helpId).toBeTruthy()
  await expect(page.locator(`[id="${helpId}"]`)).toContainText(
    'Gib eine Zahl wie -0.5 oder einen Bruch wie 1/2 ein. Verwende einen Dezimalpunkt und keine Einheit.',
  )
  for (const value of ['1/2', '-0.5']) {
    await answer.fill(value)
    await answer.press('ControlOrMeta+Enter')
    await expect
      .poll(() => state.writes.filter((write) => write.path.endsWith('/answer')).map((write) => write.body.text))
      .toContain(value)
    await expect(answer).toBeEnabled()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%'
  })
  await expectFits(page)
})

test('symbolic mathematics retains checker syntax and exact multiline working', async ({ page }) => {
  const state = await scenario(page, {
    type: 'symbolic_math',
    objective: true,
    question: '## Nullstellen\n\nLöse $$x^2-4x+3=0$$.',
    expression: 'x^2-4*x+3',
    math_operation: 'roots',
  })
  await openTask(page, state)
  await expect(page.locator('.assessment-formula')).toHaveText('x^2-4*x+3')
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  await answer.fill('1,3')
  await page
    .getByRole('textbox', { name: 'Rechenweg · ein Ausdruck oder eine Gleichung je Zeile', exact: true })
    .fill('x^2-4*x+3=0\n(x-1)*(x-3)=0')
  await answer.press('ControlOrMeta+Enter')
  await expect
    .poll(() => state.writes.find((write) => write.path.endsWith('/answer'))?.body)
    .toEqual({
      text: '1,3',
      steps: ['x^2-4*x+3=0', '(x-1)*(x-3)=0'],
      confidence: 3,
      session_id: null,
    })
  await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toBeVisible()
  await expect(
    page.getByText(
      'Geprüft werden Ergebnis und unterstützte Umformungen. Eine vollständige Beweisprüfung oder Bewertung der verwendeten Regeln ist das nicht.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expectFits(page)
})

test('oral shows transcription controls and submits only the amended synthetic transcript', async ({ page }) => {
  const state = await scenario(page, { type: 'oral' })
  await page.route('**/api/voice/transcribe', (route) =>
    route.fulfill({ json: { transcript: 'Synthetische gesprochene Erklärung.', local: true, language: 'de' } }),
  )
  await openTask(page, state)
  await expect(page.getByRole('button', { name: 'Aufnahme starten', exact: true })).toBeVisible()
  await page.locator('.assessment-audio-upload input').setInputFiles({
    name: 'synthetic-task-audio.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('synthetic-audio-fixture'),
  })
  const transcript = page.getByRole('textbox', { name: 'Transkript prüfen und ergänzen', exact: true })
  await expect(transcript).toHaveValue('Synthetische gesprochene Erklärung.')
  await transcript.fill('Synthetische gesprochene Erklärung.\nDer Basisfall beendet den Aufruf.')
  await transcript.press('ControlOrMeta+Enter')
  await expect
    .poll(() => state.writes.find((write) => write.path.endsWith('/answer'))?.body)
    .toEqual({
      text: 'Synthetische gesprochene Erklärung.\nDer Basisfall beendet den Aufruf.',
      steps: [],
      confidence: 3,
      session_id: null,
    })
  await expect(
    page.getByRole('heading', { name: 'Antwort gespeichert · Tutor-Prüfung offen', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expectFits(page)
})

test('formatted hints stay behind the practice help controls and never create their own actions', async ({ page }) => {
  const state = await scenario(page)
  await openTask(page, state)
  const help = page.locator('.assessment-help')
  await help.getByText('Hilfe öffnen', { exact: true }).click()
  await help.getByRole('button', { name: 'Hinweis 1', exact: true }).click()
  await expect(help.getByRole('heading', { name: 'Denkansatz', exact: true })).toBeVisible()
  await expect(help.locator('.katex')).toHaveCount(1)
  await expect(help.locator('ul > li')).toHaveCount(2)
  expect(state.writes).toEqual([{ path: `${base}/tasks/8601/hint`, body: { level: 1, reveal_solution: false } }])
})

test('a running exam hides existing practice review, hints and results before and after its answer', async ({
  page,
}) => {
  const exam: Exam = {
    id: 8801,
    state: 'running',
    ends_at: '2099-01-01T00:00:00Z',
    task_ids: [8601],
    answered: [],
    remaining_seconds: 120,
  }
  const state = await scenario(page, { attempts: [oldAttempt], reviews: [oldReview], objective: true }, exam)
  await openTask(page, state)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.locator('.assessment-review, .assessment-help, .assessment-result')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Rückmeldung', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Feedback übernehmen', exact: true })).toHaveCount(0)
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  await answer.fill('Synthetische Prüfungsantwort ohne eingeblendete Hilfe.')
  await answer.press('ControlOrMeta+Enter')
  await expect(page.getByRole('button', { name: 'Antwort abgegeben', exact: true })).toBeDisabled()
  await expect(answer).toBeDisabled()
  await expect(page.locator('.assessment-review, .assessment-help, .assessment-result')).toHaveCount(0)
  expect(state.writes).toEqual([
    {
      path: `${base}/tasks/8601/answer`,
      body: {
        text: 'Synthetische Prüfungsantwort ohne eingeblendete Hilfe.',
        steps: [],
        confidence: 3,
        session_id: 8801,
      },
    },
  ])
})
