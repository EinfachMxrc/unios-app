// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('PDF viewer stores a question beside the source and exports an annotated copy', async ({ page }) => {
  await page.goto('/courses')
  await page.locator('.course-list-row').filter({ hasText: 'Programmieren 1' }).click()
  const resource = page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
  await resource.getByRole('link', { name: 'PDF öffnen' }).click()
  await expect(page).toHaveURL(/\/material\/\d+/)
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await expect(page.locator('[data-material-page="1"] [data-reader-render-active="true"] .react-pdf__Page__textContent')).toContainText('Schleifen und Python Beispiele')

  await page.evaluate(() => {
    const text = document.querySelector('[data-material-page="1"] [data-reader-render-active="true"] .react-pdf__Page__textContent span')?.firstChild
    if (!text) throw new Error('PDF text layer missing')
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.querySelector('[data-material-page]')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toBeVisible()
  // Writing the comment moves focus and drops the browser's own text selection; the passage stays marked.
  await page.getByRole('textbox', { name: 'Kommentar zur Markierung' }).fill('Warum endet meine Testschleife?')
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  const pending = page.locator('[data-material-page="1"] .material-mark.pending')
  await expect(pending.first()).toBeVisible()
  const pendingBox = await pending.first().boundingBox()
  const quoteBox = await page.locator('[data-material-page="1"] [data-reader-render-active="true"] .react-pdf__Page__textContent span').first().boundingBox()
  expect(pendingBox && quoteBox && Math.abs(pendingBox.x - quoteBox.x) < 3 && Math.abs(pendingBox.y - quoteBox.y) < 6).toBeTruthy()
  const savedQuestion = page.waitForResponse((response) =>
    response.url().includes('/annotations') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Verstehe ich nicht' }).click()
  expect((await savedQuestion).ok()).toBeTruthy()
  await expect(page.locator('.material-mark.pending')).toHaveCount(0) // saved: now a normal mark
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Kommentar' })).toHaveValue('Warum endet meine Testschleife?')
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()

  await page.getByRole('link', { name: 'Lernen', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Lernen' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Warum endet meine Testschleife?' })).toBeVisible()
  const resolvedResponse = page.waitForResponse((response) => response.url().includes('/api/material/annotations/') && response.request().method() === 'PATCH')
  await page.locator('.data-row').filter({ hasText: 'Warum endet meine Testschleife?' })
    .getByRole('button', { name: 'Als geklärt markieren' }).click()
  const resolved = await resolvedResponse
  expect(resolved.ok(), await resolved.text()).toBeTruthy()
  await expect(page.getByRole('link', { name: 'Warum endet meine Testschleife?' })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Geklärte Fragen anzeigen' }).check()
  const reopenedResponse = page.waitForResponse((response) => response.url().includes('/api/material/annotations/') && response.request().method() === 'PATCH')
  await page.locator('.data-row').filter({ hasText: 'Warum endet meine Testschleife?' })
    .getByRole('button', { name: 'Wieder öffnen' }).click()
  const reopened = await reopenedResponse
  expect(reopened.ok(), await reopened.text()).toBeTruthy()
  await expect(page.getByRole('link', { name: 'Warum endet meine Testschleife?' })).toBeVisible()
  await page.getByRole('link', { name: 'Warum endet meine Testschleife?' }).click()
  await expect(page).toHaveURL(/\/material\/\d+#annotation-/)

  const detailResponse = await page.request.get(`/api/material/${new URL(page.url()).pathname.split('/').pop()}`)
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy()
  const detail = await detailResponse.json()
  expect(detail.annotations[0].anchor.rects.length).toBeGreaterThan(0)
  await page.goto(`/courses/${detail.course_id}`)
  await page.getByText('Weitere Werkzeuge').click()
  await expect(page.getByText('Schleifen und Python Beispiele')).toBeVisible()
  await page.getByRole('combobox', { name: 'Status filtern' }).selectOption('open')
  await expect(page.getByRole('link', { name: 'Offene Fragen exportieren' })).toBeVisible()
  const questions = await page.request.get(`/api/courses/${detail.course_id}/questions/export`)
  expect(questions.ok()).toBeTruthy()
  expect(await questions.text()).toContain('Warum endet meine Testschleife?')
  await page.getByRole('combobox', { name: 'Status filtern' }).selectOption('highlights')
  await expect(page.getByText('Keine passenden Markierungen')).toBeVisible()
  await page.getByRole('combobox', { name: 'Status filtern' }).selectOption('all')
  await page.getByRole('textbox', { name: 'Freitext für diesen Kurs' }).fill('Frage im Tutorium stellen')
  await page.getByRole('button', { name: 'Freitext speichern' }).click()
  await expect
    .poll(async () => (await (await page.request.get(`/api/courses/${detail.course_id}/material`)).json()).scratchpad)
    .toBe('Frage im Tutorium stellen')
  await page.goto(`/material/${detail.version_id}`)
  // The annotation drawer survives returning from the course to this source.
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Warum endet meine Testschleife?')).toBeVisible()

  const original = await page.request.get(`/files/${page.url().split('/').pop()}/inline`)
  const exported = await page.request.get(`/api/material/${page.url().split('/').pop()}/export`)
  expect(original.ok()).toBeTruthy()
  expect(exported.ok()).toBeTruthy()
  expect((await exported.body()).length).toBeGreaterThan((await original.body()).length)
  const savedAnnotation = page.locator('.material-annotation').filter({ hasText: 'Warum endet meine Testschleife?' })
  await savedAnnotation.getByRole('button', { name: 'Als geklärt markieren' }).click()
  await expect(savedAnnotation.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible()
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.locator('.material-side-drawer')).toBeVisible()
  await expect(page.locator('.material-side-drawer')).toHaveCSS('bottom', '0px')
  await page.getByRole('button', { name: 'Markierungen schließen' }).click()
  await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeVisible()
  await expect.poll(async () => page.evaluate(() => {
    const reader = document.querySelector('.material-reader') as HTMLElement
    const canvas = document.querySelector('.react-pdf__Page__canvas') as HTMLElement
    return canvas.getBoundingClientRect().width <= reader.clientWidth - 31
  })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('PowerPoint view explains missing converter and preserves original download', async ({ page }) => {
  await page.goto('/courses/2')
  const row = page.locator('.resource-row').filter({ hasText: 'Blatt_01.pptx' })
  await row.getByRole('link', { name: 'Im Material arbeiten' }).click()
  await expect(page).toHaveURL(/\/material\/\d+/)
  await expect(page.getByText(/LibreOffice ist für die Dokumentansicht nicht eingerichtet/)).toBeVisible()
  const original = page.getByRole('link', { name: 'Original herunterladen' })
  await expect(original).toBeVisible()
  const response = await page.request.get((await original.getAttribute('href'))!)
  expect(response.ok()).toBeTruthy()
})

test('a question selected while offline is sent once after reconnection', async ({ page }) => {
  await page.goto('/courses')
  await page.locator('.course-list-row').filter({ hasText: 'Programmieren 1' }).click()
  await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .click()
  await page.getByRole('button', { name: 'Nächste Seite' }).click()
  await expect(page.locator('[data-material-page="2"] [data-reader-render-active="true"] .react-pdf__Page__textContent')).toContainText('Rekursionstiefe')
  await page.context().setOffline(true)
  await page.evaluate(() => {
    const text = document.querySelector('[data-material-page="2"] [data-reader-render-active="true"] .react-pdf__Page__textContent span')?.firstChild
    if (!text) throw new Error('PDF text layer missing')
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.querySelector('[data-material-page="2"]')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await expect(page.getByRole('region', { name: 'Textauswahl' })).toBeVisible()
  await page.getByRole('button', { name: 'Verstehe ich nicht' }).click()
  await expect(page.getByText('Markierung vorgemerkt. Sie wird bei Verbindung übertragen.')).toBeVisible()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.getByText('Zur Übertragung vorgemerkt')).toBeVisible()
  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  const versionId = Number(page.url().split('/').pop())
  await expect
    .poll(async () => {
      const material = await (await page.request.get(`/api/material/${versionId}`)).json()
      return material.annotations.filter((item: { quote: string }) => item.quote.includes('Rekursionstiefe')).length
    })
    .toBe(1)
  await expect(page.getByText('Zur Übertragung vorgemerkt')).toHaveCount(0)
})

test('an unclear mark can be assigned by selecting text in the viewer', async ({ page }) => {
  await page.goto('/courses/1')
  const href = await page
    .locator('.resource-row')
    .filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen' })
    .getAttribute('href')
  const versionId = Number(href?.split('/').pop())
  const created = await page.request.post(`/api/material/${versionId}/annotations`, {
    data: { kind: 'highlight', quote: 'Schleifen und Python Beispiele', page: 1 },
  })
  expect(created.ok()).toBeTruthy()
  const annotationId = (await created.json()).id
  await page.route(
    `**/api/material/${versionId}`,
    async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.annotations = body.annotations.map((item: { id: string; anchor: object }) =>
        item.id === annotationId ? { ...item, anchor: { status: 'unmatched', page: null, rects: [] } } : item,
      )
      await route.fulfill({ response, json: body })
    },
    { times: 1 },
  )
  await page.goto(`/material/${versionId}`)
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.getByText('Markierungen prüfen')).toBeVisible()
  await page.getByRole('button', { name: 'Stelle neu zuordnen' }).click()
  await expect(page.locator('[data-material-page="1"] [data-reader-render-active="true"] .react-pdf__Page__textContent')).toContainText('Schleifen und Python Beispiele')
  await page.evaluate(() => {
    const text = document.querySelector('[data-material-page="1"] [data-reader-render-active="true"] .react-pdf__Page__textContent span')?.firstChild
    if (!text) throw new Error('PDF text layer missing')
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.querySelector('[data-material-page]')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Hier zuordnen' }).click()
  await page.getByRole('button', { name: /Markierungen & Fragen/ }).click()
  await expect(page.getByText('Markierungen prüfen')).toHaveCount(0)
  const material = await (await page.request.get(`/api/material/${versionId}`)).json()
  expect(material.annotations.find((item: { id: string }) => item.id === annotationId)?.revision).toBe(2)
})
