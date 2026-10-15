// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('course project can be created, updated and archived', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Projekte' }).click()
  await page.goto('/more')
  await page.getByRole('link', { name: 'Projekte' }).click()
  await page.getByRole('button', { name: 'Neues Projekt' }).click()
  await page.getByRole('textbox', { name: 'Projektname' }).fill('Erfundene Semesterarbeit')
  await page.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  await page.getByRole('textbox', { name: 'GitHub-Repository (optional)' }).fill('team/repo')
  await page.getByRole('button', { name: 'To-do hinzufügen' }).click()
  await page.getByRole('textbox', { name: 'To-do 1' }).fill('Gliederung schreiben')
  await page.getByRole('button', { name: 'Mitglied hinzufügen' }).click()
  await page.getByRole('textbox', { name: 'Name Mitglied 1' }).fill('Alex')
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Erfundene Semesterarbeit' })).toBeVisible()
  await expect(page.getByText('Alex')).toBeVisible()
  await page.getByRole('button', { name: 'Verknüpfen', exact: true }).click()
  await page.getByRole('textbox', { name: 'Kurs, Projekt, Material oder Eintrag suchen' }).fill('Programmieren')
  await page.getByRole('list', { name: 'Suchergebnisse für Verknüpfungen' }).getByRole('button', { name: 'Verknüpfen' }).click()
  await expect(page.getByRole('link', { name: 'Programmieren 1' })).toHaveCount(2)
  await page.screenshot({ path: screenshotPath('test-results/projects-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: screenshotPath('test-results/projects-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Aktivität laden' }).click()
  await expect(page.getByText(/GITHUB_TOKEN lokal einrichten/)).toBeVisible()
  await page.getByRole('checkbox', { name: 'Gliederung schreiben' }).click()
  await expect(page.getByRole('checkbox', { name: 'Gliederung schreiben' })).toBeChecked()
  await page.getByRole('button', { name: 'Archivieren' }).click()
  await expect(page.getByText(/Archiviert am/)).toBeVisible()
  await page.getByRole('link', { name: 'Alle Projekte' }).click()
  await expect(page.getByText('Noch keine Projekte')).toBeVisible()
  await page.getByRole('button', { name: 'Archiv anzeigen' }).click()
  await expect(page.getByRole('link', { name: /Erfundene Semesterarbeit/ })).toBeVisible()
})

test('saved project code search shows file and line on the project page', async ({ page }) => {
  await page.route(/\/api\/projects\/\d+\/mirror$/, async (route) => {
    await route.fulfill({ json: { id: 1, repository: 'team/repo', fetched_at: '2026-09-25T12:00:00Z',
      refs_count: 1, head: 'a'.repeat(40) } })
  })
  await page.route(/\/api\/projects\/\d+\/mirror\/search\?/, async (route) => {
    await route.fulfill({ json: { snapshot_id: 1, head: 'a'.repeat(40), matches: [
      { path: 'src/main.py', line: 12, excerpt: 'def fictional_feature():' },
    ] } })
  })
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Projekte' }).click()
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Neues Projekt' }).click()
  await page.getByRole('textbox', { name: 'Projektname' }).fill('Erfundene Codesuche')
  await page.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  await page.getByRole('textbox', { name: 'GitHub-Repository (optional)' }).fill('team/repo')
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('link', { name: 'Gesicherten Code als ZIP herunterladen' }))
    .toHaveAttribute('href', /\/api\/projects\/\d+\/mirror\/archive/)
  await page.getByRole('textbox', { name: 'Gesicherten Code durchsuchen' }).fill('fictional')
  await page.getByRole('button', { name: 'Suchen', exact: true }).click()
  await expect(page.getByText('src/main.py:12')).toBeVisible()
  await expect(page.getByText('def fictional_feature():')).toBeVisible()
})

test('linked Moodle assignment starts the confirmed submission flow on the project page', async ({ page }) => {
  const head = 'a'.repeat(40)
  await page.route(/\/api\/projects\/\d+\/mirror$/, async (route) => {
    await route.fulfill({ json: { id: 1, repository: 'team/repo', fetched_at: '2026-09-25T12:00:00Z',
      refs_count: 1, head } })
  })
  await page.route(/\/api\/projects\/\d+\/mirror\/archive$/, async (route) => {
    await route.fulfill({ body: Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64'),
      contentType: 'application/zip', headers: { 'x-unios-archive-head': head } })
  })
  await page.request.post('/api/__test__/submission-write-reset')
  await page.request.put('/api/submissions/control', { data: { enabled: true } })
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Projekte' }).click()
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Neues Projekt' }).click()
  await page.getByRole('textbox', { name: 'Projektname' }).fill('Erfundene Projektabgabe')
  await page.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  await page.getByRole('textbox', { name: 'GitHub-Repository (optional)' }).fill('team/repo')
  await page.getByRole('group', { name: 'Moodle-Aufgaben' }).getByRole('checkbox').first().check()
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await page.getByRole('button', { name: 'Abgabe aus Projekt vorbereiten' }).click()
  await page.getByRole('button', { name: 'Dateiabgabe vorbereiten' }).click()
  await page.getByRole('button', { name: 'Gesicherten Projektstand als Datei wählen' }).click()
  await expect(page.getByText(/Ausgewählt: projekt-\d+-aaaaaaaaaaaa\.zip/)).toBeVisible()
  await page.getByRole('button', { name: 'Vorgaben und Dateien prüfen' }).click()
  await expect(page.getByText('Abgabe vor dem Senden prüfen')).toBeVisible()
  await expect(page.getByText(/projekt-\d+-aaaaaaaaaaaa\.zip · .*SHA-256/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Jetzt an Moodle senden' })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.request.put('/api/submissions/control', { data: { enabled: false } })
  await page.request.post('/api/__test__/submission-write-reset')
})
