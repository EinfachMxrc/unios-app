// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('agent permissions, background index and compact views work on desktop and phone', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { ai: true } })),
  )
  await page.goto('/ai')
  await page.getByText('Weitere Quellen für Agenten freigeben', { exact: true }).click()
  for (const name of ['Eigene Notizen', 'Übungen und Lösungen', 'Projektcode und Symbole', 'Freigegebene Lernkarten']) {
    const checkbox = page.getByRole('checkbox', { name, exact: true })
    await expect(checkbox).not.toBeChecked()
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
  }
  await page.getByText('Agent Gateway · Quellenindex', { exact: true }).click()
  await expect(page.getByRole('link', { name: 'Indexaufträge verwalten' })).toBeVisible()
  await page.getByRole('link', { name: 'Indexaufträge verwalten' }).click()
  await page.getByRole('combobox', { name: 'Art', exact: true }).selectOption('corpus')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Auftrag starten', exact: true }).click()
  await expect
    .poll(async () => {
      const jobs = await (await page.request.get('/api/jobs')).json()
      return jobs.find((job: { kind: string }) => job.kind === 'corpus')?.state
    })
    .toBe('completed')
  await page.goto('/ai')
  await page.getByText('Agent Gateway · Quellenindex', { exact: true }).click()
  await expect(page.getByText('Index aktuell. Agenten können gezielt suchen und Quellen abrufen.')).toBeVisible()
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: screenshotPath(`test-results/agent-${theme}-${width}.png`), fullPage: true })
    }
  }
})
