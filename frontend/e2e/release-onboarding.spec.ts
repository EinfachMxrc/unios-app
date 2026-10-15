// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('first steps are available without terminal and the native demo command is explicit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: unknown) => {
          if (command === 'restart_backend') Object.assign(window, { releaseTestCommand: { command, args } })
          return null
        },
      },
    })
  })
  await page.goto('/welcome')
  await expect(page.getByRole('heading', { name: 'Dein Studium. Ein guter Anfang.' })).toBeVisible()
  await page.getByRole('button', { name: 'Demo ausprobieren' }).click()
  expect(await page.evaluate(() => (window as Window & { releaseTestCommand?: unknown }).releaseTestCommand)).toEqual({
    command: 'restart_backend',
    args: { mode: 'demo' },
  })
  await page.getByRole('button', { name: 'Meine Hochschule verbinden' }).click()
  await expect(page).toHaveURL(/\/setup$/)
})

test('import confirmation creates a new course note and preserves the supplied Markdown', async ({ page }) => {
  await page.goto('/import')
  await page.getByLabel('Dateien auswählen').setInputFiles({
    name: 'Mein Demo-Lernplan.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Demo-Lernplan\n\nEine klare Frage zu Schleifen.\n'),
  })
  await expect(page.getByRole('button', { name: 'Auswahl prüfen' })).toBeDisabled()
  await page.getByLabel('Kurs für die Notizen').selectOption({ label: 'Programmieren 1' })
  await page.getByRole('button', { name: 'Auswahl prüfen' }).click()
  await expect(page.getByText('Mein Demo-Lernplan.md', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Import bestätigen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Dateien übernommen' })).toBeVisible()
  const notes = await (await page.request.get('/api/notes')).json()
  const note = notes.notes.find((item: { title: string }) => item.title === 'Mein Demo-Lernplan')
  expect(note).toBeTruthy()
  const detail = await (await page.request.get(`/api/notes/${note.id}`)).json()
  expect(detail.body).toContain('Eine klare Frage zu Schleifen.')
  await page.getByRole('button', { name: 'Anki-Karten', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Anki-Import öffnen' })).toHaveAttribute('href', '/study')
  await page.getByRole('button', { name: 'Kalender abonnieren', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Kalender einrichten' })).toHaveAttribute('href', '/deadlines#timetable')
})

test('CSV preview requires confirmation and imports the exact selected note content', async ({ page }) => {
  await page.goto('/import')
  await page.getByRole('button', { name: 'CSV-Notizen', exact: true }).click()
  await page.getByLabel('Dateien auswählen').setInputFiles({
    name: 'notes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Title,Body\nCSV-Demo,"Ein Komma,\nund eine zweite Zeile."'),
  })
  await page.getByLabel('Kurs für die Notizen').selectOption({ label: 'Programmieren 1' })
  await page.getByRole('button', { name: 'Auswahl prüfen' }).click()
  await expect(page.getByText('1 neue Notizen. Vorschau der ersten zehn:')).toBeVisible()
  const before = await (await page.request.get('/api/notes')).json()
  expect(before.notes.some((note: { title: string }) => note.title === 'CSV-Demo')).toBe(false)
  await page.getByRole('button', { name: 'Import bestätigen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Notizen übernommen' })).toBeVisible()
  const after = await (await page.request.get('/api/notes')).json()
  const note = after.notes.find((item: { title: string }) => item.title === 'CSV-Demo')
  expect((await (await page.request.get(`/api/notes/${note.id}`)).json()).body).toBe(
    'Ein Komma,\nund eine zweite Zeile.',
  )
})

test('Work access is reviewed, sensitive categories stay off and the connection can be revoked', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })),
  )
  await page.goto('/ai')
  const wizard = page.locator('.agent-setup')
  await wizard.getByRole('checkbox', { name: 'Kurs für Work auswählen: Programmieren 1', exact: true }).check()
  await wizard.getByRole('button', { name: 'Auswahl prüfen' }).click()
  await expect(
    wizard.getByRole('checkbox', { name: 'Mail-Hinweise lesen (ohne Inhalt und Anhänge)' }),
  ).not.toBeChecked()
  await expect(wizard.getByRole('checkbox', { name: 'Prüfungsstatus lesen' })).not.toBeChecked()
  await wizard.getByRole('button', { name: 'Auswahl prüfen' }).click()
  await expect(wizard.getByText(/Work kann keine Moodle-Abgabe abschicken/)).toBeVisible()
  await wizard.getByRole('button', { name: 'Freigabe speichern und verbinden' }).click()
  await expect(wizard.getByRole('status')).toContainText('Verbindung aktiviert')
  const access = await (await page.request.get('/api/ai/access')).json()
  expect(
    access.courses
      .filter((course: { allowed: boolean }) => course.allowed)
      .map((course: { name: string }) => course.name),
  ).toEqual(['Programmieren 1'])
  expect(access.categories.mail).toBe(false)
  expect(access.categories.exam_status).toBe(false)
  await wizard.getByRole('button', { name: 'Work-Zugriff widerrufen' }).click()
  await expect(wizard.getByRole('status')).toContainText('Work-Zugriff deaktiviert')
  expect((await (await page.request.get('/api/ai/mcp/state')).json()).enabled).toBe(false)
})

test('release entry points remain readable in both themes on desktop and phone', async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })),
  )
  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/welcome')
      await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Dein Studium. Ein guter Anfang.' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`welcome-${theme}-${width}.png`), fullPage: true })
      await page.goto('/import')
      await expect(page.getByLabel('Dateien auswählen')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`import-${theme}-${width}.png`), fullPage: true })
      await page.goto('/ai')
      await expect(page.locator('.agent-setup')).toBeVisible()
      await page
        .locator('.agent-setup')
        .getByRole('checkbox', { name: 'Kurs für Work auswählen: Programmieren 1', exact: true })
        .check()
      await page.locator('.agent-setup').getByRole('button', { name: 'Auswahl prüfen' }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.locator('.agent-setup').screenshot({ path: testInfo.outputPath(`work-${theme}-${width}.png`) })
    }
  }
})
