// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'
const config = {
  canteens: [{ slug: 'test-canteen', name: 'Test-Mensa' }],
  mail_url: 'https://outlook.office.com/',
  timezone: 'Europe/Berlin',
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/mensa/services', (route) => route.fulfill({ json: config }))
  await page.route('**/api/mensa/plan?**', (route) =>
    route.fulfill({
      json: {
        date: '2026-10-01',
        canteen: 'test-canteen',
        source_url: 'https://sls.swo.bayern/test-canteen',
        fetched_at: '2026-10-01T08:00:00Z',
        stale: false,
        meals: [{ name: 'Test-Gemüsepfanne', student_price: 3.5, allergens: 'a1' }],
      },
    }),
  )
})
test('menu is searchable, preferences persist and Today shows it at the one-hour boundary', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-01T09:29:00Z') })
  await page.goto('/search?q=speiseplan')
  await page.getByRole('link', { name: 'Mensa & Speiseplan', exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Test-Gemüsepfanne' })).toBeVisible()
  await page.locator('.lunch-settings > summary').click()
  await page.getByLabel('Beginn der Mittagspause', { exact: true }).fill('12:30')
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click()
  await expect(page.getByText('Auf diesem Gerät gespeichert.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Beginn der Mittagspause', { exact: true })).toHaveValue('12:30')
  await page.screenshot({ path: testInfo.outputPath('mensa-desktop.png') })
  await page.goto('/')
  await expect(page.getByTestId('mensa-today')).toHaveCount(0)
  await page.clock.setSystemTime(new Date('2026-10-01T09:29:00Z'))
  await page.clock.fastForward(60_000)
  await expect(page.getByTestId('mensa-today')).toContainText('Test-Gemüsepfanne')
  await page.getByTestId('mensa-today').getByRole('link', { name: 'Speiseplan öffnen' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Test-Gemüsepfanne' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mensa-mobile.png') })
  await page.clock.setSystemTime(new Date('2026-10-01T10:29:00Z'))
  await page.goto('/')
  await expect(page.getByTestId('mensa-today')).toBeVisible()
  await page.clock.runFor(60_000)
  await expect(page.getByTestId('mensa-today')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('mensa-today')).toHaveCount(0)
  await page.goto('/mensa')
  await expect(page.getByRole('heading', { name: 'Test-Gemüsepfanne' })).toBeVisible()
})
test('mail opens the official native window and can be pinned', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { __TAURI_INTERNALS__?: unknown; lastMailCommand?: unknown }
    target.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: unknown) => {
        target.lastMailCommand = { command, args }
      },
    }
  })
  await page.addInitScript(() => {
    const saved = JSON.parse(
      localStorage.getItem('unios-ui-preferences-v1') || localStorage.getItem('marc-ui-preferences-v1') || '{}',
    )
    localStorage.setItem(
      'unios-ui-preferences-v1',
      JSON.stringify({ ...saved, modules: { ...saved.modules, mail: true } }),
    )
  })
  await page.goto('/mail')
  await page.getByRole('button', { name: 'Outlook öffnen' }).click()
  expect(await page.evaluate(() => (window as Window & { lastMailCommand?: unknown }).lastMailCommand)).toEqual({
    command: 'open_university_mail',
    args: { url: 'https://outlook.office.com/' },
  })
  await page.getByRole('button', { name: 'Uni-Mail in der Seitenleiste hinzufügen' }).click()
  await expect(page.locator('.app-sidebar').getByRole('link', { name: 'Uni-Mail', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.app-sidebar').getByRole('link', { name: 'Uni-Mail', exact: true })).toBeVisible()
  await expect(
    page.getByText('Der Outlook-Zugang importiert keine E-Mails automatisch.', { exact: false }),
  ).toBeVisible()
})

test('diet preferences persist, mark matching meals and put them first on the menu and Today', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-01T10:00:00Z') })
  await page.addInitScript(() => {
    if (!localStorage.getItem('unios-lunch-v1')) {
      localStorage.setItem(
        'unios-lunch-v1',
        JSON.stringify({ canteen: 'test-canteen', breakTime: '12:30', lead: 90, enabled: true }),
      )
    }
  })
  await page.route('**/api/mensa/plan?**', (route) =>
    route.fulfill({
      json: {
        date: '2026-10-01',
        canteen: 'test-canteen',
        source_url: 'https://sls.swo.bayern/test-canteen',
        fetched_at: '2026-10-01T08:00:00Z',
        stale: false,
        meals: [
          { name: 'Test-Frikadelle', dietary: 'meat', student_price: 3.5, allergens: '' },
          { name: 'Test-Käseauflauf', dietary: 'vegetarian', student_price: 3.5, allergens: '' },
          { name: 'Test-Tagesgericht', dietary: 'unknown', student_price: 3.5, allergens: '' },
          { name: 'Test-Linsenpfanne', dietary: 'vegan', student_price: 3.5, allergens: '' },
          { name: 'Test-Fischgericht', dietary: 'fish', student_price: 3.5, allergens: '' },
        ],
      },
    }),
  )
  await page.goto('/mensa')
  const diet = page.getByRole('combobox', { name: 'Ernährung', exact: true })
  await expect(diet).toHaveValue('all')
  await expect(page.getByLabel('Beginn der Mittagspause', { exact: true })).toHaveValue('12:30')
  const meals = page.locator('.mensa-meal:visible')
  await expect(meals).toHaveCount(5)
  await diet.selectOption('vegan')
  await expect(meals.first()).toContainText('Test-Linsenpfanne')
  await expect(page.getByRole('img', { name: 'Passt zu deiner Auswahl' })).toHaveCount(1)
  await expect(meals).toHaveCount(1)
  await page.reload()
  await expect(diet).toHaveValue('vegan')
  await expect(meals.first()).toContainText('Test-Linsenpfanne')
  await page.screenshot({ path: testInfo.outputPath('mensa-diet-desktop-light.png') })
  await page.goto('/')
  const preview = page.getByTestId('mensa-today')
  await expect(preview.locator('li').first()).toContainText('Test-Linsenpfanne')
  await expect(preview.getByRole('img', { name: 'Passt zu deiner Auswahl' })).toHaveCount(1)
  await preview.getByRole('link', { name: 'Speiseplan öffnen' }).click()
  await diet.selectOption('vegetarian')
  await expect(meals.nth(0)).toContainText('Test-Käseauflauf')
  await expect(meals.nth(1)).toContainText('Test-Linsenpfanne')
  await expect(meals).toHaveCount(2)
  await expect(page.getByRole('img', { name: 'Passt zu deiner Auswahl' })).toHaveCount(2)
  await expect(meals.filter({ hasText: 'Test-Tagesgericht' }).locator('.mensa-diet-badge')).toHaveCount(0)
  await diet.selectOption('pescatarian')
  await expect(meals.nth(2)).toContainText('Test-Fischgericht')
  await expect(meals).toHaveCount(3)
  await expect(page.getByRole('img', { name: 'Passt zu deiner Auswahl' })).toHaveCount(3)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await meals.first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('mensa-diet-mobile-dark.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await diet.selectOption('all')
  await expect(meals.first()).toContainText('Test-Frikadelle')
  await expect(page.getByRole('img', { name: 'Passt zu deiner Auswahl' })).toHaveCount(0)
})

test('meal categories, real image slots, weekday and simple day navigation stay separate from lunch settings', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-01T08:00:00Z') })
  await page.route('**/api/mensa/plan?**', (route) =>
    route.fulfill({
      json: {
        date: '2026-10-01',
        canteen: 'test-canteen',
        source_url: 'https://sls.swo.bayern/test-canteen',
        fetched_at: '2026-10-01T08:00:00Z',
        stale: false,
        meals: [
          {
            name: 'Test-Hauptgericht',
            category: 'main',
            dietary: 'vegan',
            student_price: 3,
            allergens: '',
            image_url: '/api/mensa/image?path=fixture',
          },
          { name: 'Test-Pommes', category: 'side', dietary: 'vegan', student_price: 1.5, allergens: '' },
        ],
      },
    }),
  )
  await page.route('**/api/mensa/image?**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm7sAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  )
  await page.goto('/mensa')
  await expect(page.getByRole('heading', { name: /Donnerstag, 1. Oktober/ })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Test-Hauptgericht', exact: true })).toBeVisible()
  const sides = page
    .locator('.menu-category')
    .filter({ has: page.getByRole('heading', { name: 'Beilagen', exact: true }) })
  await expect(sides).toContainText('Test-Pommes')
  await expect(page.getByLabel('Beginn der Mittagspause', { exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: 'Nächster Tag', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Freitag, 2. Oktober/ })).toBeVisible()
  await page.getByRole('button', { name: 'Vorheriger Tag', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Donnerstag, 1. Oktober/ })).toBeVisible()
})

test('mixed photos retain their DOM and requests across filters with aligned fallbacks', async ({ page }, testInfo) => {
  await page.route('**/api/mensa/plan?**', (route) =>
    route.fulfill({
      json: {
        date: '2026-10-01',
        canteen: 'test-canteen',
        source_url: 'https://sls.swo.bayern/test-canteen',
        fetched_at: '2026-10-01T08:00:00Z',
        stale: false,
        meals: [
          {
            name: 'Fixture mit Foto',
            category: 'main',
            dietary: 'meat',
            student_price: 3,
            image_url: '/api/mensa/image?path=good',
          },
          { name: 'Fixture ohne Foto', category: 'main', dietary: 'vegan', student_price: 3 },
          {
            name: 'Fixture defektes Foto',
            category: 'main',
            dietary: 'vegan',
            student_price: 3,
            image_url: '/api/mensa/image?path=broken',
          },
          { name: 'Fixture Beilage', category: 'side', dietary: 'vegan', student_price: 1 },
        ],
      },
    }),
  )
  let requests = 0
  await page.route('**/api/mensa/image?**', (route) => {
    requests += 1
    return route.request().url().includes('broken')
      ? route.fulfill({ status: 404 })
      : route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm7sAAAAASUVORK5CYII=',
            'base64',
          ),
        })
  })
  await page.goto('/mensa')
  const photo = page.getByRole('img', { name: 'Fixture mit Foto', exact: true })
  await photo.scrollIntoViewIfNeeded()
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true)
  await page.locator('.mensa-meal').filter({ hasText: 'Fixture defektes Foto' }).scrollIntoViewIfNeeded()
  await expect(page.locator('.meal-photo-placeholder')).toHaveCount(2)
  const node = await photo.elementHandle()
  const before = requests
  const diet = page.getByRole('combobox', { name: 'Ernährung', exact: true })
  await diet.selectOption('vegan')
  await expect(photo).toBeHidden()
  await diet.selectOption('all')
  await expect(photo).toBeVisible()
  expect(await node!.evaluate((element) => element.isConnected)).toBe(true)
  expect(requests).toBe(before)
  await expect(
    page.locator('.menu-category').filter({ hasText: 'Fixture Beilage' }).locator('.meal-photo'),
  ).toHaveCount(0)
  for (const theme of ['light', 'dark'])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
      await photo.scrollIntoViewIfNeeded()
      const height = await photo.evaluate((element) => element.getBoundingClientRect().height)
      const fallback = await page
        .locator('.meal-photo-placeholder')
        .first()
        .evaluate((element) => element.getBoundingClientRect().height)
      expect(Math.abs(height - fallback)).toBeLessThan(2)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`mensa-photos-${theme}-${width}.png`) })
    }
})
