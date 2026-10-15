// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('Webseite teilen, zuordnen und wiederfinden', async ({ page }) => {
  await page.goto(
    '/inbox?url=https%3A%2F%2Fexample.invalid%2Fsortieren&title=Sortierverfahren&text=Merge%20Sort%20teilt%20die%20Liste',
  )
  await expect(page.getByRole('textbox', { name: 'Webadresse' })).toHaveValue('https://example.invalid/sortieren')
  await page.getByRole('button', { name: 'Im Eingang speichern' }).click()
  const clip = page.locator('.inbox-row').filter({ hasText: 'Sortierverfahren' })
  await expect(clip).toBeVisible()
  await clip.evaluate((node) => {
    const observer = new MutationObserver(() => {
      if (!node.classList.contains('is-removing')) return
      sessionStorage.setItem('inbox-row-exit-animation', getComputedStyle(node).animationName)
      observer.disconnect()
    })
    observer.observe(node, { attributes: true, attributeFilter: ['class'] })
  })
  await clip.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  await clip.getByRole('button', { name: 'Zuordnen' }).click()
  await expect(clip.getByRole('status')).toContainText('Eingeordnet.')
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('inbox-row-exit-animation')))
    .toContain('inbox-row-leave')
  await expect(clip).toHaveCount(0)
  await page.getByRole('button', { name: 'Erledigt' }).click()
  await expect(clip).toContainText('Zugeordnet')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: screenshotPath('test-results/inbox-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('test-results/inbox-mobile.png'), fullPage: true })
  await page.goto('/search?q=Merge%20Sort')
  await expect(page.getByRole('heading', { name: 'Gesammelte Inhalte' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sortierverfahren' })).toBeVisible()
})

test('Datei direkt in den Eingang aufnehmen', async ({ page }) => {
  await page.goto('/inbox')
  await page
    .getByLabel('Datei auswählen')
    .setInputFiles({ name: 'Skizze.txt', mimeType: 'text/plain', buffer: Buffer.from('Ein erfundener Merksatz') })
  await page.getByRole('button', { name: 'Datei hinzufügen' }).click()
  await expect(page.getByRole('status')).toContainText('Datei im Eingang')
  await expect(
    page
      .locator('.inbox-row')
      .filter({ hasText: /Skizze-[a-f0-9]+\.txt/ })
      .getByRole('link', { name: /Datei öffnen und importieren/ }),
  ).toBeVisible()
})

test('Eingangseintrag wird mobil in einem ruhigen Blatt eingeordnet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/inbox')
  const firstId = await page.locator('.inbox-row').first().getAttribute('id')
  const row = page.locator(`[id="${firstId}"]`)
  await row.getByRole('button', { name: /einordnen/i }).click()
  const sheet = page.getByRole('dialog', { name: /einordnen/i })
  await expect(sheet.getByRole('combobox', { name: 'Kurs' })).toBeVisible()
  expect(await sheet.evaluate((node) => getComputedStyle(node).animationName)).toContain('inbox-sheet-enter')
  await page.screenshot({ path: screenshotPath('test-results/inbox-mobile-sheet.png') })
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveClass(/is-closing/)
  await expect(sheet).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await row.getByRole('button', { name: /einordnen/i }).click()
  expect(await sheet.evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
  await sheet.getByRole('combobox', { name: 'Kurs' }).selectOption({ label: 'Programmieren 1' })
  await sheet.getByRole('button', { name: 'Zuordnen' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(row).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
