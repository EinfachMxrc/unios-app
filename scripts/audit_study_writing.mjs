// SPDX-License-Identifier: AGPL-3.0-or-later

/** Snapshot the actual formula/logic dialogs using isolated synthetic data. */
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.argv.includes('--fake-data')) throw new Error('Nur mit --fake-data ausführen')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const require = createRequire(path.join(frontend, 'package.json'))
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href)
const { snapshot } = await import(pathToFileURL(require.resolve('lighthouse')).href)
const expanded = process.argv.includes('--expanded-tools')
const output = path.join(root, expanded ? 'docs/qa/study-tools-20261007' : 'docs/qa/study-writing-20261007')
const rawOutput = path.join(root, expanded ? 'dist/research/study-tools-lighthouse' : 'dist/research/study-writing-lighthouse')
const apiPort = expanded ? '8196' : '8194', previewPort = expanded ? '4196' : '4194'
const api = `http://127.0.0.1:${apiPort}`
const preview = `http://127.0.0.1:${previewPort}`
const processes = []
const reports = []
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
    catch { /* This newly created process needs time to start. */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Eigener Fake-Dienst antwortet nicht')
}

async function click(page, name) {
  await page.waitForFunction(name => [...document.querySelectorAll('button')].some(button =>
    (button.getAttribute('aria-label') || button.textContent.trim()) === name), {}, name)
  await page.evaluate(name => [...document.querySelectorAll('button')].find(button =>
    (button.getAttribute('aria-label') || button.textContent.trim()) === name).click(), name)
}

try {
  await mkdir(output, { recursive: true })
  await mkdir(rawOutput, { recursive: true })
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  await start(python, ['-m', 'uvicorn', 'tests.fake_servers.phase1_app:app', '--host', '127.0.0.1', '--port', apiPort],
    root, { LIBREOFFICE_BIN: '/missing/soffice' }, `${api}/health`)
  await start(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), 'preview', '--configLoader',
    'native', '--host', '127.0.0.1', '--port', previewPort, '--strictPort'], frontend, { UNIOS_API_TARGET: api }, preview)
  const response = await fetch(`${api}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_id: 1, title: 'Synthetische Mitschrift', body: 'Ein Beispiel.' }) })
  if (!response.ok) throw new Error('Synthetische Notiz konnte nicht angelegt werden')
  const note = (await response.json()).note
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32'
    ? path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  browser = await puppeteer.launch({ executablePath, headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900 })
    await page.evaluateOnNewDocument(theme => localStorage.setItem('unios-theme', theme), theme)
    await page.goto(`${preview}/notes?id=${note.id}`, { waitUntil: 'networkidle0' })
    await click(page, 'Bearbeiten')
    for (const kind of expanded ? ['formula', 'kv', 'number', 'diagram', 'recall', 'clip'] : ['formula', 'logic']) {
      if (kind === 'clip') {
        await page.goto(`${preview}/material/1`, { waitUntil: 'networkidle0' })
        await page.waitForSelector('[data-material-page="1"] canvas')
        await click(page, 'Bildausschnitt')
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(button =>
          button.textContent === 'In Mitschrift übernehmen' && !button.disabled))
      } else if (['number', 'diagram', 'recall'].includes(kind)) {
        await click(page, 'Lernwerkzeuge')
        await page.waitForSelector('[role="dialog"] select')
        await page.select('[role="dialog"] select', kind)
        if (kind === 'number') await page.type('[role="dialog"] input', '01011')
        if (kind === 'recall') {
          await page.type('[role="dialog"] textarea', 'Was bedeutet x?')
          await page.evaluate(() => document.querySelectorAll('[role="dialog"] textarea')[1].focus())
          await page.keyboard.type('Eine Variable.')
        }
      } else {
        await click(page, kind === 'formula' ? 'Formel' : 'Wahrheitstabelle')
        await page.waitForSelector(kind === 'formula' ? 'math-field' : '.logic-table')
        if (kind === 'kv') await page.select('[role="dialog"] select', 'kv')
      }
      if (kind === 'formula') {
        await click(page, 'Bruch')
        await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD')
        await page.keyboard.type('1'); await page.keyboard.press('Tab'); await page.keyboard.type('2')
      }
      await page.evaluate(() => document.fonts.ready)
      const { lhr } = await snapshot(page, { config: { extends: 'lighthouse:default', settings: {
        onlyCategories: ['accessibility'], formFactor: width === 390 ? 'mobile' : 'desktop', screenEmulation: { disabled: true },
      } } })
      const file = `${kind}-${theme}-${width}.json`
      await writeFile(path.join(rawOutput, file), JSON.stringify(lhr))
      reports.push({ kind, theme, width, lighthouseVersion: lhr.lighthouseVersion,
        accessibilityScore: Math.round(lhr.categories.accessibility.score * 100), runtimeError: lhr.runtimeError ?? null,
        belowFullScore: Object.values(lhr.audits).filter(audit => typeof audit.score === 'number' && audit.score < 1)
          .map(audit => ({ id: audit.id, title: audit.title, details: audit.details })) })
      console.log(`${kind} ${theme} ${width}: ${reports.at(-1).accessibilityScore}`)
      await click(page, 'Abbrechen')
    }
    await page.close()
  }
  await writeFile(path.join(output, 'lighthouse-summary.json'), JSON.stringify({ syntheticFixturesOnly: true,
    method: 'Lighthouse snapshots of actual open dialogs', measuredAt: new Date().toISOString(),
    buildIndexSha256: createHash('sha256').update(await readFile(path.join(frontend, 'dist/index.html'))).digest('hex'), reports,
  }, null, 2) + '\n')
  if (reports.some(report => report.accessibilityScore < 90 || report.runtimeError)) process.exitCode = 1
} finally {
  await browser?.close()
  for (const child of processes.reverse()) {
    if (!child.pid || child.exitCode !== null) continue
    if (process.platform === 'win32') {
      try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) }
      catch { /* Only an owned process may have already exited. */ }
    } else child.kill('SIGTERM')
  }
}
