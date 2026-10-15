// SPDX-License-Identifier: AGPL-3.0-or-later

/** Actual dialog/session/cards DOM snapshots; isolated fake data and existing dependencies. */
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.argv.includes('--fake-data')) throw new Error('Nur mit --fake-data ausführen')
const recovery = process.argv.includes('--recovery')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const require = createRequire(path.join(frontend, 'package.json'))
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href)
const { snapshot } = await import(pathToFileURL(require.resolve('lighthouse')).href)
const output = path.join(root, 'docs', 'qa', recovery ? 'study-recovery-20261007' : 'manual-source-cards-20261007')
const rawPrefix = recovery ? 'recovery-lighthouse' : 'manual-lighthouse'
const buildHash = createHash('sha256').update(await readFile(path.join(frontend, 'dist', 'index.html'))).digest('hex')
// Dedicated ports keep this isolated profile independent of the browser suite.
const api = 'http://127.0.0.1:8193'
const preview = 'http://127.0.0.1:4193'
const processes = []

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
    catch { /* Wait for this newly created local process. */ }
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

async function clickText(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button =>
    button.textContent.includes(text) || button.getAttribute('aria-label')?.includes(text)), {}, text)
  await page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button =>
      button.textContent.includes(text) || button.getAttribute('aria-label')?.includes(text))
    if (!button) throw new Error('Synthetischer UI-Schritt fehlt')
    button.click()
  }, text)
}

async function openDraft(page, seed) {
  await page.goto(`${preview}/material/${seed.version_id}?page=12`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-material-page="12"] canvas')
  await clickText(page, 'Markierungen & Fragen')
  await clickText(page, 'Als Lernkarte')
  await page.waitForSelector('[role="dialog"].manual-card-dialog')
  await page.waitForFunction(() => [...document.querySelectorAll('.manual-card-dialog button')]
    .some(button => button.textContent.includes('Speichern & freigeben') && !button.disabled))
}

async function editOwnQuestion(page, value) {
  await page.bringToFront()
  await page.evaluate(value => {
    const label = [...document.querySelectorAll('.manual-card-dialog label')]
      .find(label => label.textContent === 'Eigene Frage')
    const input = label && document.getElementById(label.htmlFor)
    if (!(input instanceof HTMLTextAreaElement) || input.disabled) throw new Error('Eigene Frage ist nicht editierbar')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await page.waitForFunction(value => {
    const dialog = document.querySelector('.manual-card-dialog')
    return dialog && [...dialog.querySelectorAll('textarea')].some(input => input.value === value) &&
      [...dialog.querySelectorAll('[role="status"]')].some(status => status.textContent.includes('Entwurf auf diesem Gerät gespeichert.'))
  }, {}, value)
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

async function assertActualState(page, state, cardId) {
  await page.evaluate(({ state, cardId }) => {
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
    const selector = state === 'session' ? '.study-session-answer' : state === 'cards' ? `#card-${cardId}` : '.manual-card-dialog'
    if (!visible(document.querySelector(selector))) throw new Error(`Audit-Zustand nicht sichtbar: ${state}`)
    if (state === 'conflict') {
      const alert = document.querySelector('.manual-card-dialog .manual-card-result [role="alert"]')
      const title = document.querySelector('.manual-card-copies h3')
      if (!alert?.textContent.includes('In einem anderen Fenster geändert') ||
          !title?.textContent.includes('Gesicherte Fassungen') || !visible(alert) || !visible(title)) {
        const describe = element => element && ({ text: element.textContent, visible: visible(element),
          rect: element.getBoundingClientRect().toJSON() })
        throw new Error(`Echter Konflikt und gesicherte Fassungen müssen im sichtbaren Dialog liegen: ${JSON.stringify({
          alert: describe(alert), title: describe(title), bodyScroll: document.querySelector('.manual-card-body')?.scrollTop,
          viewport: { width: window.innerWidth, height: window.innerHeight } })}`)
      }
      if (window.innerWidth > 600 && ['strong', 'blockquote', 'a'].some(selector =>
        !visible(document.querySelector(`.manual-card-dialog .manual-card-source ${selector}`)))) {
        throw new Error('Desktopquelle mit Titel, Zitat und Quellenlink muss beim Konflikt sichtbar bleiben')
      }
    }
  }, { state, cardId })
}

async function revealRecoveryRegion(page) {
  await page.evaluate(() => {
    const body = document.querySelector('.manual-card-body')
    const alert = document.querySelector('.manual-card-dialog .manual-card-result [role="alert"]')
    if (!body || !alert) throw new Error('Konfliktregion fehlt')
    body.scrollTop += alert.getBoundingClientRect().top - body.getBoundingClientRect().top - 12
  })
}

let browser
const reports = []
let savedCardId
try {
  await assertUnused(`${api}/health`)
  await assertUnused(preview)
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  await start(python, ['-m', 'uvicorn', 'tests.fake_servers.phase1_app:app', '--host', '127.0.0.1', '--port', '8193'], root,
    { LIBREOFFICE_BIN: '/missing/soffice' }, `${api}/health`)
  await start(process.execPath, [path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview',
    '--configLoader', 'native', '--host', '127.0.0.1', '--port', '4193', '--strictPort'], frontend,
    { UNIOS_API_TARGET: api }, preview)
  const seed = await json(`${api}/api/__test__/manual-card-scenario`, {})
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32'
    ? path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  browser = await puppeteer.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await openDraft(page, seed)
  await mkdir(output, { recursive: true })

  async function auditState(state, auditPage = page) {
    for (const theme of ['light', 'dark']) {
      await auditPage.evaluate(theme => {
        localStorage.setItem('theme', theme)
        document.documentElement.classList.toggle('dark', theme === 'dark')
      }, theme)
      for (const width of [1440, 390]) {
        let conflictScrollBefore
        await auditPage.setViewport({ width, height: width === 390 ? 844 : 900 })
        await auditPage.evaluate(() => document.fonts.ready)
        if (recovery) {
          await auditPage.bringToFront()
          await settleActualUi(auditPage)
          if (state === 'conflict') await revealRecoveryRegion(auditPage)
          await settleActualUi(auditPage)
          await assertActualState(auditPage, state, savedCardId)
          if (state === 'conflict') conflictScrollBefore = await auditPage.evaluate(() => document.querySelector('.manual-card-body').scrollTop)
        }
        const { lhr } = await snapshot(auditPage, { config: { extends: 'lighthouse:default',
          settings: { onlyCategories: ['accessibility'], formFactor: width === 390 ? 'mobile' : 'desktop',
            screenEmulation: { disabled: true } } } })
        const file = `${rawPrefix}-${state}-${theme}-${width}.json`
        await writeFile(path.join(root, file), JSON.stringify(lhr))
        const numeric = Object.values(lhr.audits).filter(audit => typeof audit.score === 'number')
        const summary = { state, theme, width, url: auditPage.url().replace(preview, ''),
          lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime,
          accessibilityScore: Math.round(lhr.categories.accessibility.score * 100),
          numericAuditsChecked: numeric.length,
          belowFullScoreIncludingUnweighted: numeric.filter(audit => audit.score < 1).map(audit => ({
            id: audit.id, score: audit.score, title: audit.title, details: audit.details })),
          runtimeError: lhr.runtimeError ?? null, runWarnings: lhr.runWarnings }
        reports.push(summary)
        console.log(`${state} ${theme} ${width}: ${summary.accessibilityScore}`)
        if (recovery) {
          await settleActualUi(auditPage)
          // Lighthouse audits may scroll controls; restore the actual recovery
          // region before capturing it without altering dialog state or motion.
          if (state === 'conflict') {
            const after = await auditPage.evaluate(() => document.querySelector('.manual-card-body').scrollTop)
            if (after !== conflictScrollBefore) console.log(`Lighthouse dialog scroll ${conflictScrollBefore} -> ${after}; recovery region restored`)
            await revealRecoveryRegion(auditPage)
          }
          await settleActualUi(auditPage)
          await assertActualState(auditPage, state, savedCardId)
          await auditPage.screenshot({ path: path.join(output, `${state}-${theme}-${width}.png`) })
          await assertActualState(auditPage, state, savedCardId)
        }
      }
    }
  }
  await auditState('dialog')
  if (recovery) {
    const second = await page.browserContext().newPage()
    await second.evaluateOnNewDocument(() => {
      // Match the stale-background E2E: notification delivery cannot replace IDB CAS.
      for (const type of ['storage', 'focus']) {
        window.addEventListener(type, event => event.stopImmediatePropagation(), true)
      }
      const addListener = BroadcastChannel.prototype.addEventListener
      BroadcastChannel.prototype.addEventListener = function (...args) {
        if (args[0] !== 'message') addListener.apply(this, args)
      }
      Object.defineProperty(BroadcastChannel.prototype, 'onmessage', {
        configurable: true, get: () => null, set: () => {},
      })
    })
    await second.setViewport({ width: 1440, height: 900 })
    await openDraft(second, seed)
    await editOwnQuestion(page, 'Fenster A: Meine Erklärung zum unveränderlichen Quellenbezug')
    await editOwnQuestion(second, 'Fenster B: Meine alternative Herleitung desselben Konzepts')
    await second.waitForFunction(() => document.querySelector('.manual-card-dialog')?.textContent
      .includes('In einem anderen Fenster geändert') && document.querySelector('.manual-card-copies h3')?.textContent
      .includes('Gesicherte Fassungen'))
    await auditState('conflict', second)
    await second.close()
  }
  const saved = await json(`${api}/api/anki/manual-cards`, { mutation_id: randomUUID(),
    front: seed.annotation.comment, back: seed.quote, topic: 'Synthetische Grundlagen',
    source: { version_id: seed.version_id, annotation_id: seed.annotation.id,
      expected_revision: seed.annotation.revision, page: seed.page } })
  if (saved.status !== 'pushed') throw new Error('Synthetische Anki-Karte fehlt')
  savedCardId = saved.queue_id
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${preview}/study/session/${encodeURIComponent(saved.deck_name)}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.study-session-card')
  await clickText(page, 'Antwort zeigen')
  await page.waitForSelector('.study-session-answer')
  await auditState('session')
  await page.goto(`${preview}/study/cards#card-${saved.queue_id}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector(`#card-${saved.queue_id}`)
  await auditState('cards')
  await writeFile(path.join(output, 'lighthouse-accessibility-summary.json'), JSON.stringify({
    metadata: { 'SPDX-License-Identifier': 'AGPL-3.0-or-later', date: '2026-10-07',
      syntheticFixturesOnly: true, buildIndexSha256: buildHash, method: 'Lighthouse snapshot of actual open UI',
      ...(recovery ? { states: ['dialog', 'conflict', 'session', 'cards'], sharedContextDraftConflict: true,
        conflictNotificationsSuppressed: ['BroadcastChannel', 'storage', 'focus'], screenshotAnimations: 'allow',
        conflictDesktopSourceVisibilityChecked: true } : {}) }, reports,
  }, null, 2) + '\n')
  if (reports.some(report => report.accessibilityScore < 90 || report.runtimeError ||
    report.belowFullScoreIncludingUnweighted.length > 0)) process.exitCode = 1
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
