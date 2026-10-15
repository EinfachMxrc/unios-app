// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import { primussCandidate, readPrimussWindow } from './primussCrawl'
import type { CrawlBridge } from './portalCrawl'

it('opens JavaScript reading menus, discovers their children and never submits a form', async () => {
  const url = 'https://portal.example.edu/index?Session=fictional'
  let expanded = false
  let document = false
  const clicks: string[] = []
  const guards: number[] = []
  const bridge: CrawlBridge = {
    async capabilities() {
      return { traversal: true }
    },
    status: async () => ({ url, ready: 'complete', textLength: expanded ? 200 : 100, hasPassword: false }),
    snapshot: async () => ({
      url,
      title: 'Studium',
      html: `<body>${document ? 'Bescheinigung' : expanded ? 'Meine Prüfungen Notenübersicht' : 'Startseite'}</body>`,
    }),
    links: async () => ({
      url,
      links: [
        { index: 0, text: 'Meine Prüfungen', href: 'javascript:menu(1)', visible: true },
        ...(expanded ? [{ index: 1, text: 'Notenübersicht', href: 'javascript:menu(2)', visible: true }] : []),
        { index: 2, text: 'Prüfung anmelden', href: 'javascript:write()', visible: true },
      ],
    }),
    click: async (_index, label) => {
      clicks.push(label)
      if (label === 'Meine Prüfungen') expanded = true
      if (label === 'Notenübersicht') document = true
      return true
    },
    navigate: async () => undefined,
    guard: async (_active, budget) => {
      guards.push(budget)
    },
    scroll: async () => false,
    sleep: async () => undefined,
  }
  const result = await readPrimussWindow(bridge)
  expect(result.pages).toHaveLength(3)
  expect(clicks).toEqual(['Meine Prüfungen', 'Notenübersicht'])
  expect(guards.every((budget) => budget === 0)).toBe(true)
  expect(result.partial).toBe(false)
})

it('rejects foreign and modifying links and flags blocked dynamic navigation', async () => {
  const link = (text: string, href: string) => ({ text, href, index: 0, visible: true })
  expect(primussCandidate(link('Noten anzeigen', 'https://evil.example/a'), 'portal.example.edu')).toBe(false)
  expect(
    primussCandidate(link('Noten anzeigen', 'https://portal.example.edu/a?action=submit'), 'portal.example.edu'),
  ).toBe(false)
  expect(primussCandidate(link('Noten löschen', 'javascript:remove()'), 'portal.example.edu')).toBe(false)
})

it('reads only the open PRIMUSS page without a native traversal guard', async () => {
  const forbidden = async () => {
    throw new Error('unexpected portal interaction')
  }
  const bridge: CrawlBridge = {
    capabilities: async () => ({ traversal: false }),
    status: async () => ({
      url: 'https://portal.example.edu/grades',
      ready: 'complete',
      textLength: 200,
      hasPassword: false,
    }),
    snapshot: async () => ({
      url: 'https://portal.example.edu/grades',
      title: 'Leistungen',
      html: '<html>fictional grades page</html>',
    }),
    guard: forbidden,
    navigate: forbidden,
    click: forbidden,
    links: forbidden,
    scroll: forbidden,
    sleep: async () => undefined,
  }
  const result = await readPrimussWindow(bridge)
  expect(result.pages).toHaveLength(1)
  expect(result.partial).toBe(true)
})
