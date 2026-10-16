// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { editorExtensions } from '@/editor/extensions'
import { changeHighlight } from './learningHighlight'

const editors: Editor[] = []
function parse(content: string) {
  const editor = new Editor({ extensions: editorExtensions(), content, contentType: 'markdown' })
  editors.push(editor)
  return editor
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

describe('portable text markers', () => {
  it.each(['yellow', 'green', 'blue', 'pink'])(
    'retains %s and other inline formatting after export and import',
    (color) => {
      const source = `Vorher ==${color === 'yellow' ? '' : `{${color}}`}**Basisfall** und $x^2$== nachher.`
      const editor = parse(source)
      const marks: string[] = []
      editor.state.doc.descendants((node) => {
        for (const mark of node.marks) if (mark.type.name === 'learningHighlight') marks.push(mark.attrs.color)
      })
      expect(marks.length).toBeGreaterThan(0)
      expect(new Set(marks)).toEqual(new Set([color]))
      const restored = parse(editor.getMarkdown())
      expect(restored.state.doc.textContent).toBe(editor.state.doc.textContent)
      expect(parse(restored.getMarkdown()).getJSON()).toEqual(restored.getJSON())
      expect(restored.getMarkdown()).toContain('**Basisfall**')
      expect(restored.getMarkdown()).toContain('$x^2$')
    },
  )
  it.each([
    '`==literal==`',
    '```text\n==literal==\n```',
    '=={orange}literal==',
    '==literal incomplete',
    '===literal===',
  ])('leaves code and unsupported markers literal: %s', (source) => {
    const editor = parse(source)
    const marks: string[] = []
    editor.state.doc.descendants((node) => node.marks.forEach((mark) => marks.push(mark.type.name)))
    expect(marks).not.toContain('learningHighlight')
    expect(editor.getMarkdown()).toContain('literal')
  })
  it('removes a selected marker without changing the marked words', () => {
    const editor = parse('Vorher =={green}Basisfall== nachher')
    editor.commands.setTextSelection({ from: 8, to: 17 })
    editor.commands.unsetMark('learningHighlight')
    expect(editor.state.doc.textContent).toBe('Vorher Basisfall nachher')
    expect(editor.getMarkdown()).not.toContain('==')
  })
  it('changes only selected words, while colour changes at the caret update the whole marker', () => {
    const editor = parse('==Basisfall und Rekursion==')
    editor.commands.setTextSelection({ from: 1, to: 10 })
    changeHighlight(editor, 'green')
    expect(editor.state.doc.nodeAt(1)?.marks[0].attrs.color).toBe('green')
    expect(editor.state.doc.nodeAt(11)?.marks[0].attrs.color).toBe('yellow')
    editor.commands.setTextSelection(3)
    changeHighlight(editor, 'blue')
    expect(editor.state.doc.nodeAt(1)?.marks[0].attrs.color).toBe('blue')
    expect(editor.state.doc.nodeAt(11)?.marks[0].attrs.color).toBe('yellow')
  })
})
