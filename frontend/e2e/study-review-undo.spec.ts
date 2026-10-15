// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

type Scenario = { deck_a: { name: string } }
let scenario: Scenario

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const seed = await page.request.post('/api/__test__/study-deck-scenario')
  expect(seed.ok()).toBeTruthy()
  scenario = await seed.json()
})

test('undo restores a confirmed rating after ordinary study reads and prevents its replay', async ({ page }) => {
  await page.goto(`/study/session/${encodeURIComponent(scenario.deck_a.name)}`)
  await expect(page.getByRole('button', { name: /Antwort zeigen/ })).toBeVisible()
  const question = await page.locator('.study-session-card-content').innerText()
  await page.keyboard.press('Space')
  const answering = page.waitForResponse(
    (response) => response.url().endsWith('/api/anki/study/reviews') && response.request().method() === 'POST',
  )
  await page.keyboard.press('3')
  const answer = await answering
  expect(answer.ok()).toBeTruthy()
  const sent = answer.request().postDataJSON()
  for (const route of [
    '/api/anki/study/status',
    '/api/anki/study/stats',
    `/api/anki/study/due?deck=${encodeURIComponent(scenario.deck_a.name)}`,
  ]) {
    expect((await page.request.get(route)).ok()).toBeTruthy()
  }
  const undoing = page.waitForResponse((response) => response.url().endsWith('/api/anki/study/reviews/undo'))
  await page.keyboard.press('z')
  expect((await undoing).ok()).toBeTruthy()
  await expect(page.locator('.study-session-note[role="status"]')).toContainText('Bewertung zurückgenommen')
  await expect(page.getByRole('button', { name: 'Letzte Bewertung zurücknehmen', exact: true })).toHaveCount(0)
  await expect(page.locator('.study-session-card-content')).toContainText(question)
  expect((await (await page.request.get('/api/anki/study/status')).json()).reviews).toBe(0)
  expect((await page.request.post('/api/anki/study/reviews', { data: sent })).status()).toBe(409)
})

test('undo removes a never-uploaded offline rating before reconnecting', async ({ page, context }) => {
  await page.goto(`/study/session/${encodeURIComponent(scenario.deck_a.name)}`)
  await expect(page.getByRole('button', { name: /Antwort zeigen/ })).toBeVisible()
  const question = await page.locator('.study-session-card-content').innerText()
  await context.setOffline(true)
  await page.keyboard.press('Space')
  await page.keyboard.press('3')
  await expect(page.getByText('1 Bewertung wartet auf Übertragung.')).toBeVisible()
  await page.getByRole('button', { name: 'Letzte Bewertung zurücknehmen', exact: true }).click()
  await expect(page.locator('.study-session-note[role="status"]')).toContainText('Bewertung zurückgenommen')
  await expect(page.locator('.study-session-card-content')).toContainText(question)
  await expect(page.getByText('1 Bewertung wartet auf Übertragung.')).toHaveCount(0)
  await context.setOffline(false)
  await expect.poll(async () => (await (await page.request.get('/api/anki/study/status')).json()).reviews).toBe(0)
})
