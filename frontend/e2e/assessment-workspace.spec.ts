// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import type { Page } from '@playwright/test'
import type { AssessmentTask, Exam } from '../src/pages/assessmentTypes'
import { expect, test } from './fixtures'

const assessmentBase = '/api/learning/assessment'
const code = 'int[] a={1,4,7}; int s=0; for(int i=0;i<a.length;i++){ if(a[i]%2!=0 && a[i]>2){s+=a[i];} }'
const prompt = 'Welchen Wert hat s? Begründe für jedes Element, ob es addiert wird.'
type Write = { path: string; body: Record<string, unknown> }

/** Browser-only synthetic assessment state; the host and course fixtures stay untouched. */
async function assessmentScenario(page: Page, overrides: Partial<AssessmentTask> = {}, exam?: Exam) {
  const task: AssessmentTask = {
    id: 7101,
    course_id: 1,
    title: 'Transfer · T12 · Gemischter Ausdruck',
    type: 'free_recall',
    status: 'proposed',
    level: 4,
    highest_hint: 0,
    question: `${code} ${prompt}`,
    choices: [],
    expression: '',
    math_operation: 'equivalent',
    topic: 'Synthetische Bedingungen und Logik',
    mode: 'practice',
    objective: false,
    provenance: {},
    attempts: [],
    reviews: [],
    ...overrides,
  }
  const state = {
    task,
    exam,
    writes: [] as Write[],
    taskReads: 0,
    examReads: 0,
    answerGate: null as Promise<void> | null,
    examGate: null as Promise<void> | null,
    examReadStatus: null as number | null,
  }
  await page.route('**/api/learning/assessment/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET') {
      if (path === `${assessmentBase}/tasks/${task.id}`) {
        state.taskReads++
        await route.fulfill({ json: task })
      } else if (path === `${assessmentBase}/tasks`) {
        await route.fulfill({ json: { tasks: [task] } })
      } else if (path === `${assessmentBase}/exams`) {
        await route.fulfill({ json: { exams: state.exam ? [state.exam] : [] } })
      } else if (state.exam && path === `${assessmentBase}/exams/${state.exam.id}`) {
        state.examReads++
        if (state.examGate) await state.examGate
        await route.fulfill(
          state.examReadStatus
            ? { status: state.examReadStatus, json: { detail: 'Synthetic exam unavailable' } }
            : { json: state.exam },
        )
      } else if (path === `${assessmentBase}/progress`) {
        await route.fulfill({ json: { topics: [] } })
      } else {
        await route.fulfill({ status: 404, json: { detail: 'Unknown synthetic assessment endpoint' } })
      }
      return
    }
    const body = request.postDataJSON() as Record<string, unknown>
    state.writes.push({ path, body })
    if (path === `${assessmentBase}/tasks/${task.id}/accept`) {
      task.status = 'active'
      await route.fulfill({ json: task })
    } else if (path === `${assessmentBase}/tasks/${task.id}/definition`) {
      task.highest_hint = 4
      await route.fulfill({ json: { expected: 'Synthetische Prüfererwartung', concepts: [] } })
    } else if (path === `${assessmentBase}/tasks/${task.id}/hint`) {
      task.highest_hint = Math.max(task.highest_hint, Number(body.level))
      await route.fulfill({ json: { text: 'Synthetischer bestätigter Hinweis', available: true } })
    } else if (path === `${assessmentBase}/tasks/${task.id}/answer`) {
      if (state.answerGate) await state.answerGate
      task.attempts.unshift({
        id: 7201 + task.attempts.length,
        task_id: task.id,
        confidence: Number(body.confidence),
        hint_level: task.highest_hint,
        report: state.exam ? { correct: true } : { needs_tutor: true },
        feedback_requested: false,
      })
      if (state.exam) state.exam.answered.push(task.id)
      await route.fulfill({ json: task.attempts[0] })
    } else {
      await route.fulfill({ status: 404, json: { detail: 'Unknown synthetic assessment write' } })
    }
  })
  return state
}

function writeCount(writes: Write[], action: string) {
  return writes.filter((write) => write.path.endsWith(`/${action}`)).length
}

async function openAssessment(page: Page, state: Awaited<ReturnType<typeof assessmentScenario>>) {
  await page.goto(`/assessment?task=${state.task.id}${state.exam ? `&exam=${state.exam.id}` : ''}`)
  await expect(page.getByRole('heading', { name: state.task.title, exact: true })).toBeVisible()
  await expect(page.locator('.assessment-question > .assessment-question-document')).toBeVisible()
}

test('legacy Java is readable and acceptance unlocks a keyboard answer without changing its payload', async ({
  page,
}) => {
  const state = await assessmentScenario(page)
  await openAssessment(page, state)
  const questionDocument = page.locator('.assessment-question > .assessment-question-document')
  const source = questionDocument.locator('.assessment-code-block pre code')
  await expect(source).toHaveCount(1)
  await expect(questionDocument.locator('[data-language="java"]')).toHaveCount(1)
  const renderedCode = await source.textContent()
  expect(renderedCode?.replace(/\s/g, '')).toBe(code.replace(/\s/g, ''))
  expect(renderedCode).toContain('\n')
  expect(renderedCode).not.toContain('Welchen Wert')
  await expect(questionDocument).toContainText(prompt)

  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  const check = page.getByRole('button', { name: 'Antwort prüfen', exact: true })
  await expect(answer).toBeDisabled()
  await expect(check).toBeDisabled()
  await expect(page.locator('.assessment-blocked-note')).toBeVisible()
  await page
    .locator('.assessment-proposal')
    .getByRole('button', { name: 'Aufgabe übernehmen', exact: true })
    .press('Enter')
  await expect(answer).toBeEnabled()
  expect(state.writes.find((write) => write.path.endsWith('/accept'))?.body).toEqual({ confirmed: true })
  await expect(page.locator('.assessment-proposal')).toHaveCount(0)
  await expect(answer).toHaveAttribute('rows', '10')

  await answer.press('ControlOrMeta+Enter')
  expect(writeCount(state.writes, 'answer')).toBe(0)
  expect(await answer.evaluate((element) => (element as HTMLTextAreaElement).validity.valueMissing)).toBe(true)
  await answer.fill('Erste Begründung')
  await answer.press('End')
  await answer.press('Enter')
  await expect(answer).toHaveValue('Erste Begründung\n')
  expect(writeCount(state.writes, 'answer')).toBe(0)

  const text = 'Synthetische Antwort.\nJedes Element wird einzeln begründet.'
  await answer.fill(text)
  await page.getByRole('combobox', { name: 'Wie sicher bist du?', exact: true }).selectOption('4')
  await answer.press('ControlOrMeta+Enter')
  await expect(
    page.getByRole('heading', { name: 'Antwort gespeichert · Tutor-Prüfung offen', exact: true }),
  ).toBeVisible()
  expect(state.writes.filter((write) => write.path.endsWith('/answer'))).toEqual([
    { path: `${assessmentBase}/tasks/7101/answer`, body: { text, steps: [], confidence: 4, session_id: null } },
  ])
  await expect(answer).toHaveValue(text)
  await answer.focus()
  const previousReads = state.taskReads
  await expect.poll(() => state.taskReads, { timeout: 7000 }).toBeGreaterThan(previousReads)
  await expect(answer).toHaveValue(text)
  await expect(answer).toBeFocused()
})

test('checking rules and full solution require explicit confirmation and retain assisted payloads', async ({
  page,
}) => {
  const state = await assessmentScenario(page)
  await openAssessment(page, state)
  const rules = page.getByRole('button', { name: 'Prüfregeln ausdrücklich ansehen', exact: true })
  const cancelledRules = page.waitForEvent('dialog')
  const cancelRulesClick = rules.click()
  const firstDialog = await cancelledRules
  expect(firstDialog.type()).toBe('confirm')
  expect(firstDialog.message()).toContain('mit Hilfe bearbeitet')
  await firstDialog.dismiss()
  await cancelRulesClick
  expect(writeCount(state.writes, 'definition')).toBe(0)
  expect(state.task.highest_hint).toBe(0)

  const confirmedRules = page.waitForEvent('dialog')
  const confirmRulesClick = rules.click()
  const secondDialog = await confirmedRules
  await secondDialog.accept()
  await confirmRulesClick
  await expect(page.getByText('Synthetische Prüfererwartung', { exact: true })).toBeVisible()
  expect(state.writes.find((write) => write.path.endsWith('/definition'))?.body).toEqual({ confirmed: true })
  expect(state.task.highest_hint).toBe(4)

  await page.getByRole('button', { name: 'Aufgabe übernehmen', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })).toBeEnabled()
  await page.getByText('Hilfe öffnen', { exact: true }).click()
  const solution = page.getByRole('button', { name: 'Lösung ausdrücklich anzeigen', exact: true })
  const cancelledSolution = page.waitForEvent('dialog')
  const cancelSolutionClick = solution.click()
  const thirdDialog = await cancelledSolution
  expect(thirdDialog.message()).toContain('mit Hilfe bearbeitet')
  await thirdDialog.dismiss()
  await cancelSolutionClick
  expect(writeCount(state.writes, 'hint')).toBe(0)
  const confirmedSolution = page.waitForEvent('dialog')
  const confirmSolutionClick = solution.click()
  const fourthDialog = await confirmedSolution
  await fourthDialog.accept()
  await confirmSolutionClick
  await expect(page.getByText('Synthetischer bestätigter Hinweis', { exact: true })).toBeVisible()
  expect(state.writes.find((write) => write.path.endsWith('/hint'))?.body).toEqual({ level: 4, reveal_solution: true })
})

test('composition, repeated keys and an in-flight request cannot submit duplicate answers', async ({ page }) => {
  const state = await assessmentScenario(page, { status: 'active' })
  await openAssessment(page, state)
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  await answer.fill('Synthetischer Entwurf')
  await answer.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    ctrlKey: true,
    isComposing: true,
    bubbles: true,
  })
  await answer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, repeat: true, bubbles: true })
  expect(writeCount(state.writes, 'answer')).toBe(0)
  let releaseAnswer: (() => void) | undefined
  state.answerGate = new Promise<void>((resolve) => {
    releaseAnswer = resolve
  })
  try {
    await answer.press('ControlOrMeta+Enter')
    await expect.poll(() => writeCount(state.writes, 'answer')).toBe(1)
    await expect(page.getByRole('button', { name: 'Antwort prüfen', exact: true })).toBeDisabled()
    await answer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true })
    await answer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, bubbles: true })
    expect(writeCount(state.writes, 'answer')).toBe(1)
  } finally {
    releaseAnswer?.()
  }
  await expect(
    page.getByRole('heading', { name: 'Antwort gespeichert · Tutor-Prüfung offen', exact: true }),
  ).toBeVisible()
  expect(writeCount(state.writes, 'answer')).toBe(1)
})

test('questions render supported formatting and math without executing HTML, fetching images or adding untracked solution controls', async ({
  page,
}) => {
  const recall = JSON.stringify({
    source: JSON.stringify({ question: 'Fremde Frage', answer: 'Fremde Lösung', hint: 'Fremder Hinweis' }),
  })
  const question = [
    '## Synthetische Darstellung',
    'Eine Liste:\n- Erst lesen\n- Dann begründen',
    '**Wichtiger Hinweis:** Prüfe `value` im Code.',
    '```java\nint value = 7;\n```',
    'Inline: $x^2$.\n\n$$\n\\frac{1}{2}\n$$',
    'Ungültig: $\\unknownAssessmentCommand{x}$.',
    '<script>window.__assessmentUnexpected=true</script>',
    '![Synthetisches externes Bild](https://assessment-image.example.test/pixel.png)',
    `\`\`\`unios-recall\n${recall}\n\`\`\``,
  ].join('\n\n')
  let remoteImages = 0
  await page.route('https://assessment-image.example.test/**', async (route) => {
    remoteImages++
    await route.fulfill({ status: 204, body: '' })
  })
  const state = await assessmentScenario(page, { status: 'active', question })
  await openAssessment(page, state)
  const questionDocument = page.locator('.assessment-question > .assessment-question-document')
  // Passive document structure is semantic; embedded actions and external images remain inert.
  await expect(questionDocument.getByRole('heading', { name: 'Synthetische Darstellung', exact: true })).toBeVisible()
  await expect(questionDocument.getByRole('listitem')).toHaveText(['Erst lesen', 'Dann begründen'])
  await expect(questionDocument.locator('strong')).toHaveText('Wichtiger Hinweis:')
  await expect(questionDocument.locator('code').filter({ hasText: /^value$/ })).toHaveCount(1)
  await expect(questionDocument.locator('.katex')).toHaveCount(2)
  await expect(questionDocument).toContainText('unknownAssessmentCommand')
  await expect(questionDocument).toContainText('<script>window.__assessmentUnexpected=true</script>')
  await expect(questionDocument.locator('script, img, iframe, .study-recall')).toHaveCount(0)
  await expect(questionDocument.getByRole('button')).toHaveCount(0)
  await expect(questionDocument).toContainText('Fremde Lösung')
  expect(
    await page.evaluate(
      () => (window as Window & { __assessmentUnexpected?: boolean }).__assessmentUnexpected ?? false,
    ),
  ).toBe(false)
  expect(remoteImages).toBe(0)
  expect(state.writes).toEqual([])
})

test('an exam hides help and results, then locks an already submitted keyboard answer', async ({ page }) => {
  const exam: Exam = {
    id: 7301,
    state: 'running',
    ends_at: '2099-01-01T00:00:00Z',
    task_ids: [7101],
    answered: [],
    remaining_seconds: 120,
  }
  const state = await assessmentScenario(page, { status: 'active' }, exam)
  await openAssessment(page, state)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText('Hilfe öffnen', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lösung ausdrücklich anzeigen', exact: true })).toHaveCount(0)
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  await answer.fill('Synthetische Prüfungsantwort')
  await answer.press('ControlOrMeta+Enter')
  await expect(page.getByRole('button', { name: 'Antwort abgegeben', exact: true })).toBeDisabled()
  await expect(answer).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toHaveCount(0)
  expect(state.writes.filter((write) => write.path.endsWith('/answer'))).toEqual([
    {
      path: `${assessmentBase}/tasks/7101/answer`,
      body: { text: 'Synthetische Prüfungsantwort', steps: [], confidence: 3, session_id: 7301 },
    },
  ])
  await answer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true })
  expect(writeCount(state.writes, 'answer')).toBe(1)
  expect(writeCount(state.writes, 'hint')).toBe(0)
})

test('an exam URL never opens a practice workspace while the requested exam is still loading', async ({ page }) => {
  const exam: Exam = {
    id: 7303,
    state: 'running',
    ends_at: '2099-01-01T00:00:00Z',
    task_ids: [7101],
    answered: [],
    remaining_seconds: 180,
  }
  const state = await assessmentScenario(
    page,
    {
      status: 'active',
      attempts: [
        { id: 7200, task_id: 7101, confidence: 3, hint_level: 0, report: { correct: true }, feedback_requested: false },
      ],
    },
    exam,
  )
  let releaseExam: (() => void) | undefined
  state.examGate = new Promise<void>((resolve) => {
    releaseExam = resolve
  })
  try {
    await page.goto(`/assessment?task=${state.task.id}&exam=${exam.id}`)
    await expect.poll(() => state.taskReads).toBeGreaterThan(0)
    await expect.poll(() => state.examReads).toBeGreaterThan(0)
    await expect(page.locator('.assessment-page .loading-layout')).toBeVisible()
    await expect(page.locator('.assessment-workspace')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Antwort prüfen', exact: true })).toHaveCount(0)
    await expect(page.getByText('Hilfe öffnen', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Enter')
    expect(state.writes).toEqual([])
  } finally {
    releaseExam?.()
  }
  await expect(page.locator('.assessment-question > .assessment-question-document')).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText('Hilfe öffnen', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toHaveCount(0)
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  await expect(answer).toBeEnabled()
  await answer.fill('Antwort nach geladener synthetischer Prüfung')
  await answer.press('ControlOrMeta+Enter')
  await expect(page.getByRole('button', { name: 'Antwort abgegeben', exact: true })).toBeDisabled()
  expect(state.writes.filter((write) => write.path.endsWith('/answer'))).toEqual([
    {
      path: `${assessmentBase}/tasks/7101/answer`,
      body: { text: 'Antwort nach geladener synthetischer Prüfung', steps: [], confidence: 3, session_id: 7303 },
    },
  ])
})

test('an unavailable exam shows an error without exposing practice answers or help', async ({ page }) => {
  const exam: Exam = {
    id: 7304,
    state: 'running',
    ends_at: '2099-01-01T00:00:00Z',
    task_ids: [7101],
    answered: [],
    remaining_seconds: 120,
  }
  const state = await assessmentScenario(page, { status: 'active' }, exam)
  state.examReadStatus = 404
  await page.goto(`/assessment?task=${state.task.id}&exam=${exam.id}`)
  const failure = page.locator('.assessment-page').getByRole('alert')
  await expect(failure).toBeVisible()
  await expect(failure.getByRole('button', { name: 'Daten erneut laden', exact: true })).toBeVisible()
  await expect(page.locator('.assessment-workspace')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })).toHaveCount(0)
  await expect(page.getByText('Hilfe öffnen', { exact: true })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Enter')
  expect(state.writes).toEqual([])
})

test('an exam rejects a task outside its own task list instead of rendering a practice workspace', async ({ page }) => {
  const exam: Exam = {
    id: 7305,
    state: 'running',
    ends_at: '2099-01-01T00:00:00Z',
    task_ids: [7199],
    answered: [],
    remaining_seconds: 120,
  }
  const state = await assessmentScenario(page, { status: 'active' }, exam)
  await page.goto(`/assessment?task=${state.task.id}&exam=${exam.id}`)
  await expect(page.locator('.assessment-page').getByRole('alert')).toContainText(
    'Diese Aufgabe gehört nicht zu dieser Probeprüfung.',
  )
  await expect(page.locator('.assessment-workspace')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })).toHaveCount(0)
  await expect(page.getByText('Hilfe öffnen', { exact: true })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Enter')
  expect(state.writes).toEqual([])
})

for (const examCase of [
  { name: 'expired', state: 'running', seconds: 0 },
  { name: 'finished', state: 'finished', seconds: 120 },
] as const) {
  test(`${examCase.name} exams explain their answer lock and cannot submit from the keyboard`, async ({ page }) => {
    const exam: Exam = {
      id: 7302,
      state: examCase.state,
      ends_at: '2099-01-01T00:00:00Z',
      task_ids: [7101],
      answered: [],
      remaining_seconds: examCase.seconds,
    }
    const state = await assessmentScenario(page, { status: 'active' }, exam)
    await openAssessment(page, state)
    const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
    await expect(answer).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Antwort prüfen', exact: true })).toBeDisabled()
    await expect(page.locator('.assessment-blocked-note')).toBeVisible()
    await answer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, bubbles: true })
    expect(writeCount(state.writes, 'answer')).toBe(0)
  })
}

test('task and answer remain usable in light and dark at desktop and 390 pixels', async ({ page }, testInfo) => {
  const state = await assessmentScenario(page)
  await openAssessment(page, state)
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const questionDocument = page.locator('.assessment-question > .assessment-question-document')
      await expect(questionDocument).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const codeFont = await questionDocument
        .locator('.assessment-code-block pre code')
        .evaluate((element) => getComputedStyle(element).fontFamily)
      expect(codeFont).toMatch(/mono|Fira Code/i)
      const accept = page
        .locator('.assessment-proposal')
        .getByRole('button', { name: 'Aufgabe übernehmen', exact: true })
      await accept.scrollIntoViewIfNeeded()
      await expect(accept).toBeVisible()
      await expect(accept).toBeEnabled()
      const screenshot = testInfo.outputPath(`assessment-workspace-proposed-${theme}-${width}.png`)
      await page.screenshot({ path: screenshotPath(screenshot), fullPage: true, animations: 'disabled' })
      await testInfo.attach(`assessment-workspace-proposed-${theme}-${width}`, {
        path: screenshot,
        contentType: 'image/png',
      })
    }
  }
  await page.getByRole('button', { name: 'Aufgabe übernehmen', exact: true }).click()
  const answer = page.getByRole('textbox', { name: 'Antwort eingeben', exact: true })
  await expect(answer).toBeEnabled()
  await answer.fill('Synthetische mobile Begründung.\nDie Aufgabe bleibt darüber lesbar.')
  await answer.scrollIntoViewIfNeeded()
  const answerBox = await answer.boundingBox()
  expect(answerBox?.height).toBeGreaterThan(160)
  const check = page.getByRole('button', { name: 'Antwort prüfen', exact: true })
  await check.scrollIntoViewIfNeeded()
  await expect(check).toBeVisible()
  await expect(check).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await check.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Antwort gespeichert · Tutor-Prüfung offen', exact: true }),
  ).toBeVisible()
  expect(writeCount(state.writes, 'answer')).toBe(1)
})

test('wide inline math and long code scroll within their own areas at 390 pixels', async ({ page }, testInfo) => {
  const matrix = `\\begin{pmatrix}${Array.from({ length: 24 }, (_, index) => index + 1).join(' & ')}\\end{pmatrix}`
  const longCode = `String identifier = "${'synthetic'.repeat(36)}";`
  const question = `Eine breite Matrix: $${matrix}$.\n\n\`\`\`java\n${longCode}\n\`\`\`\n\nErkläre die Darstellung.`
  const state = await assessmentScenario(page, { status: 'active', question })
  await page.setViewportSize({ width: 390, height: 1000 })
  await openAssessment(page, state)
  await page.evaluate(() => document.fonts.ready)
  const questionDocument = page.locator('.assessment-question > .assessment-question-document')
  const inlineMath = questionDocument.locator('.assessment-question-text .assessment-math')
  const codeArea = questionDocument.locator('.assessment-code-block pre')
  await expect(inlineMath.locator('.katex')).toHaveCount(1)
  await expect(codeArea.locator('code')).toHaveText(longCode)
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    expect(await inlineMath.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await codeArea.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    const bounds = await inlineMath.boundingBox()
    const documentBounds = await questionDocument.boundingBox()
    expect(bounds?.width).toBeLessThanOrEqual((documentBounds?.width ?? 0) + 1)
    await codeArea.evaluate((element) => {
      element.scrollLeft = 0
    })
    await codeArea.focus()
    await codeArea.press('ArrowRight')
    await expect.poll(() => codeArea.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const screenshot = testInfo.outputPath(`assessment-workspace-wide-${theme}-390.png`)
    await page.screenshot({ path: screenshotPath(screenshot), fullPage: true, animations: 'disabled' })
    await testInfo.attach(`assessment-workspace-wide-${theme}-390`, { path: screenshot, contentType: 'image/png' })
  }
  expect(state.writes).toEqual([])
})
