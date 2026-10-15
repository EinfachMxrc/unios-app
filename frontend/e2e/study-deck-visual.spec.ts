// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import path from 'node:path'
import { expect, test } from './fixtures'

type SeedDeck = { id: number; name: string; card_ids: number[]; fronts: string[] }
type Scenario = { deck_a: SeedDeck; deck_b: SeedDeck; total_cards: number }

let scenario: Scenario
const screenshots = path.resolve(import.meta.dirname, '../../docs/qa/study-deck-scope-20261007')

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
  const seeded = await page.request.post('/api/__test__/study-deck-scenario')
  expect(seeded.ok()).toBeTruthy()
  scenario = await seeded.json()
  expect(scenario.total_cards).toBe(104)
  expect(scenario.deck_a.card_ids).toHaveLength(101)
  expect(scenario.deck_b.card_ids).toHaveLength(1)
})

test.afterEach(async ({ page }) => {
  expect((await page.request.post('/api/__test__/reset')).ok()).toBeTruthy()
})

test('real deck list and scoped B session remain readable on desktop and mobile in both themes', async ({ page }) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/study')
  await expect(page.getByRole('heading', { name: 'Deine Kartenstapel', exact: true })).toBeVisible()
  const bPath = `/study/session/${encodeURIComponent(scenario.deck_b.name)}`
  const transfer = page.getByRole('button', { name: 'Freigegebene Karten übernehmen', exact: true })
  await expect(transfer).toBeEnabled()
  await page.getByRole('button', { name: 'Kartenbrowser öffnen', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(transfer).toBeFocused()
  await expect(page.getByRole('group', { name: 'Bewertungen der letzten sieben Tage', exact: true })).toBeVisible()
  expect(await page.locator('.study-footer-link').evaluate(link => getComputedStyle(link).textDecorationLine))
    .toContain('underline')

  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => {
      localStorage.setItem('unios-theme', value)
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/study')
      const bLink = page.locator(`.study-deck-link[href="${bPath}"]`)
      await expect(bLink).toContainText('1 heute geplant · 1 Karte mit Unterstapeln')
      await expect(page.locator(`.study-deck-link[href="/study/session/${encodeURIComponent(scenario.deck_a.name)}"]`))
        .toContainText('101 heute geplant · 101 Karten mit Unterstapeln')
      await page.evaluate(async () => { await document.fonts.ready })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(path.join(screenshots, `decks-${theme}-${width}.png`)), fullPage: true, animations: 'disabled' })

      await bLink.click()
      await expect(page.getByRole('heading', { name: 'B', exact: true })).toBeVisible()
      await expect(page.getByText(scenario.deck_b.fronts[0], { exact: true })).toBeVisible()
      const reveal = page.getByRole('button', { name: 'Antwort zeigen' })
      await expect(reveal).toBeVisible()
      await expect(reveal).toBeInViewport()
      await expect(page.locator('.study-session-answer')).toHaveCount(0)
      await expect(page.getByText('0 von 1 Karte bearbeitet', { exact: true })).toBeVisible()
      await page.evaluate(async () => { await document.fonts.ready })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(path.join(screenshots, `session-${theme}-${width}.png`)), fullPage: true, animations: 'disabled' })
    }
  }

  const details = page.locator('.study-session-heading details')
  const summary = details.locator('summary')
  await expect(details).not.toHaveAttribute('open')
  await summary.focus()
  await expect(summary).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('open', '')
  await expect(details.getByText('Dieser Stapel umfasst seine Unterstapel. Jede Sitzung enthält höchstens 100 Karten in Ankis Reihenfolge.', { exact: true })).toBeVisible()
  await expect(page.locator('.study-session-answer')).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(details).not.toHaveAttribute('open')
  await expect(page.locator('.study-session-answer')).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(details).toHaveAttribute('open', '')
  await expect(page.locator('.study-session-answer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible()
  const inspection = await (await page.request.get('/api/__test__/study-deck-scenario')).json()
  expect(inspection.reviews).toBe(0)
  expect(inspection.receipts).toEqual([])
})
