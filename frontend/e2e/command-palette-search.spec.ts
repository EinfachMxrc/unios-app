// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { paletteSearchFixture } from '../src/components/commandPalette.testFixtures'

async function openPalette(page: Page) {
  await page.goto('/courses')
  // goto can finish before the asynchronous app shell and its keyboard listener
  // mount. Wait for the rendered screen before sending the shortcut.
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
  const trigger = page.getByRole('button', { name: /^Suche in Kursen und Dateien (Strg|⌘) K Befehlspalette öffnen$/ })
  await expect(trigger).toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Befehlspalette', exact: true })
  await expect(dialog).toBeVisible()
  return dialog.getByLabel('Befehl suchen', { exact: true })
}

test('Cmd+K includes every content type and opens an own note through keyboard navigation', async ({ page }) => {
  const created = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'synthetic-note-0', body: 'Synthetic keyboard destination.' },
  })
  expect(created.ok()).toBeTruthy()
  const noteId = (await created.json()).note.id as string
  const response = paletteSearchFixture(50)
  response.note_results[0].id = noteId
  await page.route(
    (url) => url.pathname === '/api/search',
    (route) => route.fulfill({ json: response }),
  )
  const input = await openPalette(page)
  await input.fill('synthetic')
  const hits = page.locator('.command-results .command-hit')
  await expect(hits).toHaveCount(7)
  await expect(hits.locator('strong')).toHaveText([
    'synthetic-document-0',
    'synthetic-annotation-0',
    'synthetic-announcement-0',
    'synthetic-course-note-0',
    'synthetic-note-0',
    'synthetic-jot-0',
    'synthetic-clip-0',
  ])
  for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowDown')
  await expect(hits.nth(4)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/notes\\?id=${noteId}$`))
  await expect(page.locator('.rendered-note')).toContainText('Synthetic keyboard destination.')
})

test('one content type fills seven ranked slots and a forum hit keeps its external destination', async ({ page }) => {
  const notes = { ...paletteSearchFixture(0), note_results: paletteSearchFixture(15).note_results }
  const opened: { url: string; target: string; features: string }[] = []
  await page.exposeFunction('recordPaletteWindowOpen', (url: string, target: string, features: string) => {
    opened.push({ url, target, features })
  })
  await page.addInitScript(() => {
    window.open = (url, target, features) => {
      const record = (
        window as unknown as Window & {
          recordPaletteWindowOpen: (url: string, target: string, features: string) => Promise<void>
        }
      ).recordPaletteWindowOpen
      void record(String(url), target ?? '', features ?? '')
      return null
    }
  })
  await page.route(
    (url) => url.pathname === '/api/search',
    (route) =>
      route.fulfill({
        json: new URL(route.request().url()).searchParams.get('q') === 'notes' ? notes : paletteSearchFixture(50),
      }),
  )
  const input = await openPalette(page)
  await input.fill('notes')
  const hits = page.locator('.command-results .command-hit')
  await expect(hits.locator('strong')).toHaveText(Array.from({ length: 7 }, (_, index) => `synthetic-note-${index}`))
  await input.fill('forum')
  await expect(hits).toHaveCount(7)
  await page.getByRole('button', { name: /synthetic-announcement-0/ }).click()
  await expect
    .poll(() => opened)
    .toEqual([
      {
        url: 'https://example.org/forum/0',
        target: '_blank',
        features: 'noopener,noreferrer',
      },
    ])
  await expect(page).toHaveURL(/\/courses$/)
})

test('late old-query responses stay hidden after a change or a shortened input', async ({ page }) => {
  let releaseOld!: () => void
  let releaseShortened!: () => void
  let oldHandled!: () => void
  let shortenedHandled!: () => void
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const shortenedGate = new Promise<void>((resolve) => {
    releaseShortened = resolve
  })
  const oldDone = new Promise<void>((resolve) => {
    oldHandled = resolve
  })
  const shortenedDone = new Promise<void>((resolve) => {
    shortenedHandled = resolve
  })
  await page.route(
    (url) => url.pathname === '/api/search',
    async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') ?? ''
      if (query === 'old') await oldGate
      if (query === 'shortened') await shortenedGate
      try {
        await route.fulfill({ json: paletteSearchFixture(50, query) })
      } finally {
        if (query === 'old') oldHandled()
        if (query === 'shortened') shortenedHandled()
      }
    },
  )
  try {
    const input = await openPalette(page)
    const oldRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get('q') === 'old')
    await input.fill('old')
    await oldRequest
    await input.fill('latest')
    const hits = page.locator('.command-results .command-hit')
    await expect(hits.locator('strong').nth(4)).toHaveText('latest-note-0')
    releaseOld()
    await oldDone
    await expect(page.getByText('old-document-0', { exact: true })).toHaveCount(0)
    await expect(hits.locator('strong').nth(4)).toHaveText('latest-note-0')
    const shortRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get('q') === 'shortened')
    await input.fill('shortened')
    await shortRequest
    await input.fill('s')
    releaseShortened()
    await shortenedDone
    await expect(hits).toHaveCount(0)
    await expect(page.getByText('shortened-document-0', { exact: true })).toHaveCount(0)
    await input.fill('fresh')
    await expect(hits.locator('strong').nth(4)).toHaveText('fresh-note-0')
  } finally {
    // Always release intercepted requests so the shared fixture can unroute cleanly.
    releaseOld()
    releaseShortened()
  }
})
