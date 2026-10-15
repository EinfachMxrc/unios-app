// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

const labels = { general: 'Allgemein', appearance: 'Darstellung', reminders: 'Erinnerungen', data: 'Daten & Sync', feedback: 'Feedback' }
type Section = keyof typeof labels

for (const width of [1440, 390]) {
  test(`settings sections remain intentional and mounted at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.goto('/settings#appearance')
    const navigation = page.getByRole('navigation', { name: 'Einstellungsbereiche' })
    const mobileSection = page.getByRole('combobox', { name: 'Einstellungsbereiche', exact: true })
    const active = page.locator('.settings-stack > .settings-section:not([hidden])')
    const select = async (section: Section) => {
      if (width === 390) await mobileSection.selectOption(section)
      else await navigation.getByRole('link', { name: labels[section], exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/settings#${section}$`))
      await expect(active).toHaveCount(1)
      await expect(active).toHaveAttribute('id', section)
      await expect(active.getByRole('heading', { name: labels[section], exact: true })).toBeVisible()
      if (width === 390) await expect(mobileSection).toHaveValue(section)
      else await expect(navigation.getByRole('link', { name: labels[section], exact: true })).toHaveAttribute('aria-current', 'page')
    }

    await expect(active).toHaveAttribute('id', 'appearance')
    await expect(page.locator('.settings-stack > .settings-section')).toHaveCount(5)
    await expect(page.locator('#general')).toBeHidden()
    if (width === 390) {
      await expect(mobileSection).toBeVisible()
      await expect(page.locator('.settings-jump-nav')).toBeHidden()
    } else {
      await expect(navigation).toBeVisible()
      await expect(page.locator('.settings-mobile-section')).toBeHidden()
    }
    await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption('dark')
    await select('general')
    await expect(page.getByRole('combobox', { name: 'Sprache', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Design', exact: true })).toHaveCount(0)
    await select('reminders')
    await expect(page.getByRole('switch', { name: 'Sonntags-Rückblick' })).toBeVisible()
    await select('feedback')
    const message = 'Erfundener Entwurf bleibt beim Wechsel des Einstellungsbereichs erhalten.'
    await page.getByRole('textbox', { name: 'Deine Beschreibung', exact: true }).fill(message)
    await select('data')
    await page.locator('#data details > summary').click()
    const exportPanel = page.locator('#data .glass-card').filter({ has: page.getByRole('heading', { name: 'Daten exportieren', exact: true }) })
    await exportPanel.getByRole('checkbox').check()
    // Inactive sections remain mounted, while their controls leave the visible
    // interaction path. No hidden input is used to bypass the selected section.
    await expect(page.locator('#alpha-feedback')).toBeHidden()
    await expect(page.locator('#alpha-feedback')).toHaveValue(message)
    await select('feedback')
    await expect(page.getByRole('textbox', { name: 'Deine Beschreibung', exact: true })).toHaveValue(message)
    await select('data')
    await expect(exportPanel.getByRole('checkbox')).toBeChecked()
    await expect(page.locator('#data details')).toHaveAttribute('open', '')
    await select('appearance')
    await page.reload()
    await expect(page).toHaveURL(/\/settings#appearance$/)
    await expect(active).toHaveAttribute('id', 'appearance')
    await expect(page.getByRole('combobox', { name: 'Design', exact: true })).toHaveValue('dark')
    await expect(page.locator('#general')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
