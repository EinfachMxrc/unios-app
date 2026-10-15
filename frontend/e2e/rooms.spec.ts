// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/rooms/config', (route) =>
    route.fulfill({
      json: {
        url: 'https://myapps.hs-coburg.de/raumbuchung',
        rooms: ['4-031', '5-U11a'],
        start_times: ['09:00', '09:30'],
        durations: [30, 90],
      },
    }),
  )
})

test('room booking is discoverable and a browser only opens the official source', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('link', { name: 'Räume & Buchung', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Räume & Buchung' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Raumbuchung öffnen', exact: true })).toHaveAttribute(
    'href',
    'https://myapps.hs-coburg.de/raumbuchung',
  )
  await expect(page.getByText('Noch kein Raum geprüft')).toBeVisible()
  await page.goto('/search?q=Raumbuchung')
  await page.getByRole('link', { name: 'Räume & Buchung' }).click()
  await expect(page).toHaveURL(/\/rooms$/)
})

test('user operates the university window; only an exact offer is shown and expires', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-05T06:00:00Z') })
  await page.addInitScript(() => {
    const target = window as Window & {
      __TAURI_INTERNALS__?: unknown
      bookingCommands?: string[]
      roomHeading?: string
    }
    target.bookingCommands = []
    target.roomHeading = 'Raumbuchung am 05.10. 09:00 für 1:30 h'
    target.__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        target.bookingCommands!.push(command)
        if (command === 'fill_room_booking') return { filled: ['day', 'persons'] }
        if (command === 'read_room_booking')
          return { heading: target.roomHeading, message: 'Der Raum 4-031 steht zur Verfügung.', canBook: true }
        return null
      },
    }
  })
  await page.goto('/rooms')
  await page.getByText('Manuell im Hochschulfenster prüfen', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Raumangebot übernehmen' })).toBeDisabled()
  await page.getByLabel('Personen', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Hochschulfenster öffnen' }).click()
  await page.getByRole('button', { name: 'Auswahl einsetzen' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Felder eingesetzt' })).toBeVisible()
  await page.getByRole('button', { name: 'Raumangebot übernehmen' }).click()
  await expect(page.locator('.room-offer h3')).toHaveText('4-031')
  await expect(page.getByText('Noch nicht reserviert.', { exact: false })).toBeVisible()
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      localStorage.setItem('unios-theme', value)
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`rooms-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
  await page.clock.fastForward(125_000)
  await expect(page.getByText('Angebot erneut prüfen')).toBeVisible()
  await page.getByLabel('Datum', { exact: true }).fill('2026-10-06')
  await expect(page.locator('.room-offer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Raumangebot übernehmen' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Kein eindeutiges Angebot' })).toBeVisible()
  const commands = await page.evaluate(() => (window as Window & { bookingCommands: string[] }).bookingCommands)
  expect(
    commands.every((command) => ['open_room_booking', 'fill_room_booking', 'read_room_booking'].includes(command)),
  ).toBe(true)
})

test('closed or logged-out windows do not retain an available offer', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'read_room_booking') throw new Error('booking-login-required')
        return null
      },
    }
  })
  await page.goto('/rooms')
  await page.getByRole('button', { name: 'Hochschulfenster öffnen' }).click()
  await page.getByText('Manuell im Hochschulfenster prüfen', { exact: true }).click()
  await page.getByRole('button', { name: 'Raumangebot übernehmen' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'persönliche Anmeldung' })).toBeVisible()
  await expect(page.locator('.room-offer')).toHaveCount(0)
})

test('an unsupported university has no guessed room service', async ({ page }) => {
  await page.route('**/api/rooms/config', (route) =>
    route.fulfill({ json: { url: null, rooms: [], start_times: [], durations: [] } }),
  )
  await page.goto('/rooms')
  await expect(page.getByText('Für deine Hochschule ist noch keine geprüfte Raumbuchung eingerichtet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Raumbuchung öffnen', exact: true })).toHaveCount(0)
})

test('checks rooms automatically for an exact slot and distinguishes unknown replies and booking restrictions', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-05T06:00:00Z') })
  await page.addInitScript(() => {
    const target = window as Window & {
      __TAURI_INTERNALS__?: unknown
      availabilityCalls?: { room: string; day: string; persons: number; startTime: string; duration: number }[]
      availabilityLimit?: boolean
    }
    target.availabilityCalls = []
    target.__TAURI_INTERNALS__ = {
      invoke: async (
        command: string,
        args: { selection: { room: string; day: string; persons: number; startTime: string; duration: number } },
      ) => {
        if (command !== 'check_room_availability') return null
        target.availabilityCalls!.push(args.selection)
        if (target.availabilityLimit) return { status: 'advance-limit' }
        if (args.selection.room === '5-U11a') return { status: 'unknown' }
        return {
          status: 'offered',
          snapshot: {
            heading: 'Raumbuchung am 05.10. 09:00 für 1:30 h',
            message: 'Der Raum 4-031 steht zur Verfügung.',
            canBook: true,
          },
        }
      },
    }
  })
  await page.goto('/rooms')
  await expect(page.getByRole('button', { name: 'Verfügbarkeit prüfen', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Hochschulfenster öffnen' }).click()
  await page.getByRole('button', { name: 'Alle Räume prüfen', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '2 von 2 Räumen geprüft' })).toBeVisible()
  const comparison = page.locator('.room-comparison')
  await expect(comparison.getByRole('button', { name: /4-031/ })).toContainText('Von der Hochschule angeboten')
  await expect(comparison.getByRole('button', { name: /5-U11a/ })).toContainText('Status unklar')
  await expect(comparison.getByRole('button', { name: /4-031/ })).toContainText('Direkt bei der Hochschule geprüft')
  expect(await page.evaluate(() => (window as Window & { availabilityCalls: unknown[] }).availabilityCalls)).toEqual([
    { room: '4-031', day: '2026-10-05', persons: 1, startTime: '09:00', duration: 90 },
    { room: '5-U11a', day: '2026-10-05', persons: 1, startTime: '09:00', duration: 90 },
  ])
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`room-query-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
  await page.evaluate(() => {
    ;(window as Window & { availabilityLimit?: boolean }).availabilityLimit = true
  })
  await page.getByRole('combobox', { name: 'Raum', exact: true }).selectOption('4-031')
  await page.getByRole('button', { name: 'Verfügbarkeit prüfen', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'höchstens 14 Tage' })).toBeVisible()
  await expect(comparison.getByRole('button', { name: /4-031/ })).toContainText('Status unklar')
  await expect(page.locator('.room-offer')).toHaveCount(0)
  await expect(comparison.locator('.is-conflict')).toHaveCount(0)
  await page.getByLabel('Personen', { exact: true }).fill('2')
  await expect(comparison.locator('.is-unknown')).toHaveCount(2)
})

test('stopping a sequential availability scan does not request the next room', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & {
      __TAURI_INTERNALS__?: unknown
      availabilityCalls?: number
      finishAvailability?: (result: unknown) => void
    }
    target.availabilityCalls = 0
    target.__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command !== 'check_room_availability') return null
        target.availabilityCalls!++
        return new Promise((resolve) => {
          target.finishAvailability = resolve
        })
      },
    }
  })
  await page.goto('/rooms')
  await page.getByRole('button', { name: 'Hochschulfenster öffnen' }).click()
  await page.getByRole('button', { name: 'Alle Räume prüfen', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '0 von 2 Räumen geprüft' })).toBeVisible()
  await page.getByRole('button', { name: 'Prüfung stoppen' }).click()
  await page.evaluate(() =>
    (window as Window & { finishAvailability?: (result: unknown) => void }).finishAvailability!({ status: 'unknown' }),
  )
  await expect(page.getByRole('status').filter({ hasText: 'Prüfung gestoppt' })).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { availabilityCalls: number }).availabilityCalls)).toBe(1)
  await expect(page.getByRole('button', { name: 'Alle Räume prüfen', exact: true })).toBeEnabled()
})

test('occupancy compares exact slots and distinguishes confirmed conflicts, unknown rooms and older checks', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-05T06:00:00Z') })
  await page.route('**/api/rooms/config', (route) =>
    route.fulfill({
      json: {
        url: 'https://myapps.hs-coburg.de/raumbuchung',
        rooms: ['4-030', '4-031', '4-032', '4-034', '4-035', '4-036', '4-037', '4-038', '4-039', '5-U11a'],
        start_times: ['09:00', '09:30'],
        durations: [30, 90],
      },
    }),
  )
  await page.addInitScript(() => {
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'read_room_booking')
          return {
            heading: 'Raumbuchung am 05.10. 09:00 für 1:30 h',
            message: 'Der Raum 4-031 steht zur Verfügung.',
            canBook: true,
          }
        return null
      },
    }
  })
  await page.goto('/rooms')
  await expect(page.getByRole('heading', { level: 1, name: 'Räume & Buchung' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toBeFocused()
  await expect(page.locator('.skip-link')).toHaveCSS('clip-path', 'none')
  await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toHaveCSS('clip-path', 'inset(50%)')
  await page.getByText('Die Hochschule meldet den Raum als belegt?', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Buchungskonflikt merken' })).toBeDisabled()
  await page.getByRole('combobox', { name: 'Raum', exact: true }).selectOption('4-030')
  await expect(page.getByRole('button', { name: 'Buchungskonflikt merken' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Buchungskonflikt merken' }).click()
  const rooms = page.locator('.room-comparison')
  await expect(rooms.getByRole('button', { name: /4-030/ })).toContainText('Buchungskonflikt')
  await expect(rooms.getByRole('button', { name: /4-030/ })).toContainText('Von dir bestätigt')
  await expect(rooms.getByRole('button', { name: /4-032/ })).toContainText('Unbekannt')
  await page.getByRole('combobox', { name: 'Raum', exact: true }).selectOption('4-031')
  await page.getByRole('button', { name: 'Hochschulfenster öffnen' }).click()
  await page.getByText('Manuell im Hochschulfenster prüfen', { exact: true }).click()
  await page.getByRole('button', { name: 'Raumangebot übernehmen' }).click()
  await expect(rooms.getByRole('button', { name: /4-031/ })).toContainText('Von der Hochschule angeboten')
  await expect(rooms.getByRole('button', { name: /4-030/ })).toContainText('Buchungskonflikt')
  await expect(page.locator('.room-check-history li')).toHaveCount(2)
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`occupancy-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
  await page.getByRole('combobox', { name: 'Beginn', exact: true }).selectOption('09:30')
  await expect(rooms.locator('.is-unknown')).toHaveCount(10)
  await page.getByRole('button', { name: /09:00–10:30 4-030/ }).click()
  await expect(page.getByRole('combobox', { name: 'Beginn', exact: true })).toHaveValue('09:00')
  await expect(page.getByRole('combobox', { name: 'Raum', exact: true })).toHaveValue('4-030')
  await page.getByLabel('Personen', { exact: true }).fill('2')
  await expect(rooms.locator('.is-unknown')).toHaveCount(10)
  await page.getByLabel('Personen', { exact: true }).fill('1')
  await page.clock.fastForward(125_000)
  await expect(rooms.locator('.is-stale')).toHaveCount(2)
  await expect(rooms.locator('.is-conflict, .is-available')).toHaveCount(0)
  await page.getByLabel('Datum', { exact: true }).fill('2026-10-06')
  await expect(page.locator('.room-check-history')).toHaveCount(0)
  await expect(rooms.locator('.is-unknown')).toHaveCount(10)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('link', { name: 'Mehr', exact: true }).click()
  await page.getByRole('link', { name: 'Räume & Buchung', exact: true }).click()
  await expect(page.locator('.room-check-history li')).toHaveCount(2)
  await expect(rooms.locator('.is-stale')).toHaveCount(2)
})
