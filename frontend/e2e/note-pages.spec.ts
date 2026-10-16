// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function note(page: Page, title: string, body = '## Meine Erklärung\n\nHier steht mein eigener Text.') {
  const response = await page.request.post('/api/notes', { data: { course_id: 1, title, body } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).note
}
async function partOf(page: Page, child: string, parent: string) {
  const response = await page.request.post('/api/links', {
    data: { from_type: 'note', from_id: child, to_type: 'note', to_id: parent, relation: 'part_of' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 1000 })
})

test('a scaffold creates a real subpage and its parent navigation survives reload', async ({ page }) => {
  const parent = await note(page, 'Mein Lernbereich')
  await page.goto(`/notes?id=${parent.id}`)
  await page.locator('.note-subpages').getByRole('link', { name: 'Unterseite erstellen', exact: true }).click()
  await expect(page.locator('.note-parent-context')).toContainText(parent.title)
  const title = page.getByRole('textbox', { name: 'Notiztitel', exact: true })
  await title.fill('Meine Unterseite')
  await page.getByRole('button', { name: 'Vorlesungsmitschrift', exact: true }).click()
  await expect(title).toHaveValue('Meine Unterseite')
  await expect(page.locator('.studio-document h2').first()).toHaveText('Die Grundidee')
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  await expect(page).toHaveURL(/\/notes\?course_id=1&id=[\da-f-]+$/)
  const childId = new URL(page.url()).searchParams.get('id')!
  expect(childId).not.toBe(parent.id)
  await expect(
    page.getByRole('navigation', { name: 'Übergeordnete Seiten', exact: true }).getByRole('link'),
  ).toContainText(parent.title)
  await page.reload()
  await expect(page.locator('.note-parent-pages')).toContainText(parent.title)
  await page.locator('.note-parent-pages a').click()
  await expect(
    page.locator('.note-subpages').getByRole('link', { name: 'Meine Unterseite', exact: true }),
  ).toBeVisible()
})

test('existing pages reject a hierarchy cycle and detaching never deletes the child', async ({ page }) => {
  const parent = await note(page, 'Übergeordnete Lernseite')
  const child = await note(page, 'Untergeordnete Lernseite')
  await partOf(page, child.id, parent.id)
  await page.goto(`/notes?id=${child.id}`)
  await page.getByRole('button', { name: 'Bestehende Seite hinzufügen', exact: true }).click()
  await page.getByRole('textbox', { name: 'Seitentitel suchen', exact: true }).fill('Übergeordnete Lernseite')
  await page.locator('.note-child-picker').getByRole('button', { name: parent.title, exact: true }).click()
  await expect(page.locator('.note-subpages').getByRole('alert')).toContainText('Kreis')
  await page.goto(`/notes?id=${parent.id}`)
  await page.getByRole('button', { name: `Unterseite ${child.title} lösen`, exact: true }).click()
  await expect(page.locator('.note-subpages').getByRole('link', { name: child.title, exact: true })).toHaveCount(0)
  expect((await page.request.get(`/api/notes/${child.id}`)).ok()).toBeTruthy()
  expect(
    (await (await page.request.get(`/api/links/note/${child.id}`)).json()).filter(
      (edge: { relation: string }) => edge.relation === 'part_of',
    ),
  ).toHaveLength(0)
})

test('a failed subpage placement retries its relationship after reload without creating a duplicate', async ({
  page,
}) => {
  const parent = await note(page, 'Lernbereich für Wiederholung')
  let creations = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/notes') creations++
  })
  await page.route('**/api/links', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { detail: 'Synthetischer Zuordnungsfehler' } })
      : route.continue(),
  )
  await page.goto(`/notes?id=${parent.id}`)
  await page.locator('.note-subpages').getByRole('link', { name: 'Unterseite erstellen', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notiztitel', exact: true }).fill('Genau eine neue Seite')
  await page.locator('.studio-document').fill('Dieser Inhalt bleibt gesichert.')
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  await expect(page.locator('.note-parent-pending')).toBeVisible()
  await expect(page.locator('.note-subpages').getByRole('alert')).toContainText('Synthetischer Zuordnungsfehler')
  await page.reload()
  await expect(page.locator('.note-subpages').getByRole('alert')).toContainText('Synthetischer Zuordnungsfehler')
  await page.unroute('**/api/links')
  await page.getByRole('button', { name: 'Zuordnung erneut versuchen', exact: true }).click()
  await expect(page.locator('.note-parent-pages')).toContainText(parent.title)
  await expect(page.locator('.note-parent-pending')).toHaveCount(0)
  expect(creations).toBe(1)
  const all = await (await page.request.get('/api/notes?course_id=1')).json()
  expect(all.notes.filter((item: { title: string }) => item.title === 'Genau eine neue Seite')).toHaveLength(1)
})

test('page appearance is personal to each page and existing drafts never get template replacement buttons', async ({
  page,
}) => {
  const first = await note(page, 'Breite Lernseite')
  const second = await note(page, 'Andere Lernseite')
  await page.goto(`/notes?id=${first.id}`)
  await page.getByText('Seitendarstellung', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Breite Seite', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Serifenschrift', exact: true }).check()
  await page.reload()
  await expect(page.locator('.note-canvas')).toHaveClass(/note-wide.*note-serif/)
  await page.goto(`/notes?id=${second.id}`)
  await expect(page.locator('.note-canvas')).not.toHaveClass(/note-wide|note-serif/)
  await page.goto('/notes?new=1&course_id=1')
  await page.getByRole('textbox', { name: 'Notiztitel', exact: true }).fill('Vorhandener Entwurf')
  await page.locator('.studio-document').fill('Mein vorhandener Text')
  await page.reload()
  await expect(page.locator('.studio-document')).toHaveText('Mein vorhandener Text')
  await expect(page.getByRole('button', { name: 'Vorlesungsmitschrift', exact: true })).toHaveCount(0)
})

for (const width of [1440, 390]) {
  test(`page structure and templates fit at ${width}px in both themes`, async ({ page }) => {
    const parent = await note(page, 'Mein Studienbereich')
    const child = await note(page, 'Grundlagen verstehen')
    await partOf(page, child.id, parent.id)
    await page.setViewportSize({ width, height: 960 })
    const directory = path.resolve('..', 'docs/qa/notion-note-pages-20261016')
    await mkdir(directory, { recursive: true })
    for (const theme of ['light', 'dark']) {
      for (const [name, url] of [
        ['page', `/notes?id=${parent.id}`],
        ['templates', `/notes?new=1&course_id=1&parent_id=${parent.id}`],
      ]) {
        await page.goto(url)
        if (name === 'page')
          await expect(
            page.locator('.note-subpages').getByRole('link', { name: child.title, exact: true }),
          ).toBeVisible()
        else await expect(page.getByRole('button', { name: 'Vorlesungsmitschrift', exact: true })).toBeVisible()
        await page.evaluate((value) => {
          localStorage.setItem('unios-theme', value)
          document.documentElement.classList.toggle('dark', value === 'dark')
        }, theme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.screenshot({
          path: path.join(directory, `${name}-${theme}-${width}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }
    }
  })
}
