// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  chunkPages,
  classifyLabel,
  crawlPortal,
  isForbiddenLabel,
  pickCandidates,
  type CrawlBridge,
  type PortalLink,
} from './portalCrawl'

const HOST = 'https://portal.example.edu'

type FakePage = {
  html?: string
  links?: Array<Partial<PortalLink> & { text: string }>
  text?: number
  password?: boolean
}

/** A small invented portal: pages by address, each with the links it shows. */
function fakePortal(pages: Record<string, FakePage>) {
  const calls = { navigate: [] as string[], click: [] as string[], guard: [] as Array<[boolean, number]> }
  let current = `${HOST}/`
  const page = () => pages[current] ?? { text: 0 }
  const bridge: CrawlBridge = {
    async capabilities() {
      return { traversal: true }
    },
    async status() {
      const found = page()
      return { url: current, ready: 'complete', textLength: found.text ?? 500, hasPassword: found.password ?? false }
    },
    async snapshot() {
      return { url: current, title: 'Seite', html: page().html ?? `<html><body>${current}</body></html>` }
    },
    async navigate(url) {
      calls.navigate.push(url)
      current = url
    },
    async links() {
      return {
        url: current,
        links: (page().links ?? []).map((link, index) => ({ index, href: '', visible: true, ...link })),
      }
    },
    async click(index, text) {
      calls.click.push(text)
      const link = (page().links ?? [])[index]
      if (!link || link.text !== text) return false
      current = `${HOST}/click/${encodeURIComponent(text)}`
      return true
    },
    async guard(active, menuBudget) {
      calls.guard.push([active, menuBudget])
    },
    async scroll() {
      return false
    },
    async sleep() {},
  }
  return { bridge, calls }
}

describe('label rules', () => {
  it('never opens entries that end a session or change something', () => {
    for (const label of [
      'Abmelden',
      'Logout',
      'Passwort ändern',
      'Prüfung anmelden',
      'Löschen',
      'Datenschutz',
      'Speichern (save)',
    ]) {
      expect(isForbiddenLabel(label)).toBe(true)
    }
    for (const label of ['Blog', 'Stundenplan', 'Prüfungen', 'Notenspiegel', 'Prüfungsanmeldung']) {
      expect(isForbiddenLabel(label)).toBe(false)
    }
  })

  it('sorts entries into the page kinds the samples are stored under', () => {
    expect(classifyLabel('Aktuelle Blog-Beiträge')).toBe('blog')
    expect(classifyLabel('Stundenplan WS 26')).toBe('timetable')
    expect(classifyLabel('Veranstaltungen')).toBe('events')
    expect(classifyLabel('Neuigkeiten')).toBe('news')
    expect(classifyLabel('Rückmeldung')).toBe('enrollment')
    expect(classifyLabel('Notenspiegel')).toBe('grades')
    expect(classifyLabel('Prüfungen')).toBe('exams')
    expect(classifyLabel('Mein Studium')).toBe('study_program')
    expect(classifyLabel('Mensa')).toBe('other')
  })

  it('offers only visible, on-host, unseen entries and ranks known kinds first', () => {
    const links: PortalLink[] = [
      { index: 0, text: 'Mensa', href: `${HOST}/mensa`, visible: true },
      { index: 1, text: 'Blog', href: `${HOST}/blog`, visible: true },
      { index: 2, text: 'Fremde Seite', href: 'https://other.example/x', visible: true },
      { index: 3, text: 'Abmelden', href: `${HOST}/logout`, visible: true },
      { index: 4, text: 'Versteckt', href: `${HOST}/hidden`, visible: false },
      { index: 5, text: 'Nur Anker', href: `${HOST}/#`, visible: true },
      { index: 6, text: 'Schon gesehen', href: `${HOST}/seen`, visible: true },
      { index: 7, text: 'Stundenplan', href: '', visible: true },
      { index: 8, text: 'Stundenplan', href: '', visible: true },
      { index: 9, text: 'Mail', href: 'mailto:a@b.de', visible: true },
    ]
    const picked = pickCandidates(links, 'portal.example.edu', new Set([`${HOST}/seen`]), `${HOST}/start`)
    expect(picked.map((item) => item.link.text)).toEqual(['Blog', 'Stundenplan', 'Mensa'])
  })
})

describe('crawlPortal', () => {
  const site = (): Record<string, FakePage> => ({
    [`${HOST}/`]: {
      links: [
        { text: 'Blog', href: `${HOST}/blog` },
        { text: 'Neuigkeiten', href: `${HOST}/news` },
        { text: 'Stundenplan' },
        { text: 'Abmelden', href: `${HOST}/logout` },
        { text: 'Extern', href: 'https://elsewhere.example/' },
      ],
    },
    [`${HOST}/blog`]: {
      html: '<html>blog-liste</html>',
      links: [{ text: 'Semesterstart 2026', href: `${HOST}/blog/1` }],
    },
    [`${HOST}/blog/1`]: { html: '<html>blog-eintrag-1</html>' },
    [`${HOST}/news`]: { html: '<html>news-liste</html>' },
    [`${HOST}/click/Stundenplan`]: { html: '<html>plan</html>' },
    [`${HOST}/logout`]: { html: '<html>abgemeldet</html>' },
  })

  it('collects the start page, the entries and what the interesting pages link to', async () => {
    const { bridge } = fakePortal(site())
    const result = await crawlPortal(bridge)
    expect(result.pages.map((page) => page.kind)).toEqual(['start', 'blog', 'news', 'timetable', 'other'])
    expect(result.pages.map((page) => page.html)).toContain('<html>blog-eintrag-1</html>')
  })

  it('never opens forbidden or foreign entries and never clicks a forbidden label', async () => {
    const { bridge, calls } = fakePortal(site())
    await crawlPortal(bridge)
    expect(calls.navigate.join(' ')).not.toContain('logout')
    expect(calls.navigate.join(' ')).not.toContain('elsewhere')
    expect(calls.click).toEqual(['Stundenplan'])
  })

  it('is read-only for the whole walk and grants a menu request only for one click', async () => {
    const { bridge, calls } = fakePortal(site())
    await crawlPortal(bridge)
    expect(calls.guard[0]).toEqual([true, 0])
    expect(calls.guard.at(-1)).toEqual([false, 0])
    const grant = calls.guard.findIndex(([, budget]) => budget === 1)
    expect(grant).toBeGreaterThan(0)
    expect(calls.guard[grant + 1]).toEqual([true, 0])
  })

  it('switches the read-only mode off again when something fails', async () => {
    const { bridge, calls } = fakePortal(site())
    bridge.snapshot = async () => {
      throw new Error('page gone')
    }
    await expect(crawlPortal(bridge)).rejects.toThrow('page gone')
    expect(calls.guard.at(-1)).toEqual([false, 0])
  })

  it('keeps at most a few pages per kind and skips duplicates, short pages and login forms', async () => {
    const pages: Record<string, FakePage> = {
      [`${HOST}/`]: {
        links: Array.from({ length: 6 }, (_, index) => ({ text: `Blog ${index}`, href: `${HOST}/b/${index}` })).concat([
          { text: 'Neuigkeiten', href: `${HOST}/short` },
          { text: 'Stundenplan', href: `${HOST}/login` },
          { text: 'Termine', href: `${HOST}/dup` },
        ]),
      },
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [`${HOST}/b/${index}`, { html: `<html>eintrag ${index}</html>` }]),
      ),
      [`${HOST}/short`]: { text: 5 },
      [`${HOST}/login`]: { password: true },
      [`${HOST}/dup`]: { html: '<html>eintrag 0</html>' },
    }
    pages[`${HOST}/dup`] = { html: `<html><body>${HOST}/</body></html>` } // same content as the start page
    const result = await crawlPortal(fakePortal(pages).bridge)
    expect(result.pages.filter((page) => page.kind === 'blog')).toHaveLength(3)
    expect(result.pages.some((page) => page.html.includes('login'))).toBe(false)
    expect(result.skipped).toBeGreaterThanOrEqual(3)
  })

  it('stops at the page and visit limits and when cancelled', async () => {
    const many: Record<string, FakePage> = {
      [`${HOST}/`]: {
        links: Array.from({ length: 30 }, (_, index) => ({ text: `Thema ${index}`, href: `${HOST}/t/${index}` })),
      },
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [`${HOST}/t/${index}`, { html: `<html>thema ${index}</html>` }]),
      ),
    }
    const limited = await crawlPortal(fakePortal(many).bridge, { maxPages: 4, maxPerKind: 10 })
    expect(limited.pages.length).toBeLessThanOrEqual(4)
    let calls = 0
    const cancelled = await crawlPortal(fakePortal(many).bridge, {
      isCancelled: () => (calls += 1) > 3,
      maxPerKind: 10,
    })
    expect(cancelled.pages.length).toBeLessThan(6)
  })

  it('reports progress', async () => {
    const seen: number[] = []
    await crawlPortal(fakePortal(site()).bridge, { onProgress: (progress) => seen.push(progress.captured) })
    expect(seen).toEqual([1, 2, 3, 4, 5])
  })

  it('captures the open page without guard, navigation or clicks on macOS', async () => {
    const { bridge, calls } = fakePortal(site())
    bridge.capabilities = async () => ({ traversal: false })
    const result = await crawlPortal(bridge, { currentKind: 'grades' })
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].kind).toBe('grades')
    expect(result.visited).toBe(0)
    expect(calls).toEqual({ navigate: [], click: [], guard: [] })
  })

  it('does not capture a sign-in form in current-page mode', async () => {
    const { bridge, calls } = fakePortal({ [`${HOST}/`]: { password: true } })
    bridge.capabilities = async () => ({ traversal: false })
    const result = await crawlPortal(bridge)
    expect(result.pages).toEqual([])
    expect(calls).toEqual({ navigate: [], click: [], guard: [] })
  })

  it('does not navigate when capability detection fails', async () => {
    const { bridge, calls } = fakePortal(site())
    bridge.capabilities = async () => {
      throw new Error('window closed')
    }
    await expect(crawlPortal(bridge)).rejects.toThrow('window closed')
    expect(calls).toEqual({ navigate: [], click: [], guard: [] })
  })
})

describe('chunkPages', () => {
  it('splits into files of at most thirty pages', () => {
    expect(chunkPages(Array.from({ length: 65 }, (_, index) => index)).map((chunk) => chunk.length)).toEqual([
      30, 30, 5,
    ])
    expect(chunkPages([])).toEqual([])
  })
})
