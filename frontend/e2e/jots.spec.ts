// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

test.describe.configure({ mode: 'parallel' })

test('legacy query-only database upgrades without losing the capture store', async ({ page }) => {
  await page.goto('/manifest.webmanifest')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('marc-uni-os-private', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('queries')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          open.result.close()
          resolve()
        }
      }),
  )
  await page.goto('/jots')
  await page.getByRole('textbox', { name: 'Schnell erfassen' }).fill('Gedanke nach Speicherupgrade')
  await page.getByRole('button', { name: 'Festhalten' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Gesichert.' })).toBeVisible()
  await expect(page.getByRole('article').filter({ hasText: 'Gedanke nach Speicherupgrade' })).toBeVisible()
})

test('quick capture works offline, retries once and can be assigned', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Schnellnotizen …' }).click()
  await expect(page.getByRole('textbox', { name: 'Schnell erfassen' })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline – Stand:/)).toBeVisible()
  await page.getByRole('button', { name: 'Schnellnotizen …' }).click()
  await page.getByRole('combobox', { name: 'Art der Schnellnotiz' }).selectOption('question')
  await page.getByRole('textbox', { name: 'Schnell erfassen' }).fill('Warum ist die Matrix invertierbar?')
  await page.getByRole('button', { name: 'Festhalten' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Gesichert.' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Schnell erfassen' }).fill('Noch eine Frage')
  await expect(page.getByRole('status').filter({ hasText: 'Gesichert.' })).toHaveCount(0)
  await expect(page.getByText('1 Eintrag zur Übertragung vorgemerkt.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('1 Eintrag zur Übertragung vorgemerkt.')).toBeVisible()
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Schnellnotizen', exact: true }).click()
  await expect(page.getByText('1 vorgemerkt')).toBeVisible()
  await expect(page.getByText('Warum ist die Matrix invertierbar?')).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText('1 vorgemerkt')).toHaveCount(0, { timeout: 20_000 })
  const jot = page.getByRole('article').filter({ hasText: 'Warum ist die Matrix invertierbar?' })
  await expect(jot).toBeVisible()
  await jot.getByRole('button', { name: 'Zuordnung und Mitschrift' }).click()
  await jot
    .getByRole('combobox', { name: 'Kurs für Warum ist die Matrix invertierbar?' })
    .selectOption({ label: 'Programmieren 1' })
  await jot.getByRole('button', { name: 'Zuordnen' }).click()
  await expect(jot.locator('p.row-subtitle').filter({ hasText: 'Programmieren 1' })).toBeVisible()
  await page.goto('/search')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('invertierbar')
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('link', { name: /invertierbar/ })).toBeVisible()
  await page.getByRole('link', { name: /invertierbar/ }).click()
  await expect(page.getByRole('article').filter({ hasText: 'Warum ist die Matrix invertierbar?' })).toBeVisible()

  const output = path.resolve(import.meta.dirname, '../test-results/screenshots/phase2')
  await mkdir(output, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('unios-theme', value), theme)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 850 })
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Schnell erfassen' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(path.join(output, `jots-${theme}-${width}.png`)), fullPage: true })
    }
  }
})

test('explicit note copy keeps the original jot, deduplicates its source and protects local drafts', async ({
  page,
}) => {
  const generation = (await (await page.request.get('/api/host')).json()).generation
  const headers = { 'X-UniOS-Lease-Generation': String(generation) }
  const created = await page.request.post('/api/notes', {
    headers,
    data: { course_id: 1, resource_id: null, title: 'Synthetische Mitschrift', body: 'Vorhandener Unterrichtstext' },
  })
  expect(created.status()).toBe(201)
  const initial = await created.json()
  const jotId = crypto.randomUUID()
  const body = 'Synthetischer Gedanke zur Matrix'
  const captured = await page.request.post('/api/jots', {
    headers,
    data: {
      id: jotId,
      kind: 'thought',
      body,
      course_id: 1,
      note_id: initial.note.id,
      created_at: new Date().toISOString(),
    },
  })
  expect(captured.status()).toBe(200)
  await page.goto(`/jots#jot-${jotId}`)
  const row = page.locator(`#jot-${jotId}`)
  await expect(row).toBeVisible()
  await expect(row.getByRole('combobox')).toHaveCount(0)
  await row.getByRole('button', { name: 'Zuordnung und Mitschrift' }).click()
  const copy = row.getByRole('button', { name: 'In Mitschrift übernehmen' })
  await copy.click()
  await expect(row.getByRole('status')).toContainText('Text in der Mitschrift ergänzt.')
  const first = await (await page.request.get(`/api/notes/${initial.note.id}`)).json()
  expect(first.body).toBe(`Vorhandener Unterrichtstext\n\n${body}\n\n[Ursprüngliche Schnellnotiz](/jots#jot-${jotId})`)
  expect(first.note.current_revision).toBe(2)
  await copy.click()
  await expect(row.getByRole('status')).toContainText('bereits als Quelle verknüpft')
  expect((await (await page.request.get(`/api/notes/${initial.note.id}`)).json()).note.current_revision).toBe(2)
  const original = (await (await page.request.get(`/api/jots?jot_id=${jotId}`)).json()).jots[0]
  expect(original.body).toBe(body)
  expect(original.course_id).toBe(1)
  expect(original.note_id).toBe(initial.note.id)

  await page.evaluate(
    (note) =>
      localStorage.setItem(
        `unios:note-draft:v1:${note.id}`,
        JSON.stringify({
          noteId: note.id,
          baseRevision: note.current_revision,
          baseTitle: note.title,
          baseBody: 'Host baseline',
          title: note.title,
          body: 'Lokaler ungesicherter Entwurf',
          updatedAt: Date.now(),
          deviceId: 'synthetic-device',
          writeId: crypto.randomUUID(),
        }),
      ),
    first.note,
  )
  await copy.click()
  await expect(row.getByRole('alert')).toContainText('hat einen lokalen Entwurf')
  const retained = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`unios:note-draft:v1:${id}`) ?? 'null'),
    first.note.id,
  )
  expect(retained.body).toBe('Lokaler ungesicherter Entwurf')
  expect((await (await page.request.get(`/api/notes/${initial.note.id}`)).json()).note.current_revision).toBe(2)
})

test('palette capture and standby protection', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Schnell erfassen' }).fill('Ein Gedanke aus der Palette')
  await page.getByRole('dialog').getByRole('button', { name: 'Festhalten' }).click()
  await expect(page.getByRole('dialog').getByText(/Gesichert/)).toBeVisible()
  await page.goto('http://127.0.0.1:4174/jots')
  await expect(page.getByText('Auf diesem Gerät nur lesen', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Schnell erfassen' })).toBeDisabled()
  const blocked = await page.request.post('http://127.0.0.1:8174/api/jots', {
    data: {
      id: crypto.randomUUID(),
      kind: 'thought',
      body: 'Gesperrt',
      created_at: new Date().toISOString(),
    },
  })
  expect(blocked.status()).toBe(423)
})
