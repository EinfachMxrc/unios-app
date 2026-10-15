// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { citedQuote, externalTarget, inAppTarget, withCitedQuote } from './inAppLinks'

const origin = 'http://127.0.0.1:8765'
const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }

function anchor(href: string, attributes: Record<string, string> = {}) {
  const link = document.createElement('a')
  link.setAttribute('href', href)
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value)
  return link
}

describe('inAppTarget', () => {
  it('keeps app links in the app, even when written for a new tab', () => {
    expect(inAppTarget(anchor('/material/170?page=1', { target: '_blank' }), plain, { desktop: true, origin })).toBe(
      '/material/170?page=1',
    )
    expect(inAppTarget(anchor(`${origin}/notes#n`), plain, { desktop: false, origin })).toBe('/notes#n')
  })
  it('leaves other websites, files and downloads to the browser', () => {
    expect(inAppTarget(anchor('https://moodle.example.org/course'), plain, { desktop: true, origin })).toBeNull()
    expect(inAppTarget(anchor('/api/primuss/proofs/3'), plain, { desktop: true, origin })).toBeNull()
    expect(inAppTarget(anchor('/files/41'), plain, { desktop: true, origin })).toBeNull()
    expect(inAppTarget(anchor('/material/1', { download: '' }), plain, { desktop: true, origin })).toBeNull()
    expect(inAppTarget(anchor('#section'), plain, { desktop: true, origin })).toBeNull()
  })
  it('lets a browser user open a new tab on purpose, but never leaves the desktop app', () => {
    const ctrl = { ...plain, ctrlKey: true }
    expect(inAppTarget(anchor('/notes'), ctrl, { desktop: false, origin })).toBeNull()
    expect(inAppTarget(anchor('/notes'), ctrl, { desktop: true, origin })).toBe('/notes')
    expect(inAppTarget(anchor('/notes'), { ...plain, button: 1 }, { desktop: true, origin })).toBeNull()
  })
  it('follows a source link inside the note editor, where the browser would not', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const link = anchor('/material/170?page=1', { target: '_blank' })
    editor.append(link)
    expect(inAppTarget(link, plain, { desktop: false, origin })).toBe('/material/170?page=1')
  })
})

describe('cited quotes', () => {
  function noteWith(quote: string | null, href: string) {
    const doc = document.createElement('div')
    if (quote) {
      const block = document.createElement('blockquote')
      block.innerHTML = `<p>${quote}</p>`
      doc.append(block)
    }
    const paragraph = document.createElement('p')
    const link = anchor(href)
    paragraph.append(link)
    doc.append(paragraph)
    return link
  }
  it('reads the quote right before a source link', () => {
    const link = noteWith('will be  assigned\n to a group.', '/material/170?page=1')
    expect(citedQuote(link)).toBe('will be assigned to a group.')
    expect(withCitedQuote('/material/170?page=1', link)).toBe('/material/170?page=1&quote=will+be+assigned+to+a+group.')
  })
  it('keeps links that already know the exact spot or quote nothing', () => {
    const marked = noteWith('Text', '/material/170?page=1&mark=0.1,0.1,0.2,0.2')
    expect(withCitedQuote('/material/170?page=1&mark=0.1,0.1,0.2,0.2', marked)).toBe(
      '/material/170?page=1&mark=0.1,0.1,0.2,0.2',
    )
    const bare = noteWith(null, '/material/170?page=1')
    expect(withCitedQuote('/material/170?page=1', bare)).toBe('/material/170?page=1')
    const elsewhere = noteWith('Text', '/notes')
    expect(withCitedQuote('/notes', elsewhere)).toBe('/notes')
  })
})

describe('externalTarget', () => {
  it('sends every link to another website to the browser, with or without target', () => {
    expect(externalTarget(anchor('https://moodle.example.org/mod/assign/view.php?id=3'), origin)).toBe(
      'https://moodle.example.org/mod/assign/view.php?id=3',
    )
    expect(externalTarget(anchor('https://github.com/x', { target: '_blank' }), origin)).toBe('https://github.com/x')
  })
  it('leaves app links, other schemes and downloads alone', () => {
    expect(externalTarget(anchor('/material/1'), origin)).toBeNull()
    expect(externalTarget(anchor('mailto:a@b.de'), origin)).toBeNull()
    expect(externalTarget(anchor('https://x.org/f.pdf', { download: '' }), origin)).toBeNull()
  })
})
