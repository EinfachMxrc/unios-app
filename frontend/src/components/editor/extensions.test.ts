// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions, entityPath, safeMediaSource } from './extensions'

const instances: Editor[] = []
function parse(body: string) {
  const editor = new Editor({ extensions: editorExtensions(), content: body, contentType: 'markdown' })
  instances.push(editor)
  return editor
}
afterEach(() => instances.splice(0).forEach((editor) => editor.destroy()))

describe('portable block document', () => {
  it.each(['memory', 'example', 'tip', 'pitfall'])(
    'keeps %s learning boxes, maths and citations through editing and Markdown export',
    (kind) => {
      const body = `:::callout {kind="${kind}" label="Rechnen lernen"}\n\n**Beachten:** $2^5 = 32$.\n\n[Seite 3](/material/17?page=3)\n\n:::`
      const editor = parse(body)
      expect(editor.getJSON().content?.[0].attrs).toMatchObject({ kind, label: 'Rechnen lernen' })
      expect(editor.getMarkdown()).toContain('/material/17?page=3')
      expect(parse(editor.getMarkdown()).getJSON()).toEqual(editor.getJSON())
    },
  )
  it('roundtrips inline and block formulas, including unsupported LaTeX, without damaging text or code', () => {
    const body =
      'Sei $x^2$ positiv.\n\n$$\n\\frac{x+1}{2}\n$$\n\n$$\n\\unsupported{x}\n$$\n\n`$code$`\n\n```text\n$also code$\n```\n\nPreis: $5 und $10.'
    const editor = parse(body)
    const types: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name.endsWith('Math')) types.push(node.type.name)
    })
    expect(types).toEqual(['inlineMath', 'blockMath', 'blockMath'])
    expect(editor.getMarkdown()).toContain('\\unsupported{x}')
    expect(editor.state.doc.textContent).toContain('Preis: $5 und $10.')
    expect(parse(editor.getMarkdown()).getJSON()).toEqual(editor.getJSON())
  })
  it('roundtrips typed callouts, entities and private media without losing attributes', () => {
    const body =
      '# Grundlagen\n\n:::callout {kind="definition"}\n\n**Basisfall** beendet die Rekursion.\n\n:::\n\n:::entity {kind="course" id="1" label="Programmieren"} :::\n\n:::media {src="/api/note-assets/11111111-1111-4111-8111-111111111111.wav" kind="audio" alt="Erklärung"} :::'
    const editor = parse(body)
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['heading', 'callout', 'entity', 'media'])
    const result = editor.getMarkdown()
    expect(result).toContain('**Basisfall**')
    expect(result).toContain('kind="definition"')
    expect(result).toContain('label="Programmieren"')
    expect(parse(result).getJSON()).toEqual(editor.getJSON())
  })
  it('preserves wiki references, tables, task state and fenced code', () => {
    const body =
      '[[Rekursion]]\n\n- [x] Gelesen\n- [ ] Üben\n\n| Thema | Merksatz |\n| --- | --- |\n| Rekursion | Basisfall |\n\n```python\nprint("Hallo")\n```'
    const editor = parse(body)
    expect(editor.getMarkdown()).toContain('[[Rekursion]]')
    expect(editor.getMarkdown()).toContain('- [x] Gelesen')
    expect(editor.getMarkdown()).toContain('```python')
    expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(true)
  })
  it('keeps note tables keyboard reachable without changing portable content', () => {
    const editor = parse('| Aussage | Ergebnis |\n| --- | --- |\n| A und B | 1 |')
    const before = editor.getJSON()
    const wrapper = editor.view.dom.querySelector<HTMLElement>('.tableWrapper')
    expect(wrapper?.tabIndex).toBe(0)
    editor.setEditable(false)
    expect(editor.view.dom.querySelector<HTMLElement>('.tableWrapper')?.tabIndex).toBe(0)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.getMarkdown()).toMatch(/\| A und B \| 1\s+\|/)
    expect(editor.getMarkdown()).not.toContain('tabindex')
  })
  it('uses the backend wiki grammar and preserves invalid tokens as text', () => {
    const emojiTitle = '😀'.repeat(200)
    const editor = parse(`[[  STRASSE  ]] [[${emojiTitle}]] [[${'a'.repeat(201)}]] [[A[B]] [[ ]] [[\u0085]]`)
    const titles: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'wikiLink') titles.push(node.attrs.title)
    })
    expect(titles).toEqual(['  STRASSE  ', emojiTitle])
    expect(editor.state.doc.textContent).toContain('[[A[B]]')
    expect(editor.state.doc.textContent).toContain(`[[${'a'.repeat(201)}]]`)
    expect(parse(editor.getMarkdown()).state.doc.textContent).toBe(editor.state.doc.textContent)
  })
  it('keeps imported HTML inert and preserves images at their original source', () => {
    const editor = parse('<script>alert("bad")</script>\n\n![Diagramm](https://example.org/image.png)')
    expect(editor.getMarkdown()).toContain('<script>alert("bad")</script>')
    expect(editor.getMarkdown()).toContain('![Diagramm](https://example.org/image.png)')
    expect(editor.getHTML()).not.toContain('<script>')
  })
  it('rejects huge pastes without removing earlier typing or its undo history', () => {
    const editor = parse('Existing paragraph')
    editor.commands.insertContentAt(1, 'Accepted ')
    const before = editor.getMarkdown()
    editor.commands.insertContentAt(1, 'x'.repeat(100001))
    expect(editor.getMarkdown()).toBe(before)
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getMarkdown()).toBe('Existing paragraph')
  })
  it('rejects executable or remote embed sources and malformed entity targets', () => {
    expect(safeMediaSource('https://example.org/secret')).toBe(false)
    expect(safeMediaSource('javascript:alert(1)')).toBe(false)
    expect(safeMediaSource('/api/note-assets/../secret')).toBe(false)
    expect(entityPath('resource', '1')).toBe('/api/links/targets/resource/1')
    expect(entityPath('note', 'javascript:alert(1)')).toBeNull()
    expect(entityPath('wrong', '1')).toBeNull()
  })
})
