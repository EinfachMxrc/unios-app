// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { documentText } from './noteEditor'

const qaDirectory = process.env.UNIOS_QA_DIRECTORY || 'docs/qa/reader-workspace-20261007'
const qaPrefix = process.env.UNIOS_QA_DIRECTORY ? 'reader-' : ''

async function openReader(page: Page, long = false) {
  await page.setViewportSize({ width: 1440, height: 900 })
  if (long) {
    const fixture = await page.request.get('/api/__test__/long-reader.pdf?pages=120')
    expect(fixture.ok()).toBeTruthy()
    const pdf = await fixture.body()
    await page.route('**/files/*/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
  }
  await page.goto('/courses/1')
  const link = page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
  const href = (await link.getAttribute('href'))!
  await link.click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  return Number(href.split('/').pop())
}

async function selectPassage(page: Page, number = 1) {
  await expect(
    page.locator(`[data-material-page="${number}"] .react-pdf__Page__textContent span`).first(),
  ).toBeVisible()
  return page.evaluate((number) => {
    const node = document.querySelector(
      `[data-material-page="${number}"] .react-pdf__Page__textContent span`,
    )?.firstChild
    if (!node) throw new Error('Missing PDF text layer')
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document
      .querySelector(`[data-material-page="${number}"]`)!
      .dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return node.textContent!
  }, number)
}

async function jump(page: Page, number: number) {
  await page.locator('.reader-page-jump > summary').click()
  await page.getByRole('spinbutton', { name: 'Zu Seite springen' }).fill(String(number))
  await page.locator('.reader-page-jump').getByRole('button', { name: 'Öffnen' }).click()
  await expect(page.locator(`[data-material-page="${number}"] canvas`)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
})

test('desktop keeps PDF interactive beside annotations and supports keyboard resizing', async ({ page }) => {
  await openReader(page)
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  const workspace = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
  await expect(workspace).toBeVisible()
  await expect(workspace).not.toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.material-side-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 2')
  await expect(workspace).toBeVisible()
  const separator = page.getByRole('separator', { name: 'Breite des Lernbereichs ändern' })
  const initialWidth = Number(await separator.getAttribute('aria-valuenow'))
  await separator.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(separator).toHaveAttribute('aria-valuenow', String(initialWidth + 20))
  await separator.press('Home')
  await expect(separator).toHaveAttribute('aria-valuenow', '320')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

for (const pageCount of [1, 2]) {
  test(`mobile drawer returns keyboard focus to a visible page jump on page one of ${pageCount}`, async ({ page }) => {
    const fixture = await page.request.get(`/api/__test__/long-reader.pdf?pages=${pageCount}`)
    expect(fixture.ok()).toBeTruthy()
    const pdf = await fixture.body()
    await page.route('**/files/*/inline', (route) => route.fulfill({ contentType: 'application/pdf', body: pdf }))
    await openReader(page)
    await page.setViewportSize({ width: 390, height: 844 })
    const pageJump = page.locator('.reader-page-jump > summary')
    await expect(pageJump).toBeVisible()
    await expect(page.locator('.material-pager')).toContainText(`Seite 1 von ${pageCount}`)
    const opener = page.getByRole('button', { name: /Markierungen & Fragen/ })
    await opener.focus()
    await opener.press('Enter')
    const workspace = page.getByRole('dialog', { name: 'Markierungen & Fragen', exact: true })
    await expect(workspace).toBeVisible()
    const readingY = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('Escape')
    await expect(workspace).toHaveCount(0)
    await expect(pageJump).toBeVisible()
    await expect(pageJump).toBeFocused()
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - readingY)).toBeLessThan(2)
    // A focused target must remain operable, rather than merely receiving focus.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('spinbutton', { name: 'Zu Seite springen' })).toBeVisible()
  })
}

test('PDF excerpts survive reload, append to the same draft and save with a working source link', async ({ page }) => {
  let creates = 0
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') creates += 1
    await route.continue()
  })
  const version = await openReader(page)
  const quote = await selectPassage(page)
  await page.getByRole('button', { name: 'In Mitschrift übernehmen' }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(body).toContainText(quote)
  await expect(body.locator(`a[href^="/material/${version}?page=1"]`)).toHaveCount(1)
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('Mein eigener Kerngedanke.')
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await page.reload()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  await expect(body).toContainText('Mein eigener Kerngedanke.')
  await expect(body).toContainText(quote)
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  const secondQuote = await selectPassage(page, 2)
  await page.getByRole('button', { name: 'In Mitschrift übernehmen' }).click()
  await expect(body).toContainText(secondQuote)
  await expect(body).toContainText('Mein eigener Kerngedanke.')
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/notes') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  const response = await saving
  expect(response.ok(), await response.text()).toBeTruthy()
  const created = await response.json()
  await expect(page.locator('.reader-note-draft')).toHaveCount(0)
  await expect(page.locator('.reader-continuous-note .note-canvas')).toBeVisible()
  const detail = await (await page.request.get(`/api/notes/${created.note.id}`)).json()
  expect(detail.body).toContain(`/material/${version}?page=2`)
  expect(detail.note.resource_id).toBeGreaterThan(0)
  // The acknowledged source note continues in its existing document; later
  // excerpts update that UUID and never create a second lecture note.
  await selectPassage(page, 2)
  const updating = page.waitForResponse(
    (result) => result.url().endsWith(`/api/notes/${created.note.id}`) && result.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: 'In Mitschrift übernehmen' }).click()
  expect((await updating).ok()).toBeTruthy()
  const continued = await (await page.request.get(`/api/notes/${created.note.id}`)).json()
  expect(continued.note.current_revision).toBeGreaterThan(detail.note.current_revision)
  expect(continued.body.split(`/material/${version}?page=2`)).toHaveLength(3)
  const canvas = page.locator('.reader-continuous-note .note-canvas')
  const title = 'Schleifen: meine fortlaufende Mitschrift'
  await canvas.getByRole('textbox', { name: 'Notiztitel', exact: true }).fill(title)
  const further = 'Zweiter eigener Abschnitt nach dem ersten Speichern.'
  const secondSave = page.waitForResponse(
    (result) =>
      result.url().endsWith(`/api/notes/${created.note.id}`) &&
      result.request().method() === 'PUT' &&
      documentText(result.request().postDataJSON().document).includes(further),
  )
  const continuedBody = canvas.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await continuedBody.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(further)
  const secondResponse = await secondSave
  expect(secondResponse.ok(), await secondResponse.text()).toBeTruthy()
  expect(secondResponse.request().postDataJSON().expected_revision).toBe(continued.note.current_revision)
  const resumed = await secondResponse.json()
  expect(resumed.note.id).toBe(created.note.id)
  expect(resumed.note.title).toBe(title)
  expect(resumed.body).toContain(further)
  expect(creates).toBe(1)
  await page.reload()
  await expect(page.locator('[data-material-page="2"] canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  await expect(page.locator('.reader-note-draft')).toHaveCount(0)
  await expect(canvas.getByRole('textbox', { name: 'Notiztitel', exact: true })).toHaveValue(title)
  await expect(canvas.getByRole('textbox', { name: 'Notizinhalt', exact: true })).toContainText(further)
  expect(creates).toBe(1)
  await page.getByRole('link', { name: 'Notiz öffnen', exact: true }).click()
  await expect(page).toHaveURL(/\/notes\?(?:[^#]*&)?id=/)
  // Reader continuation opens in edit mode. Preview makes its retained source
  // links directly operable in the full document.
  await page.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.locator('.note-canvas a').filter({ hasText: '04_Schleifen.pdf' }).last().click()
  await expect(page).toHaveURL(new RegExp(`/material/${version}\\?page=2`))
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 2')
})

test('recall hides answers, resets reveal and keeps source navigation usable', async ({ page }) => {
  const version = await openReader(page)
  for (const entry of [
    { kind: 'highlight', quote: 'Schleifen und Python Beispiele', page: 1, comment: 'Wozu dienen Schleifen?' },
    { kind: 'question', quote: 'Rekursionstiefe', page: 2, comment: 'Was begrenzt die Rekursion?' },
  ])
    expect((await page.request.post(`/api/material/${version}/annotations`, { data: entry })).ok()).toBeTruthy()
  await page.reload()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await page.getByRole('tab', { name: 'Wiederholen', exact: true }).click()
  await expect(page.locator('.reader-recall-answer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Antwort aufdecken' }).click()
  await expect(page.locator('.reader-recall-answer')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Übung' }).click()
  await expect(page.locator('.reader-recall-answer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Stelle anzeigen', exact: true }).click()
  await expect(page.locator('.material-side-inline')).toBeVisible()
  await page.getByRole('tab', { name: 'Markierungen', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Markierungen durchsuchen' }).fill('Rekursion')
  await expect(page.locator('.material-annotation')).toHaveCount(1)
  await expect(page.locator('.material-annotation')).toContainText('Rekursionstiefe')
})

test('selection on a late page preserves reading position and opens its source-bound draft', async ({
  page,
}, testInfo) => {
  const positions: unknown[] = []
  const recordPosition = async (stage: string) => {
    positions.push(
      await page.evaluate((stage) => {
        const frame = document.querySelector('[data-reader-page="80"]')!.getBoundingClientRect()
        return {
          stage,
          y: scrollY,
          top: frame.top,
          bottom: frame.bottom,
          width: frame.width,
          page: document.querySelector('.material-pager')!.textContent,
        }
      }, stage),
    )
    await testInfo.attach('reader-resize-position.json', {
      body: JSON.stringify(positions),
      contentType: 'application/json',
    })
  }
  const version = await openReader(page, true)
  await jump(page, 80)
  const position = await page.locator('[data-reader-page="80"]').evaluate((node) => node.getBoundingClientRect().top)
  const quote = await selectPassage(page, 80)
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toBeVisible()
  const selectedPosition = await page
    .locator('[data-reader-page="80"]')
    .evaluate((node) => node.getBoundingClientRect().top)
  expect(Math.abs(position - selectedPosition)).toBeLessThan(2)
  await page.screenshot({ path: screenshotPath(path.resolve('..', qaDirectory, 'selection-120-pages.png')) })
  await page.getByRole('button', { name: 'In Mitschrift übernehmen' }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(body).toContainText(quote)
  await expect(body.locator(`a[href^="/material/${version}?page=80"]`)).toHaveCount(1)
  await expect(page.locator('.material-pager')).toContainText('Seite 80 von 120')
  await recordPosition('before-mobile')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(body).toContainText(quote)
  await recordPosition('mobile-open')
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await recordPosition('mobile-closed')
  await expect(page.locator('.material-pager')).toContainText('Seite 80 von 120')
})

test('capped desktop fit anchors expire before later page navigation', async ({ page }) => {
  await openReader(page, true)
  await page.setViewportSize({ width: 1920, height: 1000 })
  await jump(page, 80)
  const widthOf = (number: number) =>
    page.locator(`[data-reader-page="${number}"]`).evaluate((node) => node.getBoundingClientRect().width)
  await expect.poll(() => widthOf(80)).toBe(760)
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.locator('.material-side-inline')).toBeVisible()
  await expect.poll(() => widthOf(80)).toBe(760)
  await jump(page, 100)
  // Opening the panel at capped width must not retain page 80 as a resize anchor.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.material-side-drawer')).toBeVisible()
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 100 von 120')
})

test('no-op split resize expires before same-page scrolling', async ({ page }) => {
  await openReader(page, true)
  await page.setViewportSize({ width: 1920, height: 1000 })
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.locator('.material-side-inline')).toBeVisible()
  await jump(page, 100)
  const separator = page.getByRole('separator', { name: 'Breite des Lernbereichs ändern' })
  await separator.press('Home')
  await expect(separator).toHaveAttribute('aria-valuenow', '320')
  await expect
    .poll(() => page.locator('[data-reader-page="100"]').evaluate((node) => node.getBoundingClientRect().width))
    .toBe(760)
  // Repeating an already-applied size is a no-op without a ResizeObserver event.
  await separator.press('Home')
  const before = await page.evaluate(async () => {
    window.scrollBy({ top: 320, behavior: 'instant' })
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const rect = document.querySelector('[data-reader-page="100"]')!.getBoundingClientRect()
    const controls = document.querySelector('.material-controls')!.getBoundingClientRect()
    // Compare the actual reading line below the sticky controls at each width.
    return (Math.max(140, controls.bottom + 32) - rect.top) / rect.height
  })
  expect(before).toBeGreaterThan(0.1)
  await expect(page.locator('.material-pager')).toContainText('Seite 100 von 120')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.material-side-drawer')).toBeVisible()
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 100 von 120')
  await expect
    .poll(async () => {
      const after = await page.locator('[data-reader-page="100"]').evaluate((node) => {
        const rect = node.getBoundingClientRect()
        const controls = document.querySelector('.material-controls')!.getBoundingClientRect()
        return (Math.max(140, controls.bottom + 32) - rect.top) / rect.height
      })
      return Math.abs(before - after)
    })
    .toBeLessThan(0.03)
})

test('closing and reopening the workspace during a save creates one note', async ({ page }) => {
  await openReader(page)
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notizinhalt', exact: true }).fill('Gedanke mit verzögerter Serverantwort.')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let creates = 0
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') {
      creates += 1
      await gate
    }
    await route.continue()
  })
  const response = page.waitForResponse(
    (result) => result.url().endsWith('/api/notes') && result.request().method() === 'POST',
  )
  try {
    await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
    await page.getByRole('button', { name: 'Markierungen schließen' }).click()
    await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
    await expect(page.locator('.reader-note-draft button[type="submit"]')).toBeDisabled()
    expect(creates).toBe(1)
  } finally {
    release()
  }
  expect((await response).ok()).toBeTruthy()
  await expect(page.getByRole('link', { name: 'Notiz öffnen', exact: true })).toBeVisible()
  await expect(page.locator('.reader-note-draft')).toHaveCount(0)
  await expect(page.locator('.reader-continuous-note .note-canvas')).toBeVisible()
  expect(creates).toBe(1)
})

test('opening the full note editor during a reader save shares the same pending creation', async ({ page }) => {
  await openReader(page)
  await page.getByRole('button', { name: 'Mitschrift', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Notizinhalt', exact: true })
    .fill('Eine Quelle, ein laufender Schreibvorgang.')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let creates = 0
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') {
      creates += 1
      await gate
    }
    await route.continue()
  })
  const response = page.waitForResponse(
    (result) => result.url().endsWith('/api/notes') && result.request().method() === 'POST',
  )
  try {
    await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
    await page.locator('.material-file-actions > summary').click()
    await page.getByRole('link', { name: 'Mitschrift anlegen', exact: true }).click()
    await expect(page).toHaveURL(/notes\?new=1/)
    await expect(
      page.locator('.note-new-canvas').getByRole('button', { name: /^(Speichere|Notiz anlegen)/ }),
    ).toBeDisabled()
    expect(creates).toBe(1)
  } finally {
    release()
  }
  expect((await response).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/notes\?(?:[^#]*&)?id=/)
  await expect(page.locator('.note-canvas')).toContainText('Eine Quelle, ein laufender Schreibvorgang.')
  expect(creates).toBe(1)
})

test('acknowledging an earlier highlight retains the next selected passage and comment', async ({ page }) => {
  const version = await openReader(page)
  await selectPassage(page)
  await page.getByRole('textbox', { name: 'Kommentar zur Markierung' }).fill('Gedanke A')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/api/material/${version}/annotations`, async (route) => {
    if (route.request().method() === 'POST') await gate
    await route.continue()
  })
  const response = page.waitForResponse(
    (result) => result.url().endsWith(`/api/material/${version}/annotations`) && result.request().method() === 'POST',
  )
  let nextQuote: string
  try {
    await page.getByRole('button', { name: 'Markieren', exact: true }).click()
    await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
    nextQuote = await selectPassage(page, 2)
    await page.getByRole('textbox', { name: 'Kommentar zur Markierung' }).fill('Gedanke B')
  } finally {
    release()
  }
  expect((await response).ok()).toBeTruthy()
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toContainText(nextQuote)
  await expect(page.getByRole('textbox', { name: 'Kommentar zur Markierung' })).toHaveValue('Gedanke B')
  const material = await (await page.request.get(`/api/material/${version}`)).json()
  expect(material.annotations.at(-1).comment).toBe('Gedanke A')
})

test('an invalid new cross-page selection clears the previous actionable passage', async ({ page }) => {
  await openReader(page, true)
  await jump(page, 80)
  await selectPassage(page, 80)
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toBeVisible()
  await expect(page.locator('[data-material-page="81"] .react-pdf__Page__textContent span').first()).toBeAttached()
  await page.evaluate(() => {
    const start = document.querySelector('[data-material-page="80"] .react-pdf__Page__textContent span')!.firstChild!
    const end = document.querySelector('[data-material-page="81"] .react-pdf__Page__textContent span')!.firstChild!
    const range = document.createRange()
    range.setStart(start, 0)
    range.setEnd(end, end.textContent!.length)
    const selected = window.getSelection()!
    selected.removeAllRanges()
    selected.addRange(range)
    document.querySelector('[data-material-page="80"]')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toHaveCount(0)
  // The constraint is a hint about how to mark, not an error, so it is announced as a status.
  await expect(page.getByRole('status').filter({ hasText: 'innerhalb einer PDF-Seite' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'In Mitschrift übernehmen' })).toHaveCount(0)
})

test('fast pinch previews on the compositor, reuses the finished raster and keeps normalized selection coordinates', async ({
  page,
}) => {
  await openReader(page, true)
  await jump(page, 80)
  const source = page.locator('[data-material-page="80"]')
  const raster = source.locator('[data-reader-render-active="true"]')
  const before = await raster.getAttribute('data-reader-render-width')
  const preview = await page.evaluate(async () => {
    const viewport = document.querySelector('.material-viewport')!
    for (let i = 0; i < 6; i++) {
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -12,
          clientX: 760,
          clientY: 300,
        }),
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    const layer = document.querySelector('[data-material-page="80"] [data-reader-render-active="true"]')!
    // The live pinch scales the whole page surface with one compositor matrix;
    // neither the slot layout nor the raster changes until the gesture settles.
    const surface = document.querySelector('[data-reader-zoom-surface]')!
    return {
      width: layer.getAttribute('data-reader-render-width'),
      visibility: getComputedStyle(layer).visibility,
      canvasVisibility: getComputedStyle(layer.querySelector('canvas')!).visibility,
      surfaceTransform: getComputedStyle(surface).transform,
      slotWidth: (document.querySelector('[data-reader-page="80"]') as HTMLElement).style.width,
    }
  })
  expect(preview.width).toBe(before)
  expect(preview.visibility).toBe('visible')
  expect(preview.canvasVisibility).toBe('visible')
  expect(preview.surfaceTransform).not.toBe('none')
  expect(preview.slotWidth).toBe(`${before}px`)
  await selectPassage(page, 80)
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toBeVisible()
  const bounds = await source
    .locator('.material-mark.pending')
    .first()
    .evaluate((node) => {
      const mark = node.getBoundingClientRect()
      const frame = node.closest('[data-material-page]')!.getBoundingClientRect()
      return {
        left: (mark.left - frame.left) / frame.width,
        right: (mark.right - frame.left) / frame.width,
        top: (mark.top - frame.top) / frame.height,
        bottom: (mark.bottom - frame.top) / frame.height,
      }
    })
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(1)
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.bottom).toBeLessThanOrEqual(1)
  expect(bounds.right).toBeGreaterThan(bounds.left)
  await expect(source.locator('[data-reader-render-active="false"] canvas')).toHaveCount(1)
  await expect(source).toHaveAttribute('data-reader-render-state', 'preview')
  expect(await raster.getAttribute('data-reader-render-width')).toBe(before)
  await page.getByRole('button', { name: 'Textauswahl aufheben' }).click()
  await expect(source).toHaveAttribute('data-reader-render-state', 'sharp')
  expect(await raster.getAttribute('data-reader-render-width')).not.toBe(before)
})

test('page 80 remains anchored through pinch, pan, inertial swipe and split changes in a 120-page PDF', async ({
  page,
}) => {
  await openReader(page, true)
  await jump(page, 80)
  const point = { x: 780, y: 330 }
  const fraction = await page.locator('[data-reader-page="80"]').evaluate((node, point) => {
    const rect = node.getBoundingClientRect()
    return { x: (point.x - rect.left) / rect.width, y: (point.y - rect.top) / rect.height, width: rect.width }
  }, point)
  await page.locator('.material-viewport').dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -160,
    deltaMode: 0,
    clientX: point.x,
    clientY: point.y,
  })
  await expect(page.locator('.material-reader')).toHaveAttribute('data-zoomed', 'true')
  await expect
    .poll(() => page.locator('[data-reader-page="80"]').evaluate((node) => node.getBoundingClientRect().width))
    .toBeGreaterThan(fraction.width)
  const difference = await page.locator('[data-reader-page="80"]').evaluate(
    (node, args) => {
      const rect = node.getBoundingClientRect()
      return Math.abs(rect.top + rect.height * args.fraction.y - args.point.y)
    },
    { fraction, point },
  )
  expect(difference).toBeLessThan(5)
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1)
  const before = await page.evaluate(() => ({
    top: scrollY,
    left: document.querySelector('.material-viewport')!.scrollLeft,
  }))
  await page
    .locator('.material-viewport')
    .dispatchEvent('wheel', { bubbles: true, cancelable: true, deltaX: 90, deltaY: 18 })
  expect(await page.locator('.material-viewport').evaluate((node) => node.scrollLeft)).toBeGreaterThan(before.left)
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(before.top + 18, 0)
  for (let i = 0; i < 5; i++)
    await page
      .locator('.material-viewport')
      .dispatchEvent('wheel', { bubbles: true, cancelable: true, altKey: true, deltaX: 80, deltaY: 0 })
  await expect(page.locator('.material-pager')).toContainText('Seite 81 von 120')
  await page.locator('.material-view-options > summary').click()
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click()
  await page.locator('.material-view-options > summary').click()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 81 von 120')
  expect(await page.locator('.material-pages canvas').count()).toBeLessThan(13)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 81 von 120')
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`reader workspace visual and responsive audit ${theme} ${width}`, async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem('unios-theme', theme), theme)
      await openReader(page)
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
      await page.getByRole('tab', { name: 'Mitschrift', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'Notizinhalt', exact: true })
        .fill('Schleifen wiederholen einen Schritt, bis die Bedingung endet.')
      if (width === 390) {
        await expect(page.locator('.material-side-drawer')).toHaveCSS('bottom', '0px')
        await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
      } else await expect(page.locator('.material-side-overlay')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const save = page.getByRole('button', { name: 'Notiz anlegen', exact: true })
      await expect(save).toBeVisible()
      const saveBounds = (await save.boundingBox())!
      expect(saveBounds.y + saveBounds.height).toBeLessThanOrEqual(width === 390 ? 844 : 900)
      await page.screenshot({
        path: screenshotPath(path.resolve('..', qaDirectory, `${qaPrefix}${theme}-${width}.png`)),
      })
      await page.getByRole('button', { name: 'Markierungen schließen' }).click()
      await expect(page.locator('.material-pager')).toBeVisible()
    })
  }
}

test('a quote in the note opens the PDF at that passage, marked, without leaving the app', async ({ page }) => {
  const version = await openReader(page)
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  await selectPassage(page, 2)
  await page.getByRole('button', { name: 'In Mitschrift übernehmen' }).click()
  const body = page.getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(body.locator(`a[href^="/material/${version}?page=2&mark="]`)).toHaveCount(1)
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/notes') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Notiz anlegen', exact: true }).click()
  expect((await saving).ok()).toBeTruthy()
  // Read on page 1, then follow the source link written beside the PDF.
  await page.getByRole('button', { name: 'Vorherige Seite', exact: true }).click()
  const source = page.locator('.reader-continuous-note .note-canvas a[href*="mark="]').first()
  await expect(source).toBeVisible()
  const popups: string[] = []
  page.context().on('page', (opened) => popups.push(opened.url()))
  await source.click()
  await expect(page).toHaveURL(new RegExp(String.raw`/material/${version}\?page=2&mark=`))
  const mark = page.locator('[data-material-page="2"] .material-mark.cited').first()
  await expect(mark).toBeVisible()
  const box = (await mark.boundingBox())!
  expect(box.y).toBeGreaterThan(0)
  expect(box.y).toBeLessThan(900)
  // Scrolled away, the same link jumps back again.
  await page.getByRole('button', { name: 'Vorherige Seite', exact: true }).click()
  await expect.poll(async () => (await mark.boundingBox())?.y ?? 0).toBeGreaterThan(900)
  await source.click()
  await expect.poll(async () => (await mark.boundingBox())?.y ?? -1).toBeLessThan(900)
  expect(popups).toEqual([])
})
