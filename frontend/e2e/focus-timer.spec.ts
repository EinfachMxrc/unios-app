// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

const STORAGE_KEY = 'unios.focusTimer.v1'

test('starting a focus timer shows a countdown that can be paused and resumed', async ({ page, request }) => {
  const block = await (await request.post('http://127.0.0.1:8173/api/__test__/accepted-study-block-today')).json()
  await page.goto('/learning')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Lernblöcke heute' }) })
  const row = panel.locator('.data-row').filter({ hasText: block.topic })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Fokus starten' }).click()

  await expect(row.locator('.focus-timer-clock')).toHaveText(/^[01]:\d{2}$/)
  const pauseButton = row.getByRole('button', { name: `Fokus-Timer für „${block.topic}" pausieren` })
  await pauseButton.click()
  const resumeButton = row.getByRole('button', { name: `Fokus-Timer für „${block.topic}" fortsetzen` })
  await expect(resumeButton).toBeVisible()
  await resumeButton.click()
  await expect(row.getByRole('button', { name: `Fokus-Timer für „${block.topic}" pausieren` })).toBeVisible()

  // A live region announces the coarse remaining time for screen readers.
  const live = row.locator('[aria-live="polite"]')
  await expect(live).toHaveText(/Noch 1 Minute/)

  // Starting a second timer is blocked while one is already running.
  await expect(panel.getByRole('button', { name: 'Fokus starten' })).toHaveCount(0)

  await row.getByRole('button', { name: `Fokus-Timer für „${block.topic}" beenden` }).click()
  await expect(row.getByRole('button', { name: 'Fokus starten' })).toBeVisible()
})

test('a running timer survives a reload', async ({ page, request }) => {
  const block = await (await request.post('http://127.0.0.1:8173/api/__test__/accepted-study-block-today')).json()
  await page.goto('/learning')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Lernblöcke heute' }) })
  const row = panel.locator('.data-row').filter({ hasText: block.topic })
  await row.getByRole('button', { name: 'Fokus starten' }).click()
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  expect(stored).toBeTruthy()
  expect(JSON.parse(stored ?? '{}').blockId).toBe(block.id)

  await page.reload()
  const rowAfterReload = panel.locator('.data-row').filter({ hasText: block.topic })
  await expect(rowAfterReload.getByRole('button', { name: `Fokus-Timer für „${block.topic}" pausieren` })).toBeVisible()
})

test('a finished timer shows a calm completion state instead of a negative countdown', async ({ page, request }) => {
  const block = await (await request.post('http://127.0.0.1:8173/api/__test__/accepted-study-block-today')).json()
  const alreadyFinishedState = {
    blockId: block.id,
    topic: block.topic,
    courseName: block.course_name,
    durationSeconds: 60,
    startedAt: Date.now() - 120_000,
    pausedAt: null,
    accumulatedPauseMs: 0,
  }
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    STORAGE_KEY,
    JSON.stringify(alreadyFinishedState),
  ] as [string, string])
  await page.goto('/learning')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Lernblöcke heute' }) })
  const row = panel.locator('.data-row').filter({ hasText: block.topic })
  await expect(row.getByText('Geschafft!')).toBeVisible()
  await expect(row.getByRole('button', { name: `Fokus-Timer für „${block.topic}" pausieren` })).toHaveCount(0)
  await row.getByRole('button', { name: `Fokus-Timer für „${block.topic}" beenden` }).click()
  await expect(row.getByRole('button', { name: 'Fokus starten' })).toBeVisible()
})

test('today includes UTC blocks across the Berlin midnight with and without an explicit offset', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-04T22:30:00Z'))
  const starts = ['2026-10-04T22:30:00', '2026-10-04T22:30:00Z', '2026-10-05T00:30:00+02:00']
  await page.route('**/api/learning/blocks', (route) =>
    route.fulfill({
      json: starts.map((starts_at, index) => ({
        id: 701 + index,
        exam_id: 1,
        exam_title: 'Mitternachts-Test',
        topic_id: 1,
        topic: `Mitternachtsblock ${index + 1}`,
        course_name: 'Programmieren 1',
        duration_minutes: 1,
        starts_at,
        status: 'accepted',
      })),
    }),
  )
  await page.goto('/learning')
  const panel = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Lernblöcke heute' }) })
  for (let index = 1; index <= 3; index++)
    await expect(panel.locator('.data-row').filter({ hasText: `Mitternachtsblock ${index}` })).toBeVisible()
  const row = panel.locator('.data-row').filter({ hasText: 'Mitternachtsblock 1' })
  await row.getByRole('button', { name: 'Fokus starten' }).click()
  await expect(row.locator('.focus-timer-clock')).toHaveText('1:00')
})
