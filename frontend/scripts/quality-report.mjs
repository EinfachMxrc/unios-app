// SPDX-License-Identifier: AGPL-3.0-or-later
import process from 'node:process'
import console from 'node:console'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const input = resolve(process.argv[2] ?? 'test-results')
const output = process.argv[3]
if (!output) throw new Error('Usage: node scripts/quality-report.mjs <test-results> <new-report.json>')
const rows = []
for (const name of await readdir(input)) {
  if (!name.startsWith('quality-missions-')) continue
  rows.push(JSON.parse(await readFile(resolve(input, name, 'mission.json'), 'utf8')))
}
rows.sort((a, b) => a.mission.localeCompare(b.mission, 'en'))
if (rows.length !== 20 || rows.some(row => row.fixture_only !== true || row.automated !== true)) throw new Error('Expected exactly 20 synthetic, automated missions')
const times = rows.map(row => row.elapsed_ms).sort((a, b) => a - b)
const report = { _spdx: 'SPDX-License-Identifier: AGPL-3.0-or-later', schema: 1, generated_at: new Date().toISOString(), fixture_only: true, automated: true,
  timing_includes: 'navigation, UI interaction, assertions; local fake server; no human usability measurement',
  click_definition: 'DOM click events, including keyboard activation; input fill and keyboard presses are not counted as clicks',
  error_definition: 'Playwright test errors; deliberately simulated offline and server failures are verified scenarios',
  missions: 20, passed: rows.filter(row => row.status === 'passed').length,
  errors: rows.reduce((sum, row) => sum + row.errors, 0), aborted: rows.filter(row => row.aborted).length,
  p50_ms: times[9], p95_ms: times[18], max_ms: times[19], cases: rows }
await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed: report.passed, missions: 20, p50_ms: report.p50_ms, p95_ms: report.p95_ms }))
if (report.passed !== 20) process.exitCode = 1
