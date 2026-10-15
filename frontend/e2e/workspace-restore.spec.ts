// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('page 47, zoom and exact scroll offset survive a trip to notes', async ({ page }) => {
  const fixture = await page.request.get('/api/__test__/long-reader.pdf?pages=60')
  const pdf = await fixture.body()
  await page.route('**/files/*/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
  await page.goto('/courses/1')
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await page.locator('.material-view-options > summary').click()
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click()
  await page.locator('[data-reader-page="47"]').scrollIntoViewIfNeeded()
  await expect(page.locator('.material-pager')).toContainText('Seite 47 von 60')
  await expect(page.locator('[data-material-page="47"] canvas')).toBeVisible()
  const offset = await page.evaluate(() => scrollY)
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Neue Notiz' }).click()
  await expect(page).toHaveURL(/notes/)
  await page.goBack()
  await expect(page.locator('.material-reader')).toHaveAttribute('data-zoomed', 'true')
  await expect(page.locator('.material-pager')).toContainText('Seite 47 von 60')
  await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - offset)).toBeLessThan(4)
  expect(await page.locator('.material-pages canvas').count()).toBeLessThan(13)
})

test('mobile reload preserves the exact source offset after a notes modal stays open beyond six seconds', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const response = await page.request.post('/api/__test__/focus-workspace')
  expect(response.ok()).toBeTruthy()
  const seed = await response.json()
  await page.clock.install()
  await page.goto(`/learning/focus/course/${seed.course_id}?mode=source&version=${seed.version_id}&page=12`)
  const reader = page.locator('.material-reader')
  const canvas = page.locator('[data-material-page="12"] canvas')
  const modal = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  let offset = 0
  const capture = async (phase: string) => {
    const state = await page.evaluate(() => {
      const locationKey = document.querySelector<HTMLElement>('main[data-workspace-key]')?.dataset.workspaceKey
      const historyKey = `history:${location.pathname}${location.search}${location.hash}:${locationKey}`
      const stored = JSON.parse(sessionStorage.getItem('unios-workspace-session-v1') || '[]') as [string, unknown][]
      const source = document.querySelector<HTMLElement>('.material-reader')
      const bodyStyle = getComputedStyle(document.body)
      const button = [...document.querySelectorAll('button')].find(
        (node) => node.getAttribute('aria-label') === 'Mitschrift' || node.textContent?.trim() === 'Mitschrift',
      )
      const bounds = button?.getBoundingClientRect()
      return {
        button_bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
        scroll_y: scrollY,
        history_key: historyKey,
        saved_history: stored.find(([key]) => key === historyKey)?.[1],
        reader_ready: source?.dataset.readerPositionReady,
        reader_pending: source?.dataset.workspacePending,
        pager: document.querySelector('.material-pager')?.textContent,
        active_canvas_pages: [...document.querySelectorAll('.material-pages canvas')].map(
          (node) => node.closest<HTMLElement>('[data-reader-page]')?.dataset.readerPage,
        ),
        modal: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
        body: { position: bodyStyle.position, top: bodyStyle.top, overflow: bodyStyle.overflow },
      }
    })
    await testInfo.attach(`mobile-source-${phase}.json`, {
      contentType: 'application/json',
      body: JSON.stringify({ expected_offset: offset, ...state }),
    })
  }
  try {
    await expect(reader).toHaveAttribute('data-reader-position-ready', 'true')
    await expect(canvas).toBeInViewport()
    await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
    const initialOffset = await page.evaluate(() => scrollY)
    const canvasBounds = (await canvas.boundingBox())!
    await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, Math.max(180, canvasBounds.y + 80))
    await page.mouse.wheel(0, 37)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(initialOffset + 20)
    await page.clock.runFor(180) // Complete the history's actual 120ms capture debounce.
    offset = await page.evaluate(() => scrollY)
    await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const locationKey = document.querySelector<HTMLElement>('main[data-workspace-key]')!.dataset.workspaceKey
          const historyKey = `history:${location.pathname}${location.search}${location.hash}:${locationKey}`
          const stored = JSON.parse(sessionStorage.getItem('unios-workspace-session-v1') || '[]') as [
            string,
            { y: number; width: number },
          ][]
          return stored.find(([key]) => key === historyKey)?.[1]
        }),
      )
      .toMatchObject({ y: offset, width: 390 })
    await capture('before-open')
    const openNotes = page.getByRole('button', { name: 'Mitschrift', exact: true })
    await expect(openNotes).toBeInViewport({ ratio: 1 })
    await openNotes.click()
    await expect(modal).toHaveAttribute('aria-modal', 'true')
    await page.clock.runFor(180)
    await capture('before-reload')
    await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - offset)).toBeLessThan(4)
    await page.reload()
    await expect(modal).toHaveAttribute('aria-modal', 'true')
    await expect(reader).toHaveAttribute('data-workspace-pending', 'true')
    await capture('after-reload')
    await page.clock.runFor(6500)
    await expect(modal).toBeVisible()
    await expect(reader).toHaveAttribute('data-workspace-pending', 'true')
    await capture('after-six-seconds')
    await modal.getByRole('button', { name: 'Markierungen schließen', exact: true }).click()
    await expect(modal).toHaveCount(0)
    await expect(reader).toHaveAttribute('data-reader-position-ready', 'true')
    await capture('after-close-ready')
    await expect(page.locator('.material-pager')).toContainText('Seite 12 von 120')
    await expect(canvas).toBeInViewport()
    await expect(page.locator('[data-material-page="12"] [data-reader-render-active="true"]')).toHaveAttribute(
      'data-reader-render-complete',
      'true',
    )
    await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - offset)).toBeLessThan(4)
  } finally {
    if (!page.isClosed()) {
      try {
        await capture('finally')
      } catch (error) {
        await testInfo.attach('mobile-source-capture-error.txt', { contentType: 'text/plain', body: String(error) })
      }
    }
  }
})

test('back restores the submitted query and filter rather than the newer search', async ({ page }) => {
  await page.goto('/search?q=Schleifen&course_id=1')
  await expect(page.getByRole('textbox', { name: 'Suchbegriff' })).toHaveValue('Schleifen')
  await page.getByRole('textbox', { name: 'Suchbegriff' }).fill('Rekursion')
  await page.locator('.search-form button[type="submit"]').click()
  await expect(page).toHaveURL(/q=Rekursion/)
  await page.goBack()
  // The unsent input belonged to the earlier entry, while its submitted query remains in the URL.
  await expect(page).toHaveURL(/q=Schleifen/)
  await expect(page.getByRole('combobox', { name: 'Kurs filtern' })).toHaveValue('1')
  await expect(page.getByRole('textbox', { name: 'Suchbegriff' })).toHaveValue('Rekursion')
})

test('editor returns in editing mode with its content and cursor intact', async ({ page }) => {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Cursor-Test', body: 'Basisfall beendet die Rekursion.' },
  })
  expect(response.ok()).toBeTruthy()
  const id = (await response.json()).note.id
  await page.goto(`/notes?id=${id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.locator('.studio-document')
  await expect(editor).toContainText('Basisfall beendet die Rekursion.')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('ArrowLeft')
  const cursor = await page.evaluate(() => ({
    text: getSelection()?.anchorNode?.textContent,
    offset: getSelection()?.anchorOffset,
  }))
  await page.locator('.app-nav a[href="/courses"]').click()
  await page.goBack()
  await expect(editor).toContainText('Basisfall beendet die Rekursion.')
  await expect
    .poll(() =>
      page.evaluate(() => ({ text: getSelection()?.anchorNode?.textContent, offset: getSelection()?.anchorOffset })),
    )
    .toEqual(cursor)
})

test.describe('touch source preview', () => {
  test.use({ hasTouch: true })
  test('opens a bottom sheet, closes without reopening and opens the selected note', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const target = await (
      await page.request.post('/api/notes', {
        data: { course_id: 1, title: 'VorschauTest', body: 'Eine gezielte Quellenvorschau.' },
      })
    ).json()
    const source = await (
      await page.request.post('/api/notes', {
        data: { course_id: 1, title: 'Verknüpfte Notiz', body: 'Siehe [[VorschauTest]].' },
      })
    ).json()
    await page.goto(`/notes?id=${source.note.id}`)
    const link = page.locator('.rendered-note').getByRole('link', { name: 'VorschauTest', exact: true })
    const preview = page.getByRole('dialog', { name: 'Vorschau: VorschauTest' })
    // Cached previews open immediately too; closing must cancel hover timers.
    for (let round = 0; round < 5; round++) {
      await link.tap()
      await expect(preview).toBeVisible()
      await expect(preview).toContainText('Eine gezielte Quellenvorschau.')
      const box = await preview.boundingBox()
      expect(box!.x).toBe(0)
      expect(box!.width).toBe(390)
      expect(box!.y + box!.height).toBeLessThanOrEqual(844)
      await preview.getByRole('button', { name: 'Vorschau schließen', exact: true }).tap()
      await expect(preview).toHaveCount(0)
      await expect(page).toHaveURL(new RegExp(`id=${source.note.id}`))
    }
    await link.tap()
    await preview.getByRole('link', { name: 'Notiz öffnen', exact: true }).tap()
    await expect(page).toHaveURL(new RegExp(`id=${target.note.id}`))
  })
})
