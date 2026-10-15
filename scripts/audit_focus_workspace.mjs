// SPDX-License-Identifier: AGPL-3.0-or-later

/** Visible accepted-workspace states, using only the isolated synthetic backend. */
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.argv.includes('--fake-data')) throw new Error('Nur mit --fake-data ausführen')
const sourceOnly = process.argv.includes('--source-only')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const require = createRequire(path.join(frontend, 'package.json'))
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href)
const { snapshot } = await import(pathToFileURL(require.resolve('lighthouse')).href)
const output = path.join(root, 'docs', 'qa', 'focus-workspace-20261007')
const rawPrefix = sourceOnly ? 'focus-source-diagnostic' : 'focus-lighthouse'
const api = 'http://127.0.0.1:8194'
const preview = 'http://127.0.0.1:4194'
const states = sourceOnly ? ['source'] : ['source', 'practice', 'cards', 'session']
const expectedReports = states.length * 4
const noteText = 'Meine eigene Begründung: Ein Grenzwert beschreibt, wie nahe Werte am Ziel liegen.\n\nDie Quelle bleibt an Version 1 und Seite 12 gebunden.'
const practiceText = 'Ich wähle δ = ε / 3, damit sich der Abstand bei der Multiplikation mit 3 genau zu ε vergrößert.'
const processes = []
const reports = []
const hashBuild = async () => createHash('sha256').update(await readFile(path.join(frontend, 'dist', 'index.html'))).digest('hex')
const buildHash = await hashBuild()

function classifyRequestCancellations(state, saved, failures, lifecycle, fetchRecords = [], seed = {}, geometry = {}) {
  const scopedDue = `/api/anki/study/due?deck=${encodeURIComponent(saved.deck_name)}`
  const expected = [], unexpected = []
  for (const failure of failures) {
    // fetchFreshStudyDue deliberately cancels only the exact pre-initialization
    // scoped GET. Accept it only after its newer replacement actually completed.
    const replacement = state === 'session' && failure.error === 'net::ERR_ABORTED' &&
      failure.method === 'GET' && failure.url === scopedDue && lifecycle.find(event =>
        event.event === 'finished' && event.method === 'GET' && event.url === scopedDue &&
        event.requestId > failure.requestId && event.elapsedMs >= failure.elapsedMs &&
        event.status >= 200 && event.status < 300)
    if (replacement) expected.push({ ...failure, proof: {
      rule: 'exact scoped predecessor cancelled by fetchFreshStudyDue; newer GET completed before capture',
      source: 'frontend/src/studyQueries.ts:fetchFreshStudyDue',
      replacementRequestId: replacement.requestId, replacementStatus: replacement.status,
      replacementCompletedAt: replacement.at,
    } })
    else {
      const fetches = fetchRecords.filter(record => record.url === failure.url && record.method === failure.method)
      const response = lifecycle.find(event => event.requestId === failure.requestId && event.event === 'response')
      const abort = failure.error === 'net::ERR_ABORTED'
      const opened = `/api/analytics/material-versions/${seed.version_id}/opened`
      const inline = `/files/${seed.version_id}/inline`
      const completedPdf = state === 'source' && abort && failure.method === 'GET' && failure.url === inline &&
        response?.status === 200 && fetches.length === 1 && fetches[0].resolvedStatus === 200 &&
        (fetches[0].bodyDoneAt || fetches[0].readerCancelledAt) &&
        geometry.pdfPages === 120 && geometry.sourcePage === seed.page
      const acknowledgedOpen = state === 'source' && abort && failure.resourceType === 'fetch' &&
        failure.method === 'POST' && failure.url === opened && response?.status === 204 &&
        fetches.length === 1 && fetches[0].resolvedStatus === 204 &&
        ['basic', 'cors'].includes(fetches[0].resolvedType) && !fetches[0].rejectedAt
      const signalledRead = state === 'source' && abort && failure.method === 'GET' &&
        ['/api/courses', '/api/notifications'].includes(failure.url) &&
        fetches.some(record => record.signalAborted && record.rejectedName === 'AbortError') &&
        lifecycle.find(event => event.event === 'finished' && event.url === failure.url && event.method === 'GET' &&
          event.requestId > failure.requestId && event.elapsedMs >= failure.elapsedMs && event.status >= 200 && event.status < 300)
      if (completedPdf || acknowledgedOpen || signalledRead) expected.push({ ...failure, proof: {
        rule: completedPdf ? 'decoded 120-page PDF at requested page; native fetch stream completed or explicitly cancelled'
          : acknowledgedOpen ? 'first-open mutation actually acknowledged by native app fetch with HTTP 204'
          : 'exact shell read was explicitly signal-aborted; newer same-URL GET completed',
        source: completedPdf ? 'pdfjs-dist/build/pdf.mjs:PDFFetchStreamReader.cancel'
          : acknowledgedOpen ? 'frontend/src/api.ts:request; app/analytics/api.py:record_open'
          : 'frontend/src/api.ts:useApi queryFn signal',
        fetchRecords: structuredClone(fetches), ...(completedPdf ? { pdfPages: geometry.pdfPages, sourcePage: geometry.sourcePage } : {}),
        ...(signalledRead ? { replacementRequestId: signalledRead.requestId, replacementStatus: signalledRead.status } : {}),
      } })
      else unexpected.push(failure)
    }
  }
  return { expected, unexpected }
}

async function assertUnused(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(1000) }) }
  catch { return }
  throw new Error(`Eigener Fake-Port ist bereits belegt: ${url}`)
}

async function start(command, args, cwd, env, health) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: 'ignore' })
  processes.push(child)
  let launchError
  child.on('error', error => { launchError = error })
  for (let attempt = 0; attempt < 60; attempt++) {
    if (launchError) throw launchError
    if (child.exitCode !== null) throw new Error('Eigener Fake-Dienst konnte nicht starten')
    try { if ((await fetch(health, { signal: AbortSignal.timeout(1000) })).ok) return }
    catch { /* Only wait for the process created by this runner. */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Eigener Fake-Dienst antwortet nicht')
}

async function json(url, body) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) throw new Error(`Synthetische Fixture HTTP ${response.status}`)
  return response.json()
}

async function clickText(page, text, selector = 'button') {
  const handle = await page.waitForFunction(({ text, selector }) => [...document.querySelectorAll(selector)].find(button =>
    button.getClientRects().length > 0 && !button.disabled &&
    (button.textContent.includes(text) || button.getAttribute('aria-label')?.includes(text))), {}, { text, selector })
  const button = handle.asElement()
  if (!button) throw new Error('Sichtbarer synthetischer UI-Schritt fehlt')
  // A partially visible button can sit beneath the fixed mobile navigation.
  // Bring the real control into the viewport, then verify its actual hit target.
  await button.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await settleActualUi(page)
  const point = await button.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2
    const hit = document.elementFromPoint(x, y)
    if (!hit || !element.contains(hit)) throw new Error('Der tatsächliche Klickpunkt ist durch ein anderes Element verdeckt')
    return { x, y }
  })
  await page.mouse.click(point.x, point.y)
  await handle.dispose()
}

async function fillTextarea(page, selector, value) {
  const textarea = await page.waitForSelector(selector, { visible: true })
  await textarea.evaluate(element => {
    if (!(element instanceof HTMLTextAreaElement) || element.disabled) throw new Error('Editierbare Mitschrift fehlt')
    element.focus({ preventScroll: true })
  })
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.down(modifier)
  await page.keyboard.press('KeyA')
  await page.keyboard.up(modifier)
  await page.keyboard.type(value)
  await textarea.dispose()
  await page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.value === value, {}, { selector, value })
}

async function settleActualUi(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    (!animation.pending && animation.playState !== 'running') ||
    !Number.isFinite(animation.effect?.getComputedTiming().endTime)))
}

function stateTarget(state, seed) {
  if (state === 'source') return '.reader-note-draft textarea'
  if (state === 'practice') return `#practice-${seed.exercise_id} textarea`
  if (state === 'cards') return '.study-deck-link'
  return '.study-session-answer'
}

async function revealActualState(page, state, seed) {
  const selector = stateTarget(state, seed)
  await page.waitForSelector(selector, { visible: true })
  await page.evaluate(({ state, selector }) => {
    const target = document.querySelector(selector)
    if (state !== 'source') {
      target.scrollIntoView({ block: 'center', behavior: 'instant' })
      return
    }
    // Keep the PDF reading point. Reveal notes only inside their real panel;
    // scrolling the document to the textarea would silently change the source page.
    const panel = target.closest('.material-side-inline, .material-side-drawer')
    if (!panel) throw new Error('Das tatsächlich geöffnete Quellenpanel fehlt')
    for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY) && ancestor.scrollHeight > ancestor.clientHeight) {
        const bounds = ancestor.getBoundingClientRect()
        const noteBounds = target.getBoundingClientRect()
        ancestor.scrollTop += noteBounds.top - bounds.top - Math.max(12, (bounds.height - noteBounds.height) / 2)
        break
      }
      if (ancestor === panel) break
    }
  }, { state, selector })
  await settleActualUi(page)
}

async function assertActualState(page, state, seed, saved, expectedWidth) {
  return page.evaluate(({ state, seed, saved, noteText, practiceText, expectedWidth }) => {
    if (window.innerWidth !== expectedWidth) {
      throw new Error(`Falsche tatsächliche Auditbreite: ${window.innerWidth}px statt ${expectedWidth}px`)
    }
    function visible(element) {
      if (!(element instanceof HTMLElement)) return false
      let top = 0, left = 0, right = window.innerWidth, bottom = window.innerHeight
      const bounds = element.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return false
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor)
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false
        const clip = ancestor.getBoundingClientRect()
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom)
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, clip.left); right = Math.min(right, clip.right)
        }
      }
      return bounds.bottom > top && bounds.top < bottom && bounds.right > left && bounds.left < right
    }
    if (state === 'source' || state === 'practice') {
      if (document.querySelector('.focus-context h2')?.textContent !== seed.course_name) {
        throw new Error('Der tatsächliche Arbeitsbereich hat den falschen Kurs')
      }
    } else if (!document.querySelector('.learning-focus-bar')?.textContent.includes(seed.course_name)) {
      throw new Error('Kartenansicht ohne tatsächlichen Lernauftrag')
    }
    if (state === 'source') {
      const urlPage = Number(new URLSearchParams(window.location.search).get('page'))
      const pager = document.querySelector('.reader-page-jump > summary')?.textContent.trim() ?? ''
      if (urlPage !== seed.page || !new RegExp(`^Seite\\s+${seed.page}(?:\\s|$)`).test(pager)) {
        throw new Error(`Die Quelle driftete von Seite ${seed.page}: URL ${urlPage}, Pager ${pager}`)
      }
      if (document.querySelectorAll('.material-pages [data-reader-page]').length !== 120) {
        throw new Error('Das echte synthetische PDF muss alle 120 Seiten enthalten')
      }
      const textarea = document.querySelector('.reader-note-draft textarea')
      if (!visible(textarea) || textarea.value !== noteText ||
          !document.querySelector('.reader-study-tabs [data-state="active"]')?.textContent.includes('Mitschrift')) {
        throw new Error('Die eigene Mitschrift muss im tatsächlich geöffneten Quellenpanel sichtbar sein')
      }
      if (window.innerWidth > 1000 && ![...document.querySelectorAll(`[data-material-page="${seed.page}"] canvas`)].some(visible)) {
        throw new Error('Die tatsächliche PDF-Quellseite muss neben der Desktop-Mitschrift sichtbar sein')
      }
      if (window.innerWidth < 600 && !visible(document.querySelector('[role="dialog"].material-side-drawer'))) {
        throw new Error('Die mobile Mitschrift muss im echten geöffneten Dialog liegen')
      }
      const draft = JSON.parse(localStorage.getItem(`unios:new-note-draft:v1:${seed.course_id}:${seed.resource_id}`) ?? 'null')
      const saveButton = document.querySelector('.reader-note-actions button[type="submit"]')
      if (draft?.body !== noteText || !draft.writeId || !(saveButton instanceof HTMLButtonElement) || saveButton.disabled) {
        throw new Error('Die eigene Mitschrift muss im echten Entwurf gesichert und speicherbar sein')
      }
    } else if (state === 'practice') {
      const exercise = document.getElementById(`practice-${seed.exercise_id}`)
      const textarea = exercise?.querySelector('textarea')
      if (!visible(textarea) || textarea.value !== practiceText || !exercise.textContent.includes('δ = ε / 3')) {
        throw new Error('Die passende echte Kursübung mit eigener Antwort muss sichtbar sein')
      }
      if (document.querySelector('.focus-workarea')?.textContent.includes('Fremde Programmieraufgabe')) {
        throw new Error('Fremde Übung gelangte in den Kursarbeitsbereich')
      }
      const persisted = JSON.parse(sessionStorage.getItem('unios-workspace-session-v1') ?? '[]')
      const answerKey = `practice:${seed.course_id}:learning-focus:block:${seed.block_id}:answer`
      const solutionButton = [...exercise.querySelectorAll('button')].find(button => button.textContent.includes('Lösung ansehen'))
      if (!persisted.some(entry => entry[0] === answerKey && entry[1] === practiceText) ||
          !solutionButton || solutionButton.disabled) {
        throw new Error('Die eigene Antwort muss im Workspace gespeichert und die Lösung bedienbar sein')
      }
      const panel = exercise.closest('[data-slot="card"]')
      const question = exercise.querySelector('h3')
      const title = panel?.querySelector('[data-slot="card-title"]')
      if (!panel || !question || !title) throw new Error('Die echte Übungsgeometrie fehlt')
      const panelBounds = panel.getBoundingClientRect()
      for (const element of [exercise, question, textarea, title]) {
        const bounds = element.getBoundingClientRect()
        if (bounds.left < Math.max(0, panelBounds.left) - 1 ||
            bounds.right > Math.min(window.innerWidth, panelBounds.right) + 1) {
          throw new Error('Übungstext oder Eingabe ist innerhalb des Panels horizontal abgeschnitten')
        }
      }
      if (window.innerWidth < 600 && (question.getBoundingClientRect().width < 250 ||
          textarea.getBoundingClientRect().width < 250)) {
        throw new Error('Mobile Frage und eigene Antwort müssen ausreichend breite Zeilen nutzen')
      }
    } else if (state === 'cards') {
      const links = [...document.querySelectorAll('.study-deck-link')]
      if (links.length !== 1 || !visible(links[0]) || !links[0].getAttribute('href')?.includes(encodeURIComponent(saved.deck_name))) {
        throw new Error('Der eindeutig zugeordnete native Kursstapel muss sichtbar sein')
      }
    } else {
      const answer = document.querySelector('.study-session-answer')
      if (!visible(answer) || !answer.textContent.includes(seed.quote) ||
          !visible(document.querySelector('.study-session-actions button'))) {
        throw new Error('Die tatsächliche native Antwort und Bewertung müssen sichtbar sein')
      }
      if (!document.querySelector('.study-session-source')?.getAttribute('href')?.includes(`version=${seed.version_id}`)) {
        throw new Error('Die native Karte muss ihren exakten Ursprung im Lernauftrag öffnen')
      }
    }
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    const overflow = Math.max(0, documentWidth - window.innerWidth)
    if (overflow > 1) throw new Error(`Horizontaler Dokumentüberlauf: ${overflow}px`)
    const practiceExercise = state === 'practice' ? document.getElementById(`practice-${seed.exercise_id}`) : null
    const boundsOf = element => {
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, width: bounds.width }
    }
    return { documentWidth, viewportWidth: window.innerWidth, horizontalOverflowPx: overflow,
      ...(practiceExercise ? { practiceGeometry: {
        row: boundsOf(practiceExercise), question: boundsOf(practiceExercise.querySelector('h3')),
        answer: boundsOf(practiceExercise.querySelector('textarea')),
        heading: boundsOf(practiceExercise.closest('[data-slot="card"]').querySelector('[data-slot="card-title"]')),
      }, practiceAnswerPersisted: true, practiceSolutionEnabled: true } : {}),
      ...(state === 'source' ? { sourcePage: Number(new URLSearchParams(window.location.search).get('page')),
        sourcePager: document.querySelector('.reader-page-jump > summary')?.textContent.trim(),
        pdfPages: document.querySelectorAll('.material-pages [data-reader-page]').length,
        sourceDraftPersisted: true, sourceSaveEnabled: true } : {}) }
  }, { state, seed, saved, noteText, practiceText, expectedWidth })
}

async function openState(page, state, seed, saved) {
  const reference = `block:${seed.block_id}`
  const focusQuery = new URLSearchParams({ focus: reference }).toString()
  const workspace = `${preview}/learning/focus/block/${seed.block_id}`
  if (state === 'source') {
    await page.goto(`${workspace}?mode=source&version=${seed.version_id}&page=${seed.page}`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(page => document.querySelector(`[data-material-page="${page}"]`)?.textContent
      .includes(`Erfundenes Lernskript V1 Seite ${page}`), {}, seed.page)
    if (!await page.$('.material-side-inline, .material-side-drawer')) await clickText(page, 'Markierungen & Fragen')
    const notesActive = await page.$eval('.reader-study-tabs [data-state="active"]', tab => tab.textContent.includes('Mitschrift'))
    if (!notesActive) {
      // The reader also has a toolbar action with this name. Keep tab clicks
      // inside the already-open panel instead of scrolling up to that toolbar.
      const tab = await page.waitForSelector('.reader-study-tabs [role="tab"][data-state="inactive"]')
      const notes = await page.$$('.reader-study-tabs [role="tab"]')
      for (const candidate of notes) {
        if (await candidate.evaluate(element => element.textContent.includes('Mitschrift'))) {
          await candidate.click()
          break
        }
      }
      await tab.dispose()
      for (const candidate of notes) await candidate.dispose()
    }
    await fillTextarea(page, '.reader-note-draft textarea', noteText)
  } else if (state === 'practice') {
    await page.goto(`${workspace}?mode=practice`, { waitUntil: 'networkidle0' })
    await page.waitForSelector(`#practice-${seed.exercise_id}`)
    if (!await page.$(`#practice-${seed.exercise_id} textarea`)) {
      await clickText(page, 'Aufgabe üben', `#practice-${seed.exercise_id} button`)
    }
    await fillTextarea(page, `#practice-${seed.exercise_id} textarea`, practiceText)
  } else if (state === 'cards') {
    await page.goto(`${preview}/study?${focusQuery}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.study-deck-link')
  } else {
    await page.goto(`${preview}/study/session/${encodeURIComponent(saved.deck_name)}?${focusQuery}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.study-session-card')
    await clickText(page, 'Antwort zeigen')
  }
  await revealActualState(page, state, seed)
}

let browser
try {
  await assertUnused(`${api}/health`)
  await assertUnused(preview)
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  await start(python, ['-m', 'uvicorn', 'tests.fake_servers.phase1_app:app', '--host', '127.0.0.1', '--port', '8194'], root,
    { UNIOS_FACTORY_ONLY: 'true', UNIOS_FAKE_PREVIEW_PORT: '4194', LIBREOFFICE_BIN: '/missing/soffice' }, `${api}/health`)
  await start(process.execPath, [path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview',
    '--configLoader', 'native', '--host', '127.0.0.1', '--port', '4194', '--strictPort'], frontend,
    { UNIOS_API_TARGET: api }, preview)
  const seed = await json(`${api}/api/__test__/focus-workspace`, {})
  const saved = await json(`${api}/api/anki/manual-cards`, { mutation_id: randomUUID(),
    front: seed.annotation.comment, back: seed.quote, topic: 'Grenzwerte',
    source: { version_id: seed.version_id, annotation_id: seed.annotation.id,
      expected_revision: seed.annotation.revision, page: seed.page } })
  if (saved.status !== 'pushed') throw new Error('Synthetische native Anki-Karte fehlt')
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32'
    ? path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  browser = await puppeteer.launch({ executablePath, headless: true })
  await mkdir(output, { recursive: true })
  for (const state of states) for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const page = await browser.newPage()
    const pageErrors = [], consoleErrors = [], failedResponses = [], failedRequests = []
    const teardownRequestFailures = [], lifecycleRecords = []
    const started = performance.now(), requestIds = new WeakMap()
    let phase = 'navigation', requestSequence = 0
    const eventTime = () => ({ phase, at: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) })
    const requestRecord = request => {
      let requestId = requestIds.get(request)
      if (!requestId) { requestId = ++requestSequence; requestIds.set(request, requestId) }
      return { requestId, url: request.url().replace(preview, ''), method: request.method(), resourceType: request.resourceType(), ...eventTime() }
    }
    page.on('request', request => lifecycleRecords.push({ ...requestRecord(request), event: 'started' }))
    page.on('pageerror', error => pageErrors.push(String(error)))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location(), ...eventTime() }) })
    page.on('response', response => {
      const record = { ...requestRecord(response.request()), event: 'response', status: response.status(),
        responseType: response.fromServiceWorker() ? 'service-worker' : 'network', contentType: response.headers()['content-type'] ?? null }
      lifecycleRecords.push(record)
      if (response.status() >= 400) failedResponses.push(record)
    })
    page.on('requestfinished', request => lifecycleRecords.push({ ...requestRecord(request), event: 'finished',
      status: request.response()?.status() ?? null }))
    page.on('requestfailed', request => {
      const failure = { ...requestRecord(request), error: request.failure()?.errorText }
      lifecycleRecords.push({ ...failure, event: 'failed' })
      if (phase === 'teardown') teardownRequestFailures.push(failure)
      else failedRequests.push(failure)
    })
    try {
      await page.setViewport({ width, height: width === 390 ? 844 : 900 })
      await page.evaluateOnNewDocument(theme => {
        localStorage.setItem('theme', theme)
        document.documentElement?.classList.toggle('dark', theme === 'dark')
      }, theme)
      // Observe native outcomes without replacing requests or response bodies.
      // CDP can report aborted transport after a consumed stream or 204 ACK.
      await page.evaluateOnNewDocument(() => {
        const records = []
        window.__uniosQaFetch = records
        const nativeFetch = window.fetch.bind(window)
        window.fetch = function(input, options) {
          const absolute = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href)
          const url = absolute.origin === location.origin ? absolute.pathname + absolute.search : absolute.href
          const method = (options?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
          const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined)
          const record = { id: records.length + 1, url, method, startedAt: new Date().toISOString() }
          records.push(record)
          return nativeFetch(input, options).then(response => {
            record.resolvedAt = new Date().toISOString()
            record.resolvedStatus = response.status
            record.resolvedType = response.type
            if (/^\/files\/\d+\/inline$/.test(url) && response.body) {
              const body = response.body, nativeGetReader = body.getReader.bind(body)
              body.getReader = function(...args) {
                const reader = nativeGetReader(...args)
                const nativeRead = reader.read.bind(reader), nativeCancel = reader.cancel.bind(reader)
                reader.read = function(...params) {
                  return nativeRead(...params).then(result => {
                    if (result.done) record.bodyDoneAt = new Date().toISOString()
                    return result
                  })
                }
                reader.cancel = function(reason) {
                  record.readerCancelledAt = new Date().toISOString()
                  record.readerCancelReason = String(reason)
                  return nativeCancel(reason)
                }
                return reader
              }
            }
            return response
          }, error => {
            record.rejectedAt = new Date().toISOString()
            record.rejectedName = error?.name
            record.rejectedMessage = String(error)
            record.signalAborted = signal?.aborted === true
            throw error
          })
        }
      })
      await openState(page, state, seed, saved)
      phase = 'setup'
      await page.evaluate(theme => {
        localStorage.setItem('theme', theme)
        document.documentElement.classList.toggle('dark', theme === 'dark')
      }, theme)
      await settleActualUi(page)
      phase = 'observation'
      const before = await assertActualState(page, state, seed, saved, width)
      const { lhr } = await snapshot(page, { config: { extends: 'lighthouse:default', settings: {
        onlyCategories: ['accessibility'], formFactor: width === 390 ? 'mobile' : 'desktop',
        screenEmulation: { disabled: true, width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1,
          mobile: false }, usePassiveGathering: true,
      } } })
      await writeFile(path.join(root, `${rawPrefix}-${state}-${theme}-${width}.json`), JSON.stringify(lhr))
      // Keep the explicit viewport even if an audit changes device metrics.
      // Restore only the real target, preserving the source's document position.
      await page.setViewport({ width, height: width === 390 ? 844 : 900 })
      await revealActualState(page, state, seed)
      const after = await assertActualState(page, state, seed, saved, width)
      await page.screenshot({ path: path.join(output, `${state}-${theme}-${width}.png`) })
      await assertActualState(page, state, seed, saved, width)
      const observationEndedAt = new Date().toISOString()
      const observedLifecycle = structuredClone(lifecycleRecords)
      const fetchRecords = await page.evaluate(() => window.__uniosQaFetch)
      const cancellations = classifyRequestCancellations(state, saved, failedRequests, observedLifecycle, fetchRecords, seed, after)
      const numeric = Object.values(lhr.audits).filter(audit => typeof audit.score === 'number')
      const summary = { state, theme, width, url: page.url().replace(preview, ''),
        lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime,
        accessibilityScore: Math.round(lhr.categories.accessibility.score * 100),
        numericAuditsChecked: numeric.length,
        belowFullScoreIncludingUnweighted: numeric.filter(audit => audit.score < 1).map(audit => ({
          id: audit.id, score: audit.score, title: audit.title, details: audit.details,
        })), runtimeError: lhr.runtimeError ?? null, runWarnings: lhr.runWarnings,
        pageErrors: structuredClone(pageErrors), consoleErrors: structuredClone(consoleErrors),
        failedResponses: structuredClone(failedResponses), failedRequests: structuredClone(failedRequests),
        expectedRequestCancellations: structuredClone(cancellations.expected),
        unexpectedRequestFailures: structuredClone(cancellations.unexpected), observationEndedAt,
        nativeFetchRecords: fetchRecords, lifecycleRecords, teardownRequestFailures, geometryBefore: before, geometryAfter: after }
      reports.push(summary)
      console.log(`${state} ${theme} ${width}: ${summary.accessibilityScore}; numeric ${numeric.length}, below 1 ${summary.belowFullScoreIncludingUnweighted.length}`)
    } catch (error) {
      const file = `${state}-${theme}-${width}-failure`
      await settleActualUi(page).catch(() => undefined)
      await page.screenshot({ path: path.join(output, `${file}.png`) })
      const observed = await page.evaluate(() => ({ url: location.href, scrollY: window.scrollY,
        sourcePager: document.querySelector('.reader-page-jump > summary')?.textContent.trim(),
        sourceDraft: document.querySelector('.reader-note-draft textarea')?.value }))
      const nativeFetchRecords = await page.evaluate(() => window.__uniosQaFetch ?? [])
      await writeFile(path.join(output, `${file}.json`), JSON.stringify({
        'SPDX-License-Identifier': 'AGPL-3.0-or-later', buildIndexSha256: buildHash, state, theme, width,
        error: String(error), observed, pageErrors, consoleErrors, failedResponses, failedRequests, lifecycleRecords, nativeFetchRecords,
      }, null, 2) + '\n')
      throw error
    } finally { phase = 'teardown'; await page.close() }
  }
  if (await hashBuild() !== buildHash) throw new Error('Der Produktbuild wurde während der Abnahme geändert')
  await writeFile(path.join(output, sourceOnly ? 'lighthouse-source-diagnostic-summary.json' : 'lighthouse-accessibility-summary.json'), JSON.stringify({ metadata: {
    'SPDX-License-Identifier': 'AGPL-3.0-or-later', date: '2026-10-07', syntheticFixturesOnly: true,
    buildIndexSha256: buildHash, method: 'Lighthouse snapshot of actual visible accepted-workspace UI',
    states, screenshots: expectedReports, diagnosticOnly: sourceOnly, screenshotAnimations: 'allow', finiteAnimationsSettled: true,
    stateVisibilityCheckedBeforeAndAfterScreenshot: true, documentOverflowChecked: true,
    sourcePageUrlAndPagerChecked: true, sourceDocumentScrollPreserved: true,
    runtimeConsoleAndPageErrorsChecked: true, requestFailuresChecked: true, fakeApiPort: 8194, fakeFrontendPort: 4194,
    syntheticPreviewOriginPort: 4194,
    passiveSnapshotGathering: true, actualViewportWidthChecked: true,
    practicePanelAndMobileTextWidthsChecked: true, requestLifecyclePhaseAndIdRecorded: true,
    runtimeWindowEndsBeforeOwnedPageClose: true, teardownRequestFailuresRecordedSeparately: true,
    scopedPredecessorCancellationRequiresCompletedReplacement: true,
    nativeKeyboardInputUsed: true, sourceDraftAndPracticeAnswerPersistenceChecked: true,
    sourceSaveAndPracticeSolutionEnabledChecked: true, nativeFetchAndPdfReaderOutcomesRecorded: true,
  }, reports }, null, 2) + '\n')
  if (reports.length !== expectedReports || reports.some(report => report.accessibilityScore !== 100 || report.runtimeError ||
    report.belowFullScoreIncludingUnweighted.length > 0 || report.runWarnings.length > 0 ||
    report.pageErrors.length > 0 || report.consoleErrors.length > 0 || report.failedResponses.length > 0 ||
    report.unexpectedRequestFailures.length > 0)) process.exitCode = 1
} finally {
  await browser?.close()
  for (const child of processes.reverse()) {
    if (!child.pid || child.exitCode !== null) continue
    if (process.platform === 'win32') {
      try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) }
      catch { /* This owned process may already have exited. */ }
    } else child.kill('SIGTERM')
  }
}
