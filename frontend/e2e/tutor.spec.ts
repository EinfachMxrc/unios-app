// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { expect, test } from './fixtures'

test('coding draft survives reload, deterministic reports and diff work', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/coding')
  await page.getByRole('combobox', { name: 'Kurs', exact: true }).selectOption({ index: 1 })
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('python')
  await page.getByRole('combobox', { name: 'Aufgabe', exact: true }).selectOption('reverse')
  await page.getByRole('button', { name: 'Aufgabe erstellen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Array umdrehen', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tests starten', exact: true }).click()
  await expect(page.getByText('1 von 10 Tests bestanden', { exact: true })).toBeVisible({ timeout: 20000 })
  const editor = page.getByRole('textbox', { name: 'Quelltext bearbeiten: Solution.py', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('def solve(values):\n    return values[::-1]\n')
  await expect(page.getByText('Lokal gesichert · noch nicht auf dem Server', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByText('Lokal gesichert · noch nicht auf dem Server', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
  await page.getByRole('button', { name: 'Tests starten', exact: true }).click()
  await expect(page.getByText('10 von 10 Tests bestanden', { exact: true })).toBeVisible({ timeout: 20000 })
  await page.getByRole('combobox', { name: 'Versuch', exact: true }).selectOption({ index: 1 })
  await page.getByRole('checkbox', { name: 'Mit Versuch vergleichen', exact: true }).check()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Mit Versuch vergleichen', exact: true }).uncheck()
  await page.getByRole('combobox', { name: 'Versuch', exact: true }).selectOption({ index: 0 })
  await page.getByRole('button', { name: 'Tutor-Paket für Work anfordern', exact: true }).click()
  await expect(page.getByText('Paket bereit. Work kann es nach deiner Freigabe über den Agent Gateway lesen.', { exact: true })).toBeVisible()
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(`test-results/coding-${theme}-${width}.png`), fullPage: true })
    }
  }
})

test('choice, math and exam enforce clear checking and locked hints', async ({ page }) => {
  const courses = await (await page.request.get('/api/courses')).json()
  const course = courses.courses[0].id
  await page.goto('/assessment')
  await page.getByText('Eigene Aufgabe anlegen', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Kurs', exact: true }).selectOption(String(course))
  await page.getByLabel('Titel', { exact: true }).fill('Stack-Prinzip')
  await page.getByLabel('Aufgabe', { exact: true }).fill('Welches Prinzip nutzt ein Stack?')
  await page.getByLabel('Auswahl oder Bausteine · je eine Zeile').fill('LIFO\nFIFO')
  await page.getByLabel('Erwartete Antwort').fill('LIFO')
  await page.getByRole('button', { name: 'Vorschlag speichern', exact: true }).click()
  await page.getByRole('button', { name: 'Aufgabe übernehmen', exact: true }).click()
  await page.getByRole('radio', { name: 'FIFO', exact: true }).check()
  await page.getByRole('combobox', { name: 'Wie sicher bist du?', exact: true }).selectOption('5')
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Noch nicht richtig', exact: true })).toBeVisible()
  await expect(page.getByText('Du warst sehr sicher. Diese Stelle lohnt sich beim nächsten Üben besonders.', { exact: true })).toBeVisible()
  const math = await (await page.request.post(`/api/learning/assessment/courses/${course}/tasks`, { data: { type: 'symbolic_math', title: 'Quadratische Gleichung', question: 'Bestimme alle Nullstellen.', expression: '2*x^2-8*x+6', math_operation: 'roots' } })).json()
  expect((await page.request.post(`/api/learning/assessment/tasks/${math.id}/accept`, { data: { confirmed: true } })).ok()).toBeTruthy()
  await page.goto(`/assessment?task=${math.id}`)
  await page.getByLabel('Antwort eingeben', { exact: true }).fill('1,3')
  await page.getByLabel('Rechenweg · ein Ausdruck oder eine Gleichung je Zeile').fill('x^2-4*x+3=0\n(x-1)*(x-3)=0')
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toBeVisible()
  await expect(page.getByText('Schritt 2: äquivalent', { exact: true })).toBeVisible()
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(`test-results/assessment-${theme}-${width}.png`), fullPage: true })
    }
  }
  const exam = await (await page.request.post('/api/learning/assessment/exams', { data: { task_ids: [math.id], minutes: 2, confirmed: true } })).json()
  await page.goto(`/assessment?task=${math.id}&exam=${exam.id}`)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText('Hilfe öffnen', { exact: true })).toHaveCount(0)
  await page.getByLabel('Antwort eingeben', { exact: true }).fill('1,3')
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Antwort abgegeben', exact: true })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toHaveCount(0)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Prüfung abgeben', exact: true }).click()
  await expect(page.getByText(/100\/100 objektive Punkte/)).toBeVisible()
})

test('ordering, free recall, oral transcript and scoped PDF requests work', async ({ page }) => {
  const courses = await (await page.request.get('/api/courses')).json()
  const course = courses.courses[0].id
  async function task(type: string, extra: Record<string, unknown> = {}) {
    const row = await (await page.request.post(`/api/learning/assessment/courses/${course}/tasks`, { data: { type, title: `Synthetic ${type}`, question: 'Synthetic question', ...extra } })).json()
    expect((await page.request.post(`/api/learning/assessment/tasks/${row.id}/accept`, { data: { confirmed: true } })).ok()).toBeTruthy()
    await page.goto(`/assessment?task=${row.id}`)
    return row.id
  }
  await task('parsons', { choices: ['start', 'finish'], expected: '[0,1]' })
  await page.getByRole('button', { name: 'Baustein 2 nach oben', exact: true }).click()
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ergebnis stimmt', exact: true })).toBeVisible()
  await task('free_recall', { concepts: ['base case'] })
  await page.getByLabel('Antwort eingeben', { exact: true }).fill('My explanation has a base case.')
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Antwort gespeichert · Tutor-Prüfung offen', exact: true })).toBeVisible()
  await task('oral', { concepts: ['recursion'] })
  await page.route('**/api/voice/transcribe', (route) => route.fulfill({ json: { transcript: 'Synthetic spoken answer', local: true, language: 'en' } }))
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en')
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: Buffer.from('synthetic-audio-fixture') })
  await expect(page.getByLabel('Transkript prüfen und ergänzen')).toHaveValue('Synthetic spoken answer')
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/)
  await page.getByRole('button', { name: 'Antwort prüfen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Antwort gespeichert · Tutor-Prüfung offen', exact: true })).toBeVisible()
  const material = await (await page.request.get('/api/search?q=Schleifen')).json()
  const version = material.results[0]?.version_id
  expect(version).toBeTruthy()
  await page.goto(`/assessment?course=${material.results[0].course_id}&version=${version}&page=1`)
  await page.getByRole('button', { name: 'Abschnitt für Work vorbereiten', exact: true }).click()
  await expect(page.getByText('Anfrage bereit. Work kann sie nach deiner Freigabe im Agent Gateway abholen. Es startet kein Agent automatisch.', { exact: true })).toBeVisible()
})
