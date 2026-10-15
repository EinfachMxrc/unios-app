// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './fixtures'
import { calendarDeadlines, calendarEvents, calendarNow, calendarStatus } from './calendar-fixtures'

const preferencesKey = 'unios-calendar-preferences-v1'
const lateEvent = {
  id: 9010,
  title: 'Synthetische Vertiefung · R404, Fiktiver Campus',
  starts_at: '2026-10-08T14:00:00Z',
  ends_at: '2026-10-08T15:30:00Z',
  revision: 'synthetic-calendar-visibility-1',
}
const events = [...calendarEvents, lateEvent]
const qaDirectory = path.resolve(import.meta.dirname, '../../docs/qa/calendar-visibility-20261010')

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(calendarNow) })
  await page.route('**/api/timetable/status', (route) =>
    route.fulfill({
      json: { ...calendarStatus, event_count: events.length },
    }),
  )
  await page.route('**/api/timetable/events?**', (route) => {
    const start = new URL(route.request().url()).searchParams.get('day')!
    const end = new Date(`${start}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() + 7)
    return route.fulfill({
      json: events.filter(
        (event) =>
          event.starts_at.slice(0, 10) >= start && event.starts_at.slice(0, 10) < end.toISOString().slice(0, 10),
      ),
    })
  })
  await page.route('**/api/deadlines', (route) => route.fulfill({ json: calendarDeadlines }))
})

async function openCalendar(page: Page) {
  await page.goto('/deadlines#timetable')
  const schedule = page.locator('#timetable')
  await expect(schedule.getByRole('button', { name: 'Arbeitswoche', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(schedule.getByTestId(`timetable-event-${lateEvent.id}`)).toHaveCount(1)
  return schedule
}

async function geometry(page: Page, scope = page.locator('#timetable')) {
  return scope.locator('.calendar-time-scroll').evaluate((area) => {
    const body = area.querySelector<HTMLElement>('.calendar-time-body')!
    const bounds = area.getBoundingClientRect()
    const top = bounds.top + area.clientTop
    const bottom = top + area.clientHeight
    const appointments = [...body.querySelectorAll<HTMLElement>('.calendar-appointment')]
    return {
      hourPx: Number.parseFloat(getComputedStyle(body).getPropertyValue('--calendar-hour')),
      height: area.clientHeight,
      bodyHeight: body.getBoundingClientRect().height,
      scrollHeight: area.scrollHeight,
      scrollTop: area.scrollTop,
      outside: appointments
        .filter((event) => {
          const rect = event.getBoundingClientRect()
          return rect.top < top - 1 || rect.bottom > bottom + 1
        })
        .map((event) => event.dataset.testid),
    }
  })
}

async function expectFitted(page: Page, schedule = page.locator('#timetable')) {
  await expect(schedule.getByRole('button', { name: 'Alle Termine einpassen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(schedule.locator('.calendar-time-column .calendar-appointment')).toHaveCount(events.length)
  await expect.poll(async () => (await geometry(page, schedule)).outside).toEqual([])
  const measured = await geometry(page, schedule)
  expect(measured.height).toBeGreaterThan(0)
  expect(measured.hourPx).toBeGreaterThan(0)
  expect(measured.bodyHeight).toBeCloseTo(24 * measured.hourPx, 0)
  expect(measured.scrollHeight).toBeGreaterThan(measured.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
}

async function expectInBrowserViewport(page: Page, scope: Locator) {
  await expect
    .poll(() =>
      scope.locator('.calendar-time-column .calendar-appointment').evaluateAll((appointments) =>
        appointments
          .filter((appointment) => {
            const bounds = appointment.getBoundingClientRect()
            return (
              bounds.top < 0 ||
              bounds.bottom > window.innerHeight + 1 ||
              bounds.left < 0 ||
              bounds.right > window.innerWidth + 1
            )
          })
          .map((appointment) => appointment.getAttribute('data-testid')),
      ),
    )
    .toEqual([])
  const grid = (await scope.locator('.calendar-time-scroll').boundingBox())!
  expect(grid.y).toBeGreaterThanOrEqual(0)
  expect(grid.y + grid.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
}

async function trackFocus(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __uniosCalendarFocusHistory?: { event: string; time: number; element: string }[]
    }
    const history = (testWindow.__uniosCalendarFocusHistory = [])
    for (const name of ['focusin', 'focusout'])
      document.addEventListener(
        name,
        (event) => {
          history.push({
            event: name,
            time: performance.now(),
            element: event.target instanceof Element ? event.target.outerHTML.slice(0, 1800) : '',
          })
          if (history.length > 80) history.shift()
        },
        { capture: true },
      )
  })
}

async function focusDiagnostic(page: Page, testInfo: TestInfo, name: string) {
  const diagnostic = await page.evaluate(() => {
    const testWindow = window as Window & {
      __uniosCalendarFocusHistory?: { event: string; time: number; element: string }[]
    }
    const expand = document.querySelector<HTMLButtonElement>('#timetable button[aria-label="Kalender groß anzeigen"]')
    const ancestors: { tag: string; className: string; ariaHidden: string | null; inert: boolean }[] = []
    for (let element: HTMLElement | null = expand ?? null; element; element = element.parentElement) {
      ancestors.push({
        tag: element.tagName,
        className: element.className,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.inert,
      })
    }
    return {
      activeElement: document.activeElement?.outerHTML.slice(0, 3000),
      expand: expand
        ? {
            isConnected: expand.isConnected,
            disabled: expand.disabled,
            tabIndex: expand.tabIndex,
            bounds: expand.getBoundingClientRect().toJSON(),
            outerHTML: expand.outerHTML,
          }
        : null,
      ancestors,
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((element) => ({
        className: element.className,
        state: element.getAttribute('data-state'),
        ariaHidden: element.getAttribute('aria-hidden'),
      })),
      focusHistory: testWindow.__uniosCalendarFocusHistory ?? [],
    }
  })
  await testInfo.attach(name, { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' })
}

async function expectReturnedFocus(page: Page, expand: Locator, testInfo: TestInfo) {
  await focusDiagnostic(page, testInfo, 'calendar-focus-immediately-after-close.json')
  try {
    await expect(expand).toBeFocused()
  } catch (error) {
    await focusDiagnostic(page, testInfo, 'calendar-focus-return-failure.json')
    throw error
  }
}

async function screenshot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  await mkdir(qaDirectory, { recursive: true })
  let destination = path.join(qaDirectory, `${name}.png`)
  try {
    await access(destination)
    // Keep previous audit evidence when a repair requires another browser run.
    destination = path.join(qaDirectory, `${name}-${Date.now()}.png`)
  } catch {
    /* This is the first screenshot for the scenario. */
  }
  await page.screenshot({ path: screenshotPath(destination), fullPage, animations: 'disabled' })
  await testInfo.attach(name, { path: screenshotPath(destination), contentType: 'image/png' })
}

for (const viewport of [
  { width: 1300, height: 820 },
  { width: 1280, height: 720 },
]) {
  test(`fits the full teaching week through 17:30 at ${viewport.width}x${viewport.height} without removing night hours`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    const schedule = await openCalendar(page)
    await expectFitted(page)
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
      await expectFitted(page)
      await screenshot(page, testInfo, `calendar-fit-${theme}-${viewport.width}-${viewport.height}`)
    }

    const area = schedule.locator('.calendar-time-scroll')
    await expect(area.locator('.calendar-time-axis span')).toHaveCount(24)
    await area.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect.poll(async () => (await geometry(page)).scrollTop).toBe(0)
    const first = await area.locator('.calendar-time-axis span').first().boundingBox()
    const bounds = (await area.boundingBox())!
    expect(first!.y + first!.height).toBeGreaterThan(bounds.y)
    await area.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const end = await geometry(page)
    expect(end.scrollTop).toBeCloseTo(end.scrollHeight - end.height, 0)
    const last = (await area.locator('.calendar-time-axis span').last().boundingBox())!
    expect(last.y).toBeGreaterThanOrEqual(bounds.y)
    expect(last.y + last.height).toBeLessThanOrEqual(bounds.y + bounds.height)
    // Fit is already active: the explicit action must still restore the teaching range after scrolling.
    await schedule.getByRole('button', { name: 'Alle Termine einpassen', exact: true }).click()
    await expectFitted(page)
  })

  test(`large calendar shows every teaching appointment inside the actual ${viewport.width}x${viewport.height} window and restores keyboard focus`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    const schedule = await openCalendar(page)
    const expand = schedule.getByRole('button', { name: 'Kalender groß anzeigen', exact: true })
    await trackFocus(page)
    await expand.click()
    const large = page.getByRole('dialog', { name: 'Stundenplan', exact: true })
    await expect(large).toBeVisible()
    await expect(large.getByRole('button', { name: 'Große Ansicht schließen', exact: true })).toBeVisible()
    await expectFitted(page, large)
    await expectInBrowserViewport(page, large)
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
      await expectInBrowserViewport(page, large)
      await screenshot(page, testInfo, `calendar-large-${theme}-${viewport.width}-${viewport.height}`, false)
    }
    if (viewport.width === 1300) {
      const trigger = large.getByTestId(`timetable-event-${lateEvent.id}`).locator('[data-calendar-trigger]')
      await trigger.press('Enter')
      const details = page.locator('.calendar-event-dialog')
      await expect(details).toContainText('R404, Fiktiver Campus')
      await details.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
      await expect(details.getByLabel('Beginn', { exact: true })).toHaveValue('2026-10-08T16:00')
      await page.keyboard.press('Escape')
      await expect(details).toHaveCount(0)
      await expect(large).toBeVisible()
      await expect(trigger).toBeFocused()
    }
    await page.keyboard.press('Escape')
    await expect(large).toHaveCount(0)
    await expectReturnedFocus(page, expand, testInfo)
    await expect(schedule.locator('.calendar-time-scroll')).toHaveCount(1)
  })
}

test('manual zoom persists across reload and fitting restores the complete teaching week', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 820 })
  const schedule = await openCalendar(page)
  const fit = schedule.getByRole('button', { name: 'Alle Termine einpassen', exact: true })
  const reset = schedule.getByRole('button', { name: 'Stundenhöhe zurücksetzen', exact: true })
  await expectFitted(page)
  const manualBefore = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferencesKey)
  expect(manualBefore?.hourPx ?? 64).toBe(64)
  const ordinaryWheelWasAllowed = await schedule
    .locator('.calendar-time-scroll')
    .evaluate((area) => area.dispatchEvent(new WheelEvent('wheel', { deltaY: 80, cancelable: true, bubbles: true })))
  expect(ordinaryWheelWasAllowed).toBe(true)

  await schedule.getByRole('button', { name: 'Größere Stundenhöhe', exact: true }).click()
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  await reset.click()
  await expect(reset).toHaveText('100%')
  await expect.poll(async () => (await geometry(page)).hourPx).toBe(64)
  await schedule.getByRole('button', { name: 'Kleinere Stundenhöhe', exact: true }).click()
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await geometry(page)).hourPx).toBe(56)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferencesKey)).toMatchObject({
    hourPx: 56,
    fit: false,
  })
  await page.reload()
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await geometry(page)).hourPx).toBe(56)
  await expect(reset).toHaveText('88%')
  await fit.click()
  await expectFitted(page)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferencesKey)).toMatchObject({
    hourPx: 56,
    fit: true,
  })
})

test('mobile agenda retains full titles, times, rooms and accessible day selection in both themes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/deadlines#timetable')
  const schedule = page.locator('#timetable')
  const thursday = schedule.getByRole('button', { name: /Donnerstag, 8\. Oktober 2026$/ })
  await expect(thursday).toBeVisible()
  expect((await thursday.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await thursday.click()
  const late = schedule.getByTestId(`timetable-event-${lateEvent.id}`)
  await expect(schedule.locator('.calendar-agenda article')).toHaveCount(2)
  await expect(late).toContainText('Synthetische Vertiefung')
  await expect(late).toContainText('16:00 – 17:30')
  await expect(late).toContainText('R404')
  await expect(late.locator('[data-calendar-trigger]')).toHaveAttribute('aria-label', /Fiktiver Campus/)
  await expect(schedule.locator('.calendar-time-scroll')).toHaveCount(0)
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await screenshot(page, testInfo, `calendar-agenda-${theme}-390`)
  }
  await late.locator('[data-calendar-trigger]').click()
  await expect(page.getByRole('dialog')).toContainText('R404, Fiktiver Campus')
  await expect(page.getByRole('dialog')).toContainText('17:30')
})

test('enlarged text preserves complete details and fits without horizontal overflow at desktop and mobile', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('unios-accessibility-v1', JSON.stringify({ scale: 150, contrast: false, reduceMotion: true }))
  })
  await page.setViewportSize({ width: 1300, height: 820 })
  const schedule = await openCalendar(page)
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).fontSize)).toBe('24px')
  await expectFitted(page)
  const late = schedule.getByTestId(`timetable-event-${lateEvent.id}`)
  const trigger = late.locator('[data-calendar-trigger]')
  await expect(trigger).toHaveAttribute('aria-label', 'Synthetische Vertiefung · 16:00 – 17:30 · R404, Fiktiver Campus')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('R404, Fiktiver Campus')
  await expect(page.getByRole('dialog')).toContainText('17:30')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    await expectFitted(page)
    await screenshot(page, testInfo, `calendar-fit-150-${theme}-1300-820`)
  }
  const expand = schedule.getByRole('button', { name: 'Kalender groß anzeigen', exact: true })
  await trackFocus(page)
  await expand.click()
  const large = page.getByRole('dialog', { name: 'Stundenplan', exact: true })
  await expectFitted(page, large)
  await expectInBrowserViewport(page, large)
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    await expectInBrowserViewport(page, large)
    await screenshot(page, testInfo, `calendar-large-150-${theme}-1300-820`, false)
  }
  await page.keyboard.press('Escape')
  await expect(large).toHaveCount(0)
  await expectReturnedFocus(page, expand, testInfo)
  await page.setViewportSize({ width: 390, height: 844 })
  await schedule.getByRole('button', { name: /Donnerstag, 8\. Oktober 2026$/ }).click()
  const heading = schedule.locator('.timetable-navigation strong')
  await expect
    .poll(() => heading.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1)
  const headingBounds = (await heading.boundingBox())!
  const scheduleBounds = (await schedule.boundingBox())!
  expect(headingBounds.x).toBeGreaterThanOrEqual(scheduleBounds.x)
  expect(headingBounds.x + headingBounds.width).toBeLessThanOrEqual(scheduleBounds.x + scheduleBounds.width + 1)
  await expect(late).toContainText('16:00 – 17:30')
  await expect(late).toContainText('R404')
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await screenshot(page, testInfo, `calendar-agenda-150-${theme}-390`)
  }
})

test('calendar edge: early and late appointments remain reachable when the readable 24 hour spread cannot fit at once', async ({
  page,
}) => {
  const early = {
    id: 9020,
    title: 'Synthetischer Frühtermin · R505',
    starts_at: '2026-10-05T04:00:00Z',
    ends_at: '2026-10-05T04:30:00Z',
  }
  const late = {
    id: 9021,
    title: 'Synthetischer Spättermin · R606',
    starts_at: '2026-10-08T21:30:00Z',
    ends_at: '2026-10-08T21:59:00Z',
  }
  await page.route('**/api/timetable/events?**', (route) => route.fulfill({ json: [...events, early, late] }))
  await page.setViewportSize({ width: 1300, height: 820 })
  const schedule = await openCalendar(page)
  await expect(schedule.locator('.calendar-time-column .calendar-appointment')).toHaveCount(events.length + 2)
  await expect(schedule.getByRole('button', { name: 'Alle Termine einpassen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect((await geometry(page)).hourPx).toBeGreaterThanOrEqual(44)
  await expect.poll(async () => (await geometry(page)).outside).toContain(`timetable-event-${late.id}`)
  const later = schedule.getByRole('button', { name: /spätere Termine anzeigen/ })
  await expect(later).toBeVisible()
  await later.click()
  await expect.poll(async () => (await geometry(page)).outside).not.toContain(`timetable-event-${late.id}`)
  await expect(schedule.getByTestId(`timetable-event-${late.id}`).locator('[data-calendar-trigger]')).toHaveAttribute(
    'aria-label',
    /23:30 – 23:59/,
  )
  const earlier = schedule.getByRole('button', { name: /frühere Termine anzeigen/ })
  await expect(earlier).toBeVisible()
  await earlier.click()
  await expect.poll(async () => (await geometry(page)).outside).not.toContain(`timetable-event-${early.id}`)
  await expect(later).toBeVisible()
  await expect(schedule.locator('.calendar-time-axis span')).toHaveCount(24)
  const measured = await geometry(page)
  expect(measured.bodyHeight).toBeCloseTo(24 * measured.hourPx, 0)
  expect(measured.scrollHeight).toBeGreaterThan(measured.height)
})

test('calendar edge: fitting locks gesture geometry during a window resize and Escape cancels without saving', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1300, height: 820 })
  const schedule = await openCalendar(page)
  await schedule.getByRole('button', { name: 'Kalender groß anzeigen', exact: true }).click()
  const large = page.getByRole('dialog', { name: 'Stundenplan', exact: true })
  await expectFitted(page, large)
  await expect(large.getByRole('button', { name: 'Neuer Termin', exact: true })).toBeEnabled()
  let saves = 0
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/timetable/events/${lateEvent.id}`)
      saves++
  })
  const trigger = large.getByTestId(`timetable-event-${lateEvent.id}`).locator('[data-calendar-trigger]')
  const before = await geometry(page, large)
  const bounds = (await trigger.boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 20, { steps: 5 })
  await expect(large.locator('.calendar-drag-preview')).toHaveCount(1)
  for (const name of ['Alle Termine einpassen', 'Stundenhöhe zurücksetzen', 'Größere Stundenhöhe']) {
    await expect(large.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  const during = await geometry(page, large)
  expect(during.hourPx).toBeCloseTo(before.hourPx, 5)
  expect(during.height).toBe(before.height)
  await expect(large.locator('.calendar-drag-preview')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(large.locator('.calendar-drag-preview')).toHaveCount(0)
  await expectFitted(page, large)
  await expectInBrowserViewport(page, large)
  await expect(trigger).toHaveAttribute('aria-label', /16:00 – 17:30/)
  expect(saves).toBe(0)
  await expect(large.getByRole('button', { name: 'Alle Termine einpassen', exact: true })).toBeEnabled()
})
