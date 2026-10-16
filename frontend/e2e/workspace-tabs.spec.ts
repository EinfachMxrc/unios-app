// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'
import type { Locator, Page } from '@playwright/test'

async function openInTab(page: Page, link: Locator) {
  await link.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'In neuem UniOS-Tab öffnen', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 1000 })
})

test('PDF tabs retain page, zoom and an unsaved split note across switching, closing and reopening', async ({
  page,
}) => {
  const seed = await (await page.request.post('/api/__test__/focus-workspace')).json()
  await page.goto(`/material/${seed.version_id}?workspace=1&page=12`)
  const body = page.locator('.reader-note-draft').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await body.fill('Mein Entwurf bleibt im PDF-Tab.')
  const zoom = page.getByRole('textbox', { name: 'Zoomstufe in Prozent', exact: true })
  await zoom.fill('150')
  await zoom.press('Enter')
  await expect(zoom).toHaveValue('150')
  await expect(page.locator('[data-material-page="12"] canvas').first()).toBeInViewport()
  await openInTab(page, page.locator('.app-sidebar').getByRole('link', { name: 'Termine', exact: true }))
  await expect(page).toHaveURL(/\/deadlines$/)
  await expect(page.getByRole('navigation', { name: 'Offene Inhalte' }).locator('[data-workspace-tab]')).toHaveCount(2)
  await page.getByRole('navigation', { name: 'Offene Inhalte' }).locator('[data-workspace-tab]').first().click()
  await expect(body).toHaveValue('Mein Entwurf bleibt im PDF-Tab.')
  await expect(zoom).toHaveValue('150')
  await expect(page.locator('[data-material-page="12"] canvas').first()).toBeInViewport()
  const before = (await page.locator('.workspace-tab.is-active').locator('[data-workspace-tab]').textContent())!.trim()
  await page.getByRole('button', { name: `Tab ${before} schließen`, exact: true }).click()
  await expect(page).toHaveURL(/\/deadlines$/)
  await page.getByRole('button', { name: 'Zuletzt geschlossenen Tab öffnen', exact: true }).click()
  await expect(body).toHaveValue('Mein Entwurf bleibt im PDF-Tab.')
  await expect(zoom).toHaveValue('150')
  await page.reload()
  await expect(body).toHaveValue('Mein Entwurf bleibt im PDF-Tab.')
  await expect(page.getByRole('navigation', { name: 'Offene Inhalte' }).locator('[data-workspace-tab]')).toHaveCount(2)
})

test('notes preserve a draft and cursor while another tab is used and reuse an already open document', async ({
  page,
}) => {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, resource_id: null, title: 'Synthetische Tab-Mitschrift', body: 'Anfang und Ende' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const note = await response.json()
  await page.goto(`/notes?id=${note.note.id}&edit=1`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.locator('.studio-document')
  await expect(editor).toContainText('Anfang und Ende')
  await editor.click()
  await editor.fill('Davor Anfang und Ende')
  for (let index = 0; index < 4; index++) await editor.press('ArrowLeft')
  await openInTab(page, page.locator('.app-sidebar').getByRole('link', { name: 'Kurse', exact: true }))
  await expect(page).toHaveURL(/\/courses$/)
  await page.locator('[data-workspace-tab]').first().click()
  await expect(editor).toContainText('Davor Anfang und Ende')
  await expect(editor).toBeVisible()
  await editor.focus()
  await expect(editor).toBeFocused()
  await editor.pressSequentially('Weiter ')
  await expect(editor).toContainText('Davor Anfang und Weiter Ende')
  await openInTab(page, page.locator('.app-sidebar').getByRole('link', { name: 'Kurse', exact: true }))
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2)
})

test('tabs reorder with the keyboard, restore a closed tab, and open search from a new tab', async ({ page }) => {
  await page.goto('/courses/1')
  await openInTab(page, page.locator('.app-sidebar').getByRole('link', { name: 'Termine', exact: true }))
  const tabs = page.locator('[data-workspace-tab]')
  const original = await tabs.first().textContent()
  await tabs.first().focus()
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await expect(tabs.last()).toContainText(original!.trim())
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/courses\/1$/)
  await expect(tabs.last()).toBeFocused()
  await page.getByRole('button', { name: 'Neuer Tab', exact: true }).click()
  await expect(page).toHaveURL(/\/workspace\/new$/)
  await page.getByRole('button', { name: 'Inhalte suchen und öffnen', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(tabs).toHaveCount(3)
})

test('Markdown mode restores its selection and supports typing after a tab switch', async ({ page }) => {
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetischer Markdown-Tab', body: 'Anfang und Ende' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const note = await response.json()
  await page.goto(`/notes?id=${note.note.id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  const editor = page.locator('textarea.note-textarea')
  await editor.fill('Davor Anfang und Ende')
  for (let index = 0; index < 4; index++) await editor.press('ArrowLeft')
  await openInTab(page, page.locator('.app-sidebar').getByRole('link', { name: 'Kurse', exact: true }))
  await expect(page).toHaveURL(/\/courses$/)
  await page.locator('[data-workspace-tab]').first().click()
  await expect(editor).toBeVisible()
  await expect(editor).toHaveValue('Davor Anfang und Ende')
  await editor.focus()
  await editor.pressSequentially('Weiter ')
  await expect(editor).toHaveValue('Davor Anfang und Weiter Ende')
})

test('desktop modifier clicks and shortcuts control app tabs in one window', async ({ page, context }) => {
  await page.addInitScript(() => Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } }))
  await page.goto('/courses/1')
  await page
    .locator('.app-sidebar')
    .getByRole('link', { name: 'Termine', exact: true })
    .click({ modifiers: ['ControlOrMeta'] })
  await expect(page).toHaveURL(/\/deadlines$/)
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+t')
  await expect(page).toHaveURL(/\/workspace\/new$/)
  await page.keyboard.press('ControlOrMeta+w')
  await expect(page).toHaveURL(/\/deadlines$/)
  await page.keyboard.press('ControlOrMeta+Shift+t')
  await expect(page).toHaveURL(/\/workspace\/new$/)
  await page.keyboard.press('Control+Tab')
  await expect(page).toHaveURL(/\/courses\/1$/)
  expect(context.pages()).toHaveLength(1)
})

test('desktop modifier clicks inside a note open a workspace tab', async ({ page, context }) => {
  await page.addInitScript(() => Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } }))
  const response = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetischer Quellen-Tab', body: '[Zum Lernkurs](/courses/1)' },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const note = await response.json()
  await page.goto(`/notes?id=${note.note.id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page
    .locator('.studio-document')
    .getByRole('link', { name: 'Zum Lernkurs', exact: true })
    .click({ modifiers: ['ControlOrMeta'] })
  await expect(page).toHaveURL(/\/courses\/1$/)
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2)
  expect(context.pages()).toHaveLength(1)
})

for (const width of [1440, 390]) {
  test(`tab controls fit at ${width}px in both themes`, async ({ page }, testInfo) => {
    await page.goto('/courses/1')
    await openInTab(page, page.locator('.app-sidebar').getByRole('link', { name: 'Termine', exact: true }))
    await page.getByRole('button', { name: 'Neuer Tab', exact: true }).click()
    await page.setViewportSize({ width, height: 960 })
    const directory = path.resolve('..', 'docs/qa/notion-tabs-20261016')
    await mkdir(directory, { recursive: true })
    if (width === 390) {
      const chooser = page.getByRole('combobox', { name: 'Zwischen 3 offenen Tabs wechseln', exact: true })
      await expect(chooser).toBeVisible()
      const choices = await chooser
        .locator('option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
      await chooser.selectOption(choices[0])
      await expect(page).toHaveURL(/\/courses\/1$/)
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const destination = path.join(directory, `tabs-${theme}-${width}.png`)
      await page.screenshot({ path: destination, fullPage: true, animations: 'disabled' })
      await testInfo.attach(`tabs-${theme}-${width}`, { path: destination, contentType: 'image/png' })
    }
  })
}
