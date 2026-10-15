// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { editorExtensions } from './extensions'
import { changeHighlight } from './learningHighlight'
import { exitFoldSection } from './FoldSection'

const editors: Editor[] = []
function parse(content: string) {
  const editor = new Editor({ extensions: editorExtensions(), content, contentType: 'markdown' })
  editors.push(editor)
  return editor
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

describe('portable text markers and folded sections', () => {
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
  it('keeps a titled section with lists, formula, source link and nested learning box', () => {
    const source =
      'Vorher\n\n:::fold {label="Herleitung"}\n\n## Schritt 1\n\n- ==Wichtig==\n- $x^2$\n\n:::callout {kind="example"}\n\n[Seite 4](/material/17?page=4)\n\n:::\n\n:::\n\nNachher'
    const editor = parse(source)
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'foldSection', 'paragraph'])
    expect(editor.getMarkdown()).toContain('label="Herleitung"')
    expect(editor.getMarkdown()).toContain('/material/17?page=4')
    expect(parse(editor.getMarkdown()).getJSON()).toEqual(editor.getJSON())
  })
  it('folds selected existing paragraphs without replacing their contents and keeps undo available', () => {
    const editor = parse('Erste Erklärung\n\nZweite Erklärung\n\nBleibt sichtbar')
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.child(0).nodeSize + 5 })
    editor.commands.wrapIn('foldSection', { label: 'Meine Herleitung' })
    expect(editor.getJSON().content?.[0].type).toBe('foldSection')
    expect(editor.state.doc.textContent).toBe('Erste ErklärungZweite ErklärungBleibt sichtbar')
    expect(editor.getJSON().content?.[1].type).toBe('paragraph')
    editor.commands.undo()
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'paragraph'])
  })
  it('continues after a final section and reuses an existing following paragraph', () => {
    const editor = parse(':::fold {label="Herleitung"}\n\nRechenweg\n\n:::')
    const source = editor.state.doc.child(0).toJSON()
    expect(exitFoldSection(editor, 0)).toBe(true)
    expect(editor.state.doc.child(0).toJSON()).toEqual(source)
    expect(editor.state.selection.$from.depth).toBe(1)
    const count = editor.state.doc.childCount
    expect(exitFoldSection(editor, 0)).toBe(true)
    expect(editor.state.doc.childCount).toBe(count)
  })
})
