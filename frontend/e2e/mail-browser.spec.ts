// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('desktop mail scan imports synthetic messages and preserves explicit deadline confirmation', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { mail: true } }))
    let opened = false
    const calls: Array<[string, unknown]> = []
    Object.assign(window, { __mailCalls: calls, __TAURI_INTERNALS__: {
      invoke: async (command: string, args: unknown) => {
        calls.push([command, args])
        if (command === 'open_university_mail') { opened = true; return }
        if (command === 'portal_status') {
          if (!opened) throw new Error('fixture window closed')
          return { url: 'https://outlook.office.com/mail/', ready: 'complete', textLength: 500, hasPassword: false }
        }
        if (command === 'portal_capture_capabilities') return { traversal: true }
        if (command === 'portal_links') return { url: 'https://outlook.office.com/mail/', links: [
          { index: 0, text: 'Abmelden', href: '', visible: true, role: 'link', messageRow: false },
          { index: 1, text: 'Erfundene Mail zur Frist', href: '', visible: true, role: 'option', messageRow: true },
        ] }
        if (command === 'portal_click') return true
        if (command === 'portal_scroll') return false
        if (command === 'snapshot_portal_page') return {
          url: 'https://outlook.office.com/mail/', title: 'Fixture',
          html: '<div role="main"><h1>Erfundene Browser-Mail</h1><header><span title="office@example.test">Büro</span></header><time datetime="2026-10-14T10:00:00Z"></time><div role="document">Die Frist endet bis zum 14.10.2099.</div></div>',
        }
      },
    } })
  })
  await page.goto('/mail')
  await page.locator('.mail-settings > summary').click()
  const scan = page.getByRole('button', { name: 'Im eigenen Fenster anmelden und lesen', exact: true })
  await scan.click()
  await expect(page.getByText('Erfundene Browser-Mail', { exact: true })).toBeVisible()
  const deadlines = await (await page.request.get('/api/deadlines')).json()
  expect(deadlines.deadlines.some((row: { title: string }) => row.title === 'Erfundene Browser-Mail')).toBe(false)
  const calls = await page.evaluate(() => (window as unknown as { __mailCalls: Array<[string, unknown]> }).__mailCalls)
  expect(calls.filter(([command]) => command === 'portal_click').map(([, args]) => args)).toEqual([
    { portal: 'mail', index: 1, expectedText: 'Erfundene Mail zur Frist' },
  ])
  expect(calls.filter(([command]) => command === 'portal_guard').map(([, args]) => args)).toEqual([
    { active: true, menuBudget: 0 }, { active: false, menuBudget: 0 },
  ])
  await scan.click()
  await expect(scan).toBeEnabled()
  const messages = await (await page.request.get('/api/mail')).json()
  expect(messages.filter((row: { subject: string }) => row.subject === 'Erfundene Browser-Mail')).toHaveLength(1)
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: info.outputPath(`mail-browser-${theme}-${width}.png`), fullPage: true })
  }
})
