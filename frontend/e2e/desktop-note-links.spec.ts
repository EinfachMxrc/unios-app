// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('native lesson and exercise links stay in UniOS while external sources open in the browser', async ({
  page,
  context,
}, testInfo) => {
  await page.addInitScript(() => {
    const externalUrls: string[] = []
    Object.assign(window, {
      noteLinkExternalUrls: externalUrls,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: { url?: string }) => {
          if (command === 'open_external_url' && args?.url) externalUrls.push(args.url)
          return null
        },
      },
    })
  })
  const lessonResponse = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Synthetische Lektion', body: 'Stellenwerte verstehen und selbst rechnen.' },
  })
  expect(lessonResponse.ok()).toBeTruthy()
  const lesson = (await lessonResponse.json()).note
  const taskResponse = await page.request.post('/api/learning/assessment/courses/1/tasks', {
    data: {
      type: 'numeric',
      title: 'Synthetische Stellenwertaufgabe',
      question: 'Was ist zwei plus drei?',
      expected: '5',
    },
  })
  expect(taskResponse.ok()).toBeTruthy()
  const task = await taskResponse.json()
  const origin = new URL(testInfo.project.use.baseURL!).origin
  const relativeTask = `/assessment?task=${task.id}`
  const startResponse = await page.request.post('/api/notes', {
    data: {
      course_id: 1,
      title: 'Synthetischer Lernpfad',
      body: [
        `[Lektion öffnen](/notes?course_id=1&id=${lesson.id})`,
        `[Übung öffnen](${relativeTask})`,
        `[Bestehende Übung öffnen](${origin}${relativeTask})`,
        '[Externe Quelle](https://example.org/lernen)',
      ].join('\n\n'),
    },
  })
  expect(startResponse.ok()).toBeTruthy()
  const start = (await startResponse.json()).note
  const externalUrls = () =>
    page.evaluate(() => (window as Window & { noteLinkExternalUrls: string[] }).noteLinkExternalUrls)
  await page.goto(`/notes?id=${start.id}`)
  await page.getByRole('link', { name: 'Lektion öffnen', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`notes\\?course_id=1&id=${lesson.id}$`))
  await expect(page.getByText('Stellenwerte verstehen und selbst rechnen.', { exact: true })).toBeVisible()
  expect(await externalUrls()).toEqual([])
  expect(context.pages()).toHaveLength(1)
  for (const name of ['Übung öffnen', 'Bestehende Übung öffnen']) {
    await page.goBack()
    await page.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`assessment\\?task=${task.id}$`))
    await expect(page.getByText('Was ist zwei plus drei?', { exact: true })).toBeVisible()
    expect(await externalUrls()).toEqual([])
    expect(context.pages()).toHaveLength(1)
  }
  await page.goBack()
  await page.getByRole('link', { name: 'Externe Quelle', exact: true }).click()
  await expect.poll(externalUrls).toEqual(['https://example.org/lernen'])
  await expect(page).toHaveURL(new RegExp(`notes\\?id=${start.id}$`))
  expect(context.pages()).toHaveLength(1)
  await page.screenshot({ path: testInfo.outputPath('desktop-note-links.png'), fullPage: true })
})

test('editing note links and native window requests remain in the app', async ({ page, context }, testInfo) => {
  await page.addInitScript(() => {
    const externalUrls: string[] = []
    Object.assign(window, {
      noteLinkExternalUrls: externalUrls,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: { url?: string }) => {
          if (command === 'open_external_url' && args?.url) externalUrls.push(args.url)
          return null
        },
      },
    })
  })
  const destination = await page.request.post('/api/notes', {
    data: { course_id: 1, title: 'Kursübersicht · Linktest', body: 'Interner Zieltext.' },
  })
  const target = (await destination.json()).note.id
  const origin = new URL(testInfo.project.use.baseURL!).origin
  const created = await page.request.post('/api/notes', {
    data: {
      course_id: 1,
      title: 'Editor · Linktest',
      body: `[Zur Kursübersicht](${origin}/notes?course_id=1&id=${target})`,
    },
  })
  const start = (await created.json()).note.id
  await page.goto(`/notes?id=${start}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await page.locator('.studio-document').getByRole('link', { name: 'Zur Kursübersicht', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`notes\\?course_id=1&id=${target}$`))
  await expect(page.getByText('Interner Zieltext.', { exact: true })).toBeVisible()
  expect(context.pages()).toHaveLength(1)
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('unios-open-link', {
        detail: `${window.location.origin}/courses/1`,
      }),
    ),
  )
  await expect(page).toHaveURL(/\/courses\/1$/)
  expect(context.pages()).toHaveLength(1)
  expect(
    await page.evaluate(() => (window as Window & { noteLinkExternalUrls: string[] }).noteLinkExternalUrls),
  ).toEqual([])
})
