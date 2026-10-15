// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { markdownTypingEdit } from './markdownTyping'

const apply = (body: string, key: 'Enter' | 'Tab' = 'Enter', shift = false, caret = body.length) => {
  const edit = markdownTypingEdit(body, caret, caret, key, shift)
  return edit ? { body: body.slice(0, edit.from) + edit.text + body.slice(edit.to), caret: edit.caret } : null
}

describe('Markdown list typing', () => {
  it.each(['-', '*', '+'])('continues %s bullets and ends empty items', (marker) => {
    expect(apply(`${marker} Gedanke`)?.body).toBe(`${marker} Gedanke\n${marker} `)
    expect(apply(`${marker} Gedanke\n${marker} `)?.body).toBe(`${marker} Gedanke\n`)
  })
  it('increments numbered items and resets checked checkboxes', () => {
    expect(apply('9. Schritt')?.body).toBe('9. Schritt\n10. ')
    expect(apply('3) Schritt')?.body).toBe('3) Schritt\n4) ')
    expect(apply('  - [x] Gelesen')?.body).toBe('  - [x] Gelesen\n  - [ ] ')
  })
  it('splits at the caret without dropping the remaining text', () => {
    expect(apply('- ErstZweit', 'Enter', false, 6)).toEqual({ body: '- Erst\n- Zweit', caret: 9 })
  })
  it('indents only a list and preserves the typing position', () => {
    expect(apply('- Frage', 'Tab')).toEqual({ body: '  - Frage', caret: 9 })
    expect(apply('  - Frage', 'Tab', true)).toEqual({ body: '- Frage', caret: 7 })
    expect(apply('- Elternpunkt\n\t- Frage', 'Tab', true)?.body).toBe('- Elternpunkt\n- Frage')
    expect(apply('Absatz', 'Tab')).toBeNull()
    expect(apply('- Frage', 'Tab', true)).toBeNull()
  })
  it.each(['```text\n- code', '~~~~\n1. code', '```\n~~~\n- code', '````\n```\n- code'])(
    'leaves fenced code untouched: %s',
    (body) => {
      expect(apply(body)).toBeNull()
      expect(apply(body, 'Tab')).toBeNull()
    },
  )
  it('resumes normal typing after a matching closing fence', () => {
    expect(apply('```\n- literal\n```\n- Gedanke')?.body).toBe('```\n- literal\n```\n- Gedanke\n- ')
  })
  it('leaves root indented code literal while allowing a deeply nested list', () => {
    expect(apply('    - code')).toBeNull()
    expect(apply('Absatz\n\n    1. code')).toBeNull()
    expect(apply('\t- code')).toBeNull()
    expect(apply('- Elternpunkt\n  - Unterpunkt\n    - Gedanke')?.body).toBe(
      '- Elternpunkt\n  - Unterpunkt\n    - Gedanke\n    - ',
    )
  })
  it('does not intercept headings, normal text, selected text or typing before a marker', () => {
    expect(apply('## Thema')).toBeNull()
    expect(apply('Minus - Wort')).toBeNull()
    expect(markdownTypingEdit('- Frage', 2, 7, 'Enter')).toBeNull()
    expect(apply('- Frage', 'Enter', false, 0)).toBeNull()
  })
})
