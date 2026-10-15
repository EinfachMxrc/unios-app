// SPDX-License-Identifier: AGPL-3.0-or-later
/** Real built calendar UI; isolated fake service and invented browser fixtures only. */
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { calendarNow, calendarEvents, calendarStatus, calendarDeadlines } from '../frontend/e2e/calendar-fixtures.ts'

if (!process.argv.includes('--fake-data')) throw new Error('Nur mit --fake-data ausführen')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend'), require = createRequire(path.join(frontend, 'package.json'))
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href)
const { snapshot } = await import(pathToFileURL(require.resolve('lighthouse')).href)
const requestedOutput = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length)
const output = path.resolve(root, requestedOutput || 'docs/qa/calendar-apple-20261007')
if (!output.startsWith(root + path.sep)) throw new Error('QA-Ausgabe muss im Projekt liegen')
const rawOutput = path.join(root, 'dist/research/calendar-lighthouse')
const api = 'http://127.0.0.1:8198', preview = 'http://127.0.0.1:4198'
const processes = [], reports = []
let browser
async function start(command, args, cwd, env, health) {
  try { await fetch(health, { signal: AbortSignal.timeout(1000) }); throw new Error(`Fake-Port bereits belegt: ${health}`) }
  catch (error) { if (error.message.startsWith('Fake-Port')) throw error }
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: 'ignore' })
  processes.push(child)
  let launchError
  child.on('error', error => { launchError = error })
  for (let attempt = 0; attempt < 60; attempt++) {
    if (launchError) throw launchError
    if (child.exitCode !== null) throw new Error('Eigener Fake-Dienst konnte nicht starten')
    try { if ((await fetch(health, { signal: AbortSignal.timeout(1000) })).ok) return }
    catch { /* Newly created service is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Eigener Fake-Dienst antwortet nicht')
}
async function click(page, name, scope = 'body') {
  await page.waitForFunction((name, scope) => [...document.querySelectorAll(`${scope} button`)]
    .some(button => (button.getAttribute('aria-label') || button.textContent.trim()) === name), {}, name, scope)
  await page.evaluate((name, scope) => [...document.querySelectorAll(`${scope} button`)]
    .find(button => (button.getAttribute('aria-label') || button.textContent.trim()) === name).click(), name, scope)
}
try {
  await mkdir(output, { recursive: true }); await mkdir(rawOutput, { recursive: true })
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  await start(python, ['-m', 'uvicorn', 'tests.fake_servers.phase1_app:app', '--host', '127.0.0.1', '--port', '8198'],
    root, { LIBREOFFICE_BIN: '/missing/soffice' }, `${api}/health`)
  await start(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), 'preview', '--configLoader',
    'native', '--host', '127.0.0.1', '--port', '4198', '--strictPort'], frontend, { UNIOS_API_TARGET: api }, preview)
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32'
    ? path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  browser = await puppeteer.launch({ executablePath, headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) for (const kind of ['week', 'month', 'event', 'editor']) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900 })
    await page.emulateTimezone('Europe/Berlin')
    await page.evaluateOnNewDocument((theme, stamp) => {
      localStorage.setItem('unios-theme', theme)
      sessionStorage.setItem('unios-workspace-session-v1', JSON.stringify([
        ['calendar:day', stamp.slice(0, 10)], ['calendar:past', true],
      ]))
    }, theme, calendarNow)
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      const fixture = url.pathname === '/api/timetable/status' ? calendarStatus
        : url.pathname === '/api/timetable/events' ? calendarEvents.map(event => ({ ...event, revision: 'a'.repeat(64), personal: false, adjusted: false, series_count: 2, series_revision: 'b'.repeat(64), series_adjusted: false }))
        : url.pathname === '/api/deadlines' ? calendarDeadlines : null
      if (fixture) void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
      else void request.continue()
    })
    await page.goto(`${preview}/deadlines`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="timetable-event-9004"]')
    if (kind === 'month') { await click(page, 'Abgaben', '.deadline-page-switch'); await click(page, 'Kalender', '.view-switch[aria-label="Fristenansicht"]'); await page.waitForSelector('.deadline-selected-agenda') }
    if (kind === 'event' || kind === 'editor') { await page.$eval('[data-testid="timetable-event-9004"] [data-calendar-trigger]', button => button.click()); await page.waitForSelector('.calendar-event-dialog') }
    if (kind === 'editor') { await click(page, 'Bearbeiten', '.calendar-event-dialog'); await page.waitForSelector('.calendar-edit-form') }
    await page.evaluate(() => document.fonts.ready)
    const selector = kind === 'month' ? '.deadline-calendar' : kind === 'event' || kind === 'editor' ? '.calendar-event-dialog' : '#timetable'
    await (await page.$(selector)).screenshot({ path: path.join(output, `${kind}-${theme}-${width}.png`) })
    const { lhr } = await snapshot(page, { config: { extends: 'lighthouse:default', settings: {
      onlyCategories: ['accessibility'], formFactor: width === 390 ? 'mobile' : 'desktop', screenEmulation: { disabled: true },
    } } })
    await writeFile(path.join(rawOutput, `${kind}-${theme}-${width}.json`), JSON.stringify(lhr))
    reports.push({ kind, theme, width, lighthouseVersion: lhr.lighthouseVersion,
      accessibilityScore: Math.round(lhr.categories.accessibility.score * 100), runtimeError: lhr.runtimeError ?? null,
      belowFullScore: Object.values(lhr.audits).filter(audit => typeof audit.score === 'number' && audit.score < 1)
        .map(audit => ({ id: audit.id, title: audit.title, details: audit.details })) })
    console.log(`${kind} ${theme} ${width}: ${reports.at(-1).accessibilityScore}`)
    if (kind === 'event' || kind === 'editor') await click(page, 'Termin schließen')
    await page.close()
  }
  await writeFile(path.join(output, 'lighthouse-summary.json'), JSON.stringify({ _spdx: 'SPDX-License-Identifier: AGPL-3.0-or-later', syntheticFixturesOnly: true,
    method: 'Lighthouse snapshots of built calendar views and event dialogs', measuredAt: new Date().toISOString(),
    buildIndexSha256: createHash('sha256').update(await readFile(path.join(frontend, 'dist/index.html'))).digest('hex'), reports,
  }, null, 2) + '\n')
  if (reports.some(report => report.accessibilityScore < 90 || report.runtimeError)) process.exitCode = 1
} finally {
  await browser?.close()
  for (const child of processes.reverse()) {
    if (!child.pid || child.exitCode !== null) continue
    if (process.platform === 'win32') {
      try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) }
      catch { /* Only this run's owned process may have already exited. */ }
    } else child.kill('SIGTERM')
  }
}
