// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.request.post('http://127.0.0.1:8173/api/__test__/reset')
  await page.setViewportSize({ width: 1440, height: 1000 })
})

test('personal status is editable from deadlines and the course, preserves properties and has safe Undo', async ({
  page,
}) => {
  const course = await (await page.request.get('/api/courses/1')).json()
  const assignment = course.assignments.find((item: { title: string }) => item.title === 'Schleifen üben')
  expect(assignment).toBeTruthy()
  const path = `/api/metadata/assignment/${assignment.id}`
  const initial = await (await page.request.get(path)).json()
  await page.request.put(path, {
    data: {
      tags: ['exam'],
      priority: 'high',
      exam_relevant: false,
      difficulty: 'hard',
      workflow_status: 'open',
      expected_revision: initial.revision,
    },
  })
  await page.goto('/deadlines')
  await page.locator('.deadline-page-switch').getByRole('button', { name: 'Abgaben', exact: true }).click()
  await page
    .getByRole('table', { name: 'Fristen als Tabelle' })
    .getByRole('button', { name: 'Schleifen üben', exact: true })
    .click()
  const status = page.getByRole('region', { name: 'Dein Arbeitsstand', exact: true })
  await status.getByRole('button', { name: 'In Arbeit', exact: true }).click()
  await expect(status.getByRole('button', { name: 'In Arbeit', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(status.getByRole('button', { name: 'Rückgängig', exact: true })).toBeEnabled()
  const after = await (await page.request.get(path)).json()
  expect(after).toMatchObject({
    tags: ['exam'],
    priority: 'high',
    exam_relevant: false,
    difficulty: 'hard',
    workflow_status: 'working',
  })
  await status.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(status.getByRole('button', { name: 'Offen', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await status.getByRole('button', { name: 'Erledigt', exact: true }).click()
  await expect(status.getByRole('button', { name: 'Erledigt', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto(`/courses/1#assignment-${assignment.id}`)
  const courseStatus = page.getByRole('region', { name: 'Dein Arbeitsstand', exact: true })
  await expect(courseStatus.getByRole('button', { name: 'Erledigt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    (await (await page.request.get('/api/courses/1')).json()).assignments.find(
      (item: { id: number }) => item.id === assignment.id,
    ).due_at,
  ).toBe(assignment.due_at)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    (await courseStatus.getByRole('button', { name: 'In Arbeit', exact: true }).boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('a concurrent personal metadata edit is shown after 409 and never overwritten by status or Undo', async ({
  page,
}) => {
  const course = await (await page.request.get('/api/courses/1')).json()
  const assignment = course.assignments[0],
    path = `/api/metadata/assignment/${assignment.id}`
  await page.goto(`/courses/1#assignment-${assignment.id}`)
  const status = page.getByRole('region', { name: 'Dein Arbeitsstand', exact: true })
  await status.getByRole('button', { name: 'In Arbeit', exact: true }).click()
  await expect(status.getByRole('button', { name: 'Rückgängig', exact: true })).toBeEnabled()
  const saved = await (await page.request.get(path)).json()
  await page.request.put(path, {
    data: { ...saved, tags: ['changed-elsewhere'], workflow_status: 'done', expected_revision: saved.revision },
  })
  await status.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(status.getByRole('alert')).toContainText('inzwischen geändert')
  await expect(status.getByRole('button', { name: 'Erledigt', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(status.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(0)
  const live = await (await page.request.get(path)).json()
  expect(live).toMatchObject({ tags: ['changed-elsewhere'], workflow_status: 'done' })
})

test('project todos save inline, Undo preserves the project and an external revision is never overwritten', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Projekte', exact: true }).click()
  const create = await page.request.post('/api/projects', {
    data: {
      name: 'Synthetic task project',
      course_id: 1,
      deadline_at: null,
      notes: 'Keep these notes',
      members: [],
      links: [],
      todos: [
        { title: 'Synthetic draft', done: false },
        { title: 'Synthetic review', done: false },
      ],
      assignment_ids: [],
      github_repo: null,
    },
  })
  expect(create.ok(), await create.text()).toBe(true)
  const project = await create.json()
  await page.goto(`/projects/${project.id}`)
  const todo = page.getByRole('checkbox', { name: 'Synthetic draft', exact: true })
  await todo.click()
  await expect(todo).toBeChecked()
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click()
  await expect(todo).not.toBeChecked()
  await expect(todo).toBeEnabled()
  const current = await (await page.request.get(`/api/projects/${project.id}`)).json()
  expect(current.notes).toBe('Keep these notes')
  expect(current.todos[1].done).toBe(false)
  const external = await page.request.put(`/api/projects/${project.id}`, {
    data: { ...current, notes: 'External confirmed notes', expected_revision: current.revision },
  })
  expect(external.ok(), await external.text()).toBe(true)
  await todo.click()
  await expect(page.locator('.project-todo-error')).toContainText('inzwischen geändert')
  await expect(todo).not.toBeChecked()
  await expect(page.getByText('External confirmed notes', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(0)
  expect((await (await page.request.get(`/api/projects/${project.id}`)).json()).todos[0].done).toBe(false)
})

test('deadline adjustment prefills campus time and rejects a non-existent DST time before sending', async ({
  page,
}) => {
  const course = await (await page.request.get('/api/courses/1')).json()
  const assignment = course.assignments[0]
  await page.goto(`/courses/1#assignment-${assignment.id}`)
  const drawer = page.getByRole('dialog', { name: 'Schnellansicht', exact: true })
  await drawer.getByText('Termin anpassen', { exact: true }).click()
  const field = drawer.getByLabel('Frist', { exact: true })
  const actualDue = new Date(
    /(?:Z|[+-]\d\d:\d\d)$/.test(assignment.due_at) ? assignment.due_at : `${assignment.due_at}Z`,
  )
  const expectedDay = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(actualDue)
  const expectedTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(actualDue)
  await expect(field).toHaveValue(`${expectedDay}T${expectedTime}`)
  let sends = 0
  await page.route(`**/api/assignments/${assignment.id}/deadline`, async (route) => {
    sends++
    await route.continue()
  })
  await field.fill('2027-03-28T02:30')
  await drawer.getByRole('button', { name: 'Termin bestätigen', exact: true }).click()
  await expect(drawer.getByRole('alert')).toContainText('Zeitumstellung')
  expect(sends).toBe(0)
  await field.fill('2027-03-28T03:30')
  await drawer.getByRole('button', { name: 'Termin bestätigen', exact: true }).click()
  await expect(field).toBeEnabled()
  await expect(drawer.getByRole('alert')).toHaveCount(0)
  expect(sends).toBe(1)
  const updated = (await (await page.request.get('/api/courses/1')).json()).assignments.find(
    (item: { id: number }) => item.id === assignment.id,
  )
  expect(
    new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(updated.due_at) ? updated.due_at : `${updated.due_at}Z`).toISOString(),
  ).toBe('2027-03-28T01:30:00.000Z')
})

test('a status change retains the unsaved properties draft and requires a deliberate reload', async ({ page }) => {
  const course = await (await page.request.get('/api/courses/1')).json(),
    assignment = course.assignments[0]
  await page.goto(`/courses/1#assignment-${assignment.id}`)
  const drawer = page.getByRole('dialog', { name: 'Schnellansicht', exact: true })
  await drawer.getByText('Aufgabendetails', { exact: true }).click()
  await drawer.getByText('Tags & Eigenschaften', { exact: true }).click()
  const tags = drawer.getByRole('combobox', { name: 'Tags, mit Komma getrennt', exact: true })
  await tags.fill('#unsaved-draft')
  await drawer
    .getByRole('region', { name: 'Dein Arbeitsstand', exact: true })
    .getByRole('button', { name: 'In Arbeit', exact: true })
    .click()
  await expect(tags).toHaveValue('#unsaved-draft')
  await expect(
    drawer.getByText('Die Eigenschaften wurden inzwischen geändert. Dein Entwurf bleibt hier erhalten.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Eigenschaften speichern', exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: 'Entwurf verwerfen und neu laden', exact: true }).click()
  await expect(tags).toHaveValue('')
  await expect(drawer.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('working')
  await tags.fill('#chosen-after-reload')
  await drawer.getByRole('button', { name: 'Eigenschaften speichern', exact: true }).click()
  await expect(drawer.locator('.metadata-editor').getByRole('status')).toContainText('Eigenschaften gespeichert')
  const metadata = await (await page.request.get(`/api/metadata/assignment/${assignment.id}`)).json()
  expect(metadata).toMatchObject({ tags: ['chosen-after-reload'], workflow_status: 'working' })
})
