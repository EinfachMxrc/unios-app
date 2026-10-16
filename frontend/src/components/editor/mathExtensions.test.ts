// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { assignMissingIds, editorExtensions } from '@/editor/extensions'

/** Block ids are assigned per editor; compare structure only. */
const noIds = (json: unknown) => JSON.parse(JSON.stringify(json, (key, value) => (key === 'blockId' ? undefined : value)))
const instances: Editor[] = []
function parse(body: string) {
  const editor = new Editor({ extensions: editorExtensions(), content: body, contentType: 'markdown' })
  assignMissingIds(editor)
  instances.push(editor)
  return editor
}
function formulas(editor: Editor) {
  const result: { type: string; latex: string }[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'inlineMath' || node.type.name === 'blockMath')
      result.push({ type: node.type.name, latex: node.attrs.latex })
  })
  return result
}
function type(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection
    let handled = false
    editor.view.someProp('handleTextInput', (handler) => {
      if (handler(editor.view, from, to, character, () => editor.state.tr.insertText(character, from, to))) {
        handled = true
        return true
      }
      return false
    })
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to))
  }
}
afterEach(() => instances.splice(0).forEach((editor) => editor.destroy()))

describe('note formulas and keyboard roundtrip', () => {
  it('imports every supported delimiter without losing matrix rows or mixed Markdown', () => {
    const editor = parse(
      '# Mathe\n\nSei \\(x_1+\\frac{1}{2}\\) und $y^2$.\n\n$$x^2$$\n\n\\[\\frac{1}{2}\\]\n\n\\[\n\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}\n\\]\n\n$$\n\\sum_{i=1}^{3}i\n$$',
    )
    expect(formulas(editor)).toEqual([
      { type: 'inlineMath', latex: 'x_1+\\frac{1}{2}' },
      { type: 'inlineMath', latex: 'y^2' },
      { type: 'blockMath', latex: 'x^2' },
      { type: 'blockMath', latex: '\\frac{1}{2}' },
      { type: 'blockMath', latex: '\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}' },
      { type: 'blockMath', latex: '\\sum_{i=1}^{3}i' },
    ])
    expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it('preserves escaped dollars and code through repeated saves', () => {
    const body = 'Wörtlich: \\$x\\$. Preis: $5 und $10.\n\n`$x$ \\(y\\)`\n\n```latex\n$$x$$\n\\[y\\]\n```'
    const editor = parse(body)
    expect(formulas(editor)).toEqual([])
    expect(editor.getMarkdown()).toContain('\\$x\\$')
    expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it.each(['$x^2$', '\\(x^2\\)'])('converts keyboard input %s at its own position and supports undo', (source) => {
    const editor = parse('Vorher ')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    type(editor, source)
    expect(formulas(editor)).toEqual([{ type: 'inlineMath', latex: 'x^2' }])
    expect(editor.state.doc.textContent).toContain('Vorher ')
    expect(editor.commands.undoInputRule()).toBe(true)
    expect(formulas(editor)).toEqual([])
    expect(editor.state.doc.textContent).toBe(`Vorher ${source}`)
  })
  it.each(['$$x^2$$', '\\[x^2\\]'])('converts a complete block typed in its own paragraph: %s', (source) => {
    const editor = parse('')
    type(editor, source)
    expect(formulas(editor)).toEqual([{ type: 'blockMath', latex: 'x^2' }])
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph')
    expect(editor.commands.undoInputRule()).toBe(true)
    expect(editor.state.doc.textContent).toBe(source)
  })
  it.each([
    ['$$', '$$'],
    ['\\[', '\\]'],
  ])('converts multiline keyboard blocks (%s) only after the closing line', (opening, closing) => {
    const editor = parse('')
    type(editor, opening)
    editor.commands.splitBlock()
    type(editor, '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}')
    editor.commands.splitBlock()
    expect(formulas(editor)).toEqual([])
    type(editor, closing)
    expect(formulas(editor)).toEqual([{ type: 'blockMath', latex: '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}' }])
    expect(editor.commands.undoInputRule()).toBe(true)
    expect(formulas(editor)).toEqual([])
    expect(editor.state.doc.childCount).toBe(3)
    expect(editor.state.doc.lastChild?.textContent).toBe(closing)
  })
  it('keeps prices, incomplete and escaped syntax literal while typing', () => {
    for (const source of ['Kosten $5 und $10.', '$x', '\\(x', '\\$x\\$']) {
      const editor = parse('')
      type(editor, source)
      expect(formulas(editor)).toEqual([])
      expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
    }
  })
  it('supports deleting a literal dollar from the caret without opening a dialog', () => {
    const editor = parse('A\\$B')
    editor.commands.setTextSelection(3)
    expect(editor.commands.deleteRange({ from: 2, to: 3 })).toBe(true)
    expect(editor.getMarkdown()).toBe('AB')
    editor.commands.undo()
    expect(editor.getMarkdown()).toBe('A\\$B')
  })
  it.each([
    ['Delete', 2],
    ['Backspace', 3],
  ])('deletes a literal dollar with the real %s handler and preserves undo', (key, position) => {
    const editor = parse('A\\$B')
    editor.commands.setTextSelection(position)
    editor.commands.keyboardShortcut(key)
    expect(editor.getMarkdown()).toBe('AB')
    editor.commands.undo()
    expect(editor.getMarkdown()).toBe('A\\$B')
    expect(formulas(editor)).toEqual([])
  })
  it('does not run keyboard formula rules in code blocks', () => {
    const editor = parse('```latex\nx\n```')
    editor.commands.setTextSelection(2)
    type(editor, '$x$ \\(y\\) \\$')
    expect(formulas(editor)).toEqual([])
    expect(editor.getJSON().content?.[0].type).toBe('codeBlock')
  })
  it('keeps inline code literal and refuses block replacement in a heading or list first paragraph', () => {
    const editor = parse('Code')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.toggleCode()
    type(editor, '$x$ \\(y\\)')
    expect(formulas(editor)).toEqual([])
    for (const body of ['# Überschrift ', '- Eintrag ']) {
      const nested = parse(body)
      // End of the first block's text; the editor adds its trailing paragraph at creation.
      nested.commands.setTextSelection(nested.state.doc.firstChild!.nodeSize - (body.startsWith('#') ? 1 : 3))
      type(nested, '$$x$$')
      expect(nested.state.doc.textContent).toContain('x')
      expect(formulas(nested).some((formula) => formula.type === 'blockMath')).toBe(false)
    }
  })
  it('keeps adjacent prose intact around imported block formulas', () => {
    const editor = parse('Vorher\n$$x$$\nNachher\n\\[y\\]\nEnde')
    expect(formulas(editor)).toEqual([
      { type: 'blockMath', latex: 'x' },
      { type: 'blockMath', latex: 'y' },
    ])
    expect(editor.state.doc.textContent).toContain('Vorher')
    expect(editor.state.doc.textContent).toContain('Nachher')
    expect(editor.state.doc.textContent).toContain('Ende')
    expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it('converts a long typed formula without truncating its LaTeX', () => {
    const latex = 'x+'.repeat(500) + '1'
    const editor = parse('')
    // Simulate one native text input event, as occurs for dictation/IME commits.
    const source = `$${latex}$`
    const { from, to } = editor.state.selection
    editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, source, () => editor.state.tr.insertText(source, from, to)),
    )
    expect(formulas(editor)).toEqual([{ type: 'inlineMath', latex }])
    expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
})

describe('direct powers, bases and column writing', () => {
  it('parses plain imported notes and preserves code and ordinary text', () => {
    const editor = parse(
      '2^5 = (32)10\n\n(-9)10 und (10111)2\n\n`2^5 (9)10`\n\n```text\n2^5 (9)10\n```\n\nDatei file^5 und /path/2^5.',
    )
    expect(formulas(editor).map((item) => item.latex)).toEqual([
      '2^{5}',
      '\\left(32\\right)_{10}',
      '\\left(-9\\right)_{10}',
      '\\left(10111\\right)_{2}',
    ])
    expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it('formats finished typing, keeps surrounding text and supports undo', () => {
    const editor = parse('Vorher ')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    type(editor, '2^15')
    expect(formulas(editor)).toEqual([])
    type(editor, ' ')
    expect(formulas(editor).map((item) => item.latex)).toEqual(['2^{15}'])
    expect(editor.commands.undoInputRule()).toBe(true)
    expect(editor.state.doc.textContent).toBe('Vorher 2^15 ')
  })
  it('does not consume incomplete explicit LaTeX while typing a power', () => {
    const editor = parse('')
    type(editor, '$2^5 + 1$')
    expect(formulas(editor).map((item) => item.latex)).toEqual(['2^5 + 1'])
  })
  it('turns explicit binary column notes into one portable aligned block', () => {
    const editor = parse('(01110)2\n+(10111)2\n=(00101)2')
    expect(formulas(editor)).toHaveLength(1)
    expect(formulas(editor)[0].type).toBe('blockMath')
    expect(formulas(editor)[0].latex).toContain('\\hline')
    expect(noIds(parse(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
})

it('keeps an enclosing based expression intact while typing its inner power', () => {
  const editor = parse('')
  type(editor, '(2^5-1)10 ')
  expect(formulas(editor).map((item) => item.latex)).toEqual(['\\left(2^{5}-1\\right)_{10}'])
})
