// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractMessage, mailRowCandidate, readMailWindow } from './mailCrawl'
import type { CrawlBridge, PortalLink } from './portalCrawl'

const OPENED_MESSAGE_HTML = `<html><body>
  <div role="main">
    <div role="heading">Erinnerung: Abgabe Übungsblatt 3</div>
    <header><span title="Pruefungsbuero &lt;buero@hs-example.de&gt;">Prüfungsbüro</span></header>
    <time datetime="2026-10-12T09:30:00Z">12.10.2026 09:30</time>
    <div aria-label="Message body">Bitte reichen Sie das Übungsblatt bis zum 20.10.2026 ein. Vielen Dank.</div>
  </div>
</body></html>`

const row = (text: string, index = 0, visible = true): PortalLink => ({ index, text, href: '', visible, role: 'option', messageRow: true })

describe('mailRowCandidate', () => {
  it('accepts a visible, reasonably long row label', () => {
    expect(mailRowCandidate(row('Prüfungsbüro, Erinnerung: Abgabe, 09:30'))).toBe(true)
  })
  it('rejects hidden rows and near-empty labels', () => {
    expect(mailRowCandidate(row('Posteingang', 0, false))).toBe(false)
    expect(mailRowCandidate(row('Hi'))).toBe(false)
  })
  it('rejects navigation links even when their label looks like a message', () => {
    expect(mailRowCandidate({ ...row('Abmelden und löschen'), role: 'link', messageRow: false })).toBe(false)
    expect(mailRowCandidate({ ...row('Posteingang'), role: 'option', messageRow: false })).toBe(false)
  })
})

describe('extractMessage', () => {
  it('reads sender, subject, date and body from an opened message', () => {
    const result = extractMessage(OPENED_MESSAGE_HTML, 'row-1')
    expect(result).toEqual({
      messageKey: 'row-1',
      sender: 'buero@hs-example.de',
      subject: 'Erinnerung: Abgabe Übungsblatt 3',
      receivedAt: '2026-10-12T09:30:00Z',
      body: 'Bitte reichen Sie das Übungsblatt bis zum 20.10.2026 ein. Vielen Dank.',
    })
  })

  it('returns null for a page with no main region or an unparsable sender', () => {
    expect(extractMessage('<html><body><p>Posteingang wird geladen…</p></body></html>', 'row-1')).toBeNull()
    expect(
      extractMessage(
        '<html><body><div role="main"><div role="heading">Betreff</div></div></body></html>',
        'row-2',
      ),
    ).toBeNull()
  })
  it('keeps an unknown display date unknown instead of sending an invalid datetime', () => {
    const html = OPENED_MESSAGE_HTML.replace('<time datetime="2026-10-12T09:30:00Z">12.10.2026 09:30</time>',
      '<span title="Heute, 09:30">Heute</span>')
    expect(extractMessage(html, 'row-1')?.receivedAt).toBeNull()
  })
})

function fakeMailWindow(rows: string[], htmlFor: (text: string) => string) {
  const clicked: string[] = []
  let scrollsLeft = 0
  const bridge: CrawlBridge = {
    capabilities: async () => ({ traversal: true }),
    status: async () => ({ url: 'https://outlook.office.com/mail/', ready: 'complete', textLength: 500, hasPassword: false }),
    links: async () => ({ url: 'https://outlook.office.com/mail/', links: rows.map((text, index) => row(text, index)) }),
    click: async (_index, text) => {
      clicked.push(text)
      return rows.includes(text)
    },
    snapshot: async () => ({ url: 'https://outlook.office.com/mail/', title: '', html: htmlFor(clicked[clicked.length - 1]) }),
    navigate: async () => undefined,
    scroll: async () => {
      if (scrollsLeft > 0) {
        scrollsLeft -= 1
        return true
      }
      return false
    },
    guard: async () => undefined,
    sleep: async () => undefined,
  }
  return { bridge, clicked }
}

describe('readMailWindow', () => {
  it('does not crawl an MFA or sign-in page without a password input', async () => {
    const { bridge, clicked } = fakeMailWindow([], () => '')
    bridge.status = async () => ({ url: 'https://login.microsoftonline.com/challenge', ready: 'complete', textLength: 500, hasPassword: false })
    await expect(readMailWindow(bridge, new Set())).rejects.toThrow('login-required')
    expect(clicked).toEqual([])
  })
  it('reports a partial result when the traversal limit is exhausted', async () => {
    const { bridge } = fakeMailWindow([], () => '')
    bridge.scroll = async () => true
    expect((await readMailWindow(bridge, new Set())).partial).toBe(true)
  })
  it('opens every unseen row once and skips rows already known from a previous scan', async () => {
    const rows = ['A: Hinweis zur Vorlesung', 'B: Erinnerung Abgabe']
    const html = (text?: string) => extractableHtmlFor(text ?? '')
    const { bridge, clicked } = fakeMailWindow(rows, html)
    const result = await readMailWindow(bridge, new Set(['A: Hinweis zur Vorlesung']))
    expect(clicked).toEqual(['B: Erinnerung Abgabe'])
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].messageKey).toBe('B: Erinnerung Abgabe')
  })

  it('throws login-required instead of crawling a sign-in page', async () => {
    const bridge: CrawlBridge = {
      capabilities: async () => ({ traversal: true }),
      status: async () => ({ url: 'https://outlook.office.com/', ready: 'complete', textLength: 0, hasPassword: true }),
      links: async () => ({ url: '', links: [] }),
      click: async () => false,
      snapshot: async () => ({ url: '', title: '', html: '' }),
      navigate: async () => undefined,
      scroll: async () => false,
      guard: async () => undefined,
      sleep: async () => undefined,
    }
    await expect(readMailWindow(bridge, new Set())).rejects.toThrow('login-required')
  })
})

function extractableHtmlFor(label: string): string {
  return `<html><body><div role="main">
    <div role="heading">${label}</div>
    <header><span title="absender@hs-example.de">Absender</span></header>
    <div aria-label="Message body">Inhalt zu ${label}</div>
  </div></body></html>`
}
