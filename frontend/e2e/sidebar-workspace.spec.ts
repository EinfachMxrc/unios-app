// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const qaDirectory = process.env.UNIOS_QA_DIRECTORY || 'docs/qa/sidebar-workspace-20261010'

async function createNote(page: Page, title: string, body: string) {
  const response = await page.request.post('/api/notes', { data: { course_id: 1, title, body } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).note.id as string
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('default sidebar opens an actual course and its notes, with reversible keyboard expansion', async ({ page }) => {
  await page.goto('/courses')
  const sidebar = page.locator('.app-sidebar')
  const course = sidebar.getByRole('link', { name: 'Kurs: Programmieren 1', exact: true })
  await expect(course).toBeVisible()
  await course.click()
  await expect(page.getByRole('heading', { name: 'Programmieren 1', exact: true })).toBeVisible()
  const children = sidebar.locator('.sidebar-course-group')
    .filter({ has: page.locator('.sidebar-course[href="/courses/1"]') }).locator('.sidebar-course-children')
  await expect(children.getByRole('link', { name: 'Materialien', exact: true })).toBeVisible()
  await expect(sidebar.locator('.sidebar-recents a[href="/courses/1"]')).toHaveCount(0)
  await sidebar.getByRole('button', { name: 'Unterseiten von Programmieren 1 schließen', exact: true }).click()
  await expect(children).toHaveCount(0)
  const expand = sidebar.getByRole('button', { name: 'Unterseiten von Programmieren 1 öffnen', exact: true })
  await expand.focus()
  await expand.press('Enter')
  await children.getByRole('link', { name: 'Notizen', exact: true }).click()
  await expect(page).toHaveURL(/\/notes\?course_id=1$/)
  await expect(page.getByRole('heading', { name: 'Notizen', exact: true })).toBeVisible()
  await expect(children.getByRole('link', { name: 'Notizen', exact: true })).toHaveClass(/active/)
})

test('sidebar quick actions support keyboard search and retain an unsaved note', async ({ page }) => {
  await page.goto('/courses')
  const sidebar = page.locator('.app-sidebar')
  const search = sidebar.getByRole('button', { name: 'Suche in Kursen und Dateien', exact: true })
  await search.focus()
  await search.press('Enter')
  const palette = page.getByRole('dialog', { name: 'Befehlspalette', exact: true })
  await expect(palette).toBeVisible()
  const input = palette.getByRole('textbox', { name: 'Befehl suchen', exact: true })
  await expect(input).toBeFocused()
  await input.press('Escape')
  await expect(search).toBeFocused()
  await search.press('Enter')
  await expect(input).toBeFocused()
  await input.fill('Programmieren 1')
  await palette.getByRole('button', { name: 'Programmieren 1', exact: true }).click()
  await expect(page).toHaveURL(/\/courses\/1$/)
  const newNote = sidebar.getByRole('link', { name: 'Neue Notiz', exact: true })
  await newNote.focus()
  await newNote.press('Enter')
  await expect(page).toHaveURL(/\/notes\?new=1$/)
  const composition = page.locator('.note-new-canvas').getByRole('textbox', { name: 'Notizinhalt', exact: true })
  await expect(composition).toHaveAttribute('contenteditable', 'true')
  await composition.fill('Ein neuer Gedanke aus der Beispielvorlesung.')
  await sidebar.locator('.nav-item[href="/courses"]').click()
  await newNote.focus()
  await newNote.press('Enter')
  await expect(composition).toContainText('Ein neuer Gedanke aus der Beispielvorlesung.')
  await expect(page.getByRole('button', { name: 'Notiz anlegen', exact: true })).toBeVisible()
  await search.focus()
  await search.press('Enter')
  await expect(input).toBeFocused()
  await page.keyboard.press('Control+\\')
  await input.press('Escape')
  await expect(page.locator('.top-search-trigger')).toBeFocused()
})

test('an empty course group gives a real next step and remains optional', async ({ page }) => {
  const response = await page.request.get('/api/courses')
  const fixture = await response.json()
  fixture.courses = []
  await page.route(url => url.pathname === '/api/courses', route => route.fulfill({ json: fixture }))
  await page.goto('/courses')
  const sidebar = page.locator('.app-sidebar')
  await expect(sidebar.locator('.sidebar-courses')).toContainText('Deine Kurse erscheinen hier nach dem Import.')
  await expect(sidebar.getByRole('link', { name: 'Kurse öffnen', exact: true })).toHaveAttribute('href', '/courses')
  await sidebar.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  const editor = page.getByRole('dialog')
  await editor.getByLabel('Kursverknüpfungen anzeigen', { exact: true }).uncheck()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(sidebar.locator('.sidebar-courses')).toHaveCount(0)
})

test('sidebar reopens actual PDF pages and notes in one click and filters disabled modules', async ({ page }) => {
  const noteId = await createNote(page, 'Sidebar Lernnotiz', 'Der Basisfall beendet den Selbstaufruf.')
  const fixture = await page.request.get('/api/__test__/long-reader.pdf?pages=3')
  expect(fixture.ok()).toBeTruthy()
  const pdf = await fixture.body()
  await page.route('**/files/*/inline', route => route.fulfill({ contentType: 'application/pdf', body: pdf }))
  await page.goto('/courses/1')
  const sidebar = page.locator('.app-sidebar')
  await page.locator('.resource-row').filter({ hasText: '04_Schleifen.pdf' })
    .getByRole('link', { name: 'PDF öffnen', exact: true }).click()
  await expect(page.locator('[data-material-page="1"] canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite', exact: true }).click()
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 3')
  await sidebar.locator('.nav-item[href="/courses"]').click()
  const recent = sidebar.locator('.sidebar-recents')
  const recentPdf = recent.locator('.sidebar-recent').filter({ hasText: '04_Schleifen.pdf' })
  await expect(recentPdf).toHaveCount(1)
  await expect(recentPdf).toContainText('PDF · Seite 2')
  await expect(recentPdf).toHaveAttribute('href', /\/material\/\d+\?page=2$/)
  await recentPdf.click()
  await expect(page).toHaveURL(/\/material\/\d+\?page=2$/)
  await expect(page.locator('.material-pager')).toContainText('Seite 2 von 3')
  await expect(page.locator('[data-material-page="2"] canvas')).toBeInViewport()
  await sidebar.locator('.nav-item[href="/notes"]').click()
  await page.locator('.note-list-item').filter({ hasText: 'Sidebar Lernnotiz' }).click()
  await expect(page.locator('.rendered-note')).toContainText('Der Basisfall beendet den Selbstaufruf.')
  await sidebar.locator('.nav-item[href="/courses"]').click()
  const recentNote = recent.locator(`.sidebar-recent[href="/notes?id=${noteId}"]`)
  await expect(recentNote).toBeVisible()
  await recentNote.click()
  await expect(page).toHaveURL(new RegExp(`/notes\\?id=${noteId}$`))
  await expect(page.locator('.rendered-note')).toContainText('Der Basisfall beendet den Selbstaufruf.')
  await expect(recent.locator('.sidebar-recent').first()).toHaveAttribute('href', `/notes?id=${noteId}`)
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => {
      localStorage.setItem('unios-theme', value)
      dispatchEvent(new StorageEvent('storage', { key: 'unios-theme' }))
    }, theme)
    for (const width of [1440, 1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1440 ? 1000 : 720 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? [] :
        [...document.querySelectorAll('body *')].filter(element => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.right > innerWidth + 1
        }).slice(0, 15).map(element => ({ tag: element.tagName, className: element.className,
          width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right,
          parentClass: element.parentElement?.className,
          parentColumns: element.parentElement ? getComputedStyle(element.parentElement).gridTemplateColumns : null }))))
        .toEqual([])
      await page.screenshot({
        path: screenshotPath(path.resolve('..', qaDirectory, `sidebar-${theme}-${width}-${Date.now()}.png`)),
        animations: 'disabled',
      })
      if (width === 1440) await sidebar.screenshot({
        path: screenshotPath(path.resolve('..', qaDirectory, `sidebar-detail-${theme}-${Date.now()}.png`)),
        animations: 'disabled',
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await sidebar.getByRole('link', { name: 'Einstellungen', exact: true }).click()
  await page.getByRole('switch', { name: 'Kurse', exact: true }).click()
  await expect(sidebar.locator('.sidebar-course')).toHaveCount(0)
  await expect(recentPdf).toHaveCount(0)
  await expect(recentNote).toBeVisible()
  await page.getByRole('switch', { name: 'Suche', exact: true }).click()
  await sidebar.getByRole('button', { name: 'Bereich öffnen', exact: true }).click()
  const palette = page.getByRole('dialog', { name: 'Befehlspalette', exact: true })
  await expect(palette).toBeVisible()
  await palette.getByRole('textbox', { name: 'Befehl suchen', exact: true }).fill('Notizen')
  await expect(palette.getByRole('button', { name: 'Notizen', exact: true })).toBeVisible()
  await expect(palette.locator('.command-results')).toHaveCount(0)
})

test('saved hidden courses remain hidden and can be restored explicitly', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('unios-sidebar-layout-v1', JSON.stringify({
    version: 1,
    workspace: ['today', 'courses', 'learning', 'notes', 'deadlines'],
    library: [],
    courseOrder: [],
    hiddenCourses: [1],
    showCourses: false,
  })))
  await page.goto('/courses/1')
  const sidebar = page.locator('.app-sidebar')
  await expect(page.getByRole('heading', { name: 'Programmieren 1', exact: true })).toBeVisible()
  await expect(sidebar.locator('.sidebar-courses')).toHaveCount(0)
  await expect(sidebar.locator('.sidebar-recents a[href="/courses/1"]')).toHaveCount(0)
  await sidebar.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  const editor = page.getByRole('dialog')
  const showCourses = editor.getByLabel('Kursverknüpfungen anzeigen', { exact: true })
  await expect(showCourses).not.toBeChecked()
  await showCourses.check()
  await expect(editor.getByLabel('Programmieren 1', { exact: true })).not.toBeChecked()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(sidebar.getByRole('link', { name: 'Kurs: Programmieren 1', exact: true })).toHaveCount(0)
  await expect(sidebar.locator('.sidebar-course').first()).toBeVisible()
  await sidebar.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  await editor.getByLabel('Programmieren 1', { exact: true }).check()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(sidebar.getByRole('link', { name: 'Kurs: Programmieren 1', exact: true })).toBeVisible()
})

test('five recent notes stay ordered and hiding the group survives navigation and reload', async ({ page }) => {
  const notes = []
  for (let number = 1; number <= 6; number += 1) {
    const title = `Beispielnotiz ${number}`
    const body = `Erfundener Lerninhalt ${number}.`
    notes.push({ title, body, id: await createNote(page, title, body) })
  }
  await page.goto('/notes')
  for (const note of notes) {
    await page.locator('.note-list-item').filter({ hasText: note.title }).click()
    await expect(page.locator('.rendered-note')).toContainText(note.body)
  }
  const sidebar = page.locator('.app-sidebar')
  const recent = sidebar.locator('.sidebar-recents')
  await expect(recent.locator('.sidebar-recent strong')).toHaveText(notes.slice(1).reverse().map(note => note.title))
  await sidebar.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  const editor = page.getByRole('dialog')
  const showRecent = editor.getByLabel('Zuletzt geöffnete Inhalte anzeigen', { exact: true })
  await showRecent.uncheck()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(recent).toHaveCount(0)
  await sidebar.locator('.nav-item[href="/courses"]').click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kurse', exact: true })).toBeVisible()
  await expect(recent).toHaveCount(0)
  await sidebar.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  await expect(showRecent).not.toBeChecked()
  await showRecent.check()
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await expect(recent).toBeVisible()
})

test('long navigation scrolls at 1280 by 720 with enlarged text while footer stays reachable', async ({ page }) => {
  const response = await page.request.get('/api/courses')
  expect(response.ok()).toBeTruthy()
  const fixture = await response.json()
  fixture.courses = Array.from({ length: 30 }, (_, index) => ({
    ...fixture.courses[0],
    id: 1001 + index,
    name: `Beispielkurs ${index + 1} mit langem Navigationstitel`,
  }))
  await page.route(url => url.pathname === '/api/courses', route => route.fulfill({ json: fixture }))
  await page.addInitScript(() => localStorage.setItem('unios-accessibility-v1', JSON.stringify({ scale: 150 })))
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/notes')
  const sidebar = page.locator('.app-sidebar')
  const navigation = sidebar.getByRole('navigation', { name: 'Hauptnavigation', exact: true })
  await expect(sidebar.locator('.sidebar-course')).toHaveCount(30)
  expect(await navigation.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const footer = sidebar.locator('.sidebar-bottom')
  await expect(footer.getByRole('button', { name: 'Seitenleiste anpassen', exact: true })).toBeInViewport()
  await expect(footer.getByRole('link', { name: 'Einstellungen', exact: true })).toBeInViewport()
  await sidebar.locator('.sidebar-course').last().scrollIntoViewIfNeeded()
  await expect(sidebar.locator('.sidebar-course').last()).toBeInViewport()
  await expect(footer.getByRole('button', { name: 'Seitenleiste anpassen', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await footer.getByRole('button', { name: 'Seitenleiste anpassen', exact: true }).click()
  const editor = page.getByRole('dialog')
  await expect(editor).toBeVisible()
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
  await footer.getByRole('link', { name: 'Einstellungen', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
})
