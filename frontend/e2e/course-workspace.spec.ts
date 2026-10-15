// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'
import { test, expect } from './fixtures'

test('Gesehene Unterlagen verschwinden dauerhaft, anstehende Aufgaben bleiben', async ({ page }) => {
  const overview = await (await page.request.get('http://127.0.0.1:8173/api/overview')).json()
  overview.changes = [
    {
      id: 500,
      kind: 'new',
      created_at: new Date().toISOString(),
      summary: 'Neue Beispielunterlage',
      course_id: 1,
      resource_id: 1,
    },
  ]
  overview.new_files = 1
  overview.deadlines = [
    { id: 501, assignment_id: null, title: 'Anstehende Beispielaufgabe', due_at: '2099-09-30T12:45:00Z', course_id: 1 },
  ]
  await page.route('**/api/overview', (route) => route.fulfill({ json: overview }))
  await page.goto('/')
  await page.locator('.today-summary a[href="/activity?kind=new"]').click()
  await page.goto('/')
  await expect(page.locator('.today-summary a[href="/activity?kind=new"]')).toHaveCount(0)
  await expect(page.locator('.today-summary a[href="/deadlines"]')).toContainText('1')
  await expect(page.getByRole('button', { name: 'Anstehende Beispielaufgabe' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.today-summary a[href="/activity?kind=new"]')).toHaveCount(0)
})

test('Kursübersicht, Unterlagensuche und reversibler Inaktiv-Status', async ({ page }) => {
  await page.goto('/courses/1')
  await expect(page.getByRole('navigation', { name: 'Kursansichten' })).toBeVisible()
  await expect(page.locator('#course-tasks')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Kursansichten' })
  await nav.getByRole('link', { name: /Unterlagen/ }).click()
  await expect(page.getByRole('searchbox', { name: 'Unterlagen durchsuchen …' })).toBeVisible()
  await page.getByRole('searchbox').fill('findet-keine-beispieldatei')
  await expect(page.getByText('Keine passenden Unterlagen.')).toBeVisible()
  await page.getByRole('searchbox').fill('')
  await expect(page.locator('.course-material-group').first()).toBeVisible()
  await nav.getByRole('link', { name: 'Übersicht', exact: true }).click()
  await page.locator('.course-settings > summary').click()
  await page.getByRole('button', { name: 'Als inaktiv markieren' }).click()
  await expect(page.getByRole('button', { name: 'Kurs aktivieren' })).toBeVisible()
  await expect(page.locator('.sidebar-course[href="/courses/1"]')).toHaveCount(0)
  const inactiveOverview = await (await page.request.get('http://127.0.0.1:8173/api/overview')).json()
  expect(inactiveOverview.pending_group_courses.some((course: { id: number }) => course.id === 1)).toBe(false)
  await page.goto('/courses')
  await expect(page.locator('.course-list-row[href="/courses/1"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Inaktive anzeigen' }).click()
  await page.locator('.course-list-row[href="/courses/1"]').click()
  await expect(
    page.getByText('Der Kurs ist abgeschlossen oder pausiert. Seine Unterlagen bleiben erhalten.'),
  ).toBeVisible()
  await page.locator('.course-settings > summary').click()
  await page.getByRole('button', { name: 'Kurs aktivieren' }).click()
  await expect(page.getByRole('button', { name: 'Als inaktiv markieren' })).toBeVisible()
  await page.locator('.course-settings > summary').click()
  await page.screenshot({ path: screenshotPath('../build/course-overview-light.png'), fullPage: true })
  {
    const returnTo = page.url()
    await page.goto('/settings#appearance')
    await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption('dark')
    await page.goto(returnTo)
  }
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: screenshotPath('../build/course-overview-dark.png'), fullPage: true })
  await nav.getByRole('link', { name: /Unterlagen/ }).click()
  await page.screenshot({ path: screenshotPath('../build/course-materials-dark.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('../build/course-materials-mobile.png'), fullPage: true })
})

test('Moodle-Inhalte brauchen keine erneute Zuordnung im Eingang', async ({ page }) => {
  await page.goto('/inbox')
  await expect(page.locator('.inbox-row-meta').filter({ hasText: 'Moodle-Material' })).toHaveCount(0)
  await expect(page.locator('.inbox-row-meta').filter({ hasText: 'Moodle-Aufgabe' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Erledigt', exact: true }).click()
  await expect(page.locator('.inbox-row-meta').filter({ hasText: 'Moodle-Material' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zuordnen', exact: true })).toHaveCount(0)
})

test('Kompakter Kursarbeitsplatz mit lesbarer Aufgabe, Terminänderung und mobilen Details', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const description =
    'Entwickelt im Team einen analogen Escape Room. Dokumentiert die einzelnen Rätsel und bereitet eine kurze Präsentation vor.\n\n'.repeat(
      12,
    )
  await page.route(/\/api\/courses\/1(?:\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.course.name = 'Mentoratsgruppe Informatik – Gemeinsam ins Studium starten'
    data.announcements = []
    data.assignments[0].description = description
    data.assignments[0].delivery = 'in_person'
    await route.fulfill({ json: data })
  })
  await page.goto('/courses/1')
  const card = page.locator('.course-task-card').first()
  await expect(card).toBeVisible()
  await expect(page.locator('.course-overview')).toHaveCount(0)
  await expect(page.locator('.course-announcements')).toHaveCount(0)
  await expect(page.locator('.course-assignment-body')).toHaveCount(0)
  {
    const returnTo = page.url()
    await page.goto('/settings#appearance')
    await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption('dark')
    await page.goto(returnTo)
  }
  await page.screenshot({ path: screenshotPath('../build/course-redesign-desktop-dark.png'), fullPage: true })
  const assignmentId = (await card.getAttribute('id'))!.replace('assignment-', '')
  await card.click()
  const dialog = page.getByRole('dialog', { name: 'Schnellansicht' })
  await expect(dialog.locator('.course-assignment-body')).toContainText(description.trim())
  await expect(
    dialog.locator('.course-deadline-tools > .row-subtitle').filter({ hasText: 'Abgabe vor Ort' }),
  ).toBeVisible()
  await dialog.locator('.course-deadline-tools details > summary').click()
  await dialog.getByLabel('Frist', { exact: true }).fill('2099-10-01T14:45')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/assignments/${assignmentId}/deadline`) && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Termin bestätigen' }).click()
  expect((await saved).ok()).toBe(true)
  await expect(dialog.locator('.course-assignment-date')).toContainText('01.10.2099')
  await expect(dialog.locator('.course-assignment-date')).toContainText('14:45')
  await page.screenshot({ path: screenshotPath('../build/course-redesign-task-dark.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.task-peek')).toHaveCount(0)
  await expect(card).toBeFocused()
  await page.goto(`/courses/1#assignment-${assignmentId}`)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Schnellansicht schließen' }).click()
  await expect(page.locator('dialog.task-peek')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  {
    const returnTo = page.url()
    await page.goto('/settings#appearance')
    await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption('light')
    await page.goto(returnTo)
  }
  await page
    .getByRole('navigation', { name: 'Kursansichten' })
    .getByRole('link', { name: 'Übersicht', exact: true })
    .click()
  await page.screenshot({ path: screenshotPath('../build/course-redesign-mobile-light.png'), fullPage: true })
  await card.click()
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: screenshotPath('../build/course-redesign-task-mobile.png') })
})

test('Unterlagen verwenden den Moodle-Titel und behalten Dateiname und PDF-Zugang', async ({ page }) => {
  const fixture = await (await page.request.get('/api/courses/1')).json()
  fixture.resources[0].name = 'Prüfungsordnung für Informatik'
  fixture.resources[0].filename = '04_Schleifen.pdf'
  await page.route(/\/api\/courses\/1(?:\?.*)?$/, async (route) => {
    const data = structuredClone(fixture)
    const query = new URL(route.request().url()).searchParams.get('q')?.toLocaleLowerCase() ?? ''
    data.resources = data.resources.filter((item: { name: string; filename?: string }) =>
      `${item.name} ${item.filename ?? ''}`.toLocaleLowerCase().includes(query))
    data.page = { offset: 0, limit: 50, total: data.resources.length, has_more: false }
    await route.fulfill({ json: data })
  })
  await page.goto('/courses/1')
  const title = page.getByRole('link', { name: 'Prüfungsordnung für Informatik', exact: true })
  await expect(title).toBeVisible()
  const resource = title.locator('..').locator('..')
  await resource.locator('.resource-more > summary').click()
  await expect(resource.locator('.resource-filename')).toHaveText('Dateiname: 04_Schleifen.pdf')
  await page
    .getByRole('navigation', { name: 'Kursansichten' })
    .getByRole('link', { name: /Unterlagen/ })
    .click()
  await page.getByRole('searchbox').fill('04_Schleifen')
  await expect(page.locator('.resource-row')).toHaveCount(1)
  await expect(title).toBeVisible()
  await page.getByRole('searchbox').fill('Prüfungsordnung')
  await expect(title).toBeVisible()
  await title.click()
  await expect(page).toHaveURL(/\/material\/\d+$/)
})
