// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { assignMissingIds, editorExtensions } from '@/editor/extensions'
import { selectionText as noteCardSelection } from '@/editor/selectionText'

/** Block ids are assigned per editor; compare structure only. */
const noIds = (json: unknown) =>
  JSON.parse(JSON.stringify(json, (key, value) => (key === 'blockId' ? undefined : value)))
const instances: Editor[] = []
function editorFor(body = '') {
  const editor = new Editor({ extensions: editorExtensions(), content: body, contentType: 'markdown' })
  assignMissingIds(editor)
  instances.push(editor)
  return editor
}
function type(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, character, () => editor.state.tr.insertText(character, from, to)),
    )
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to))
  }
}
afterEach(() => instances.splice(0).forEach((editor) => editor.destroy()))

describe('direct Markdown input in the shared visual editor', () => {
  it.each(['-', '*', '+'])('creates a list with %s space, keeps text and supports undo', (marker) => {
    const editor = editorFor()
    type(editor, `${marker} `)
    expect(editor.isActive('bulletList')).toBe(true)
    expect(editor.commands.undo()).toBe(true)
    expect(editor.isActive('bulletList')).toBe(false)
    editor.commands.setContent('', { contentType: 'markdown' })
    type(editor, `${marker} Gedanke`)
    expect(noIds(editorFor(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it.each([1, 2, 3, 4, 5, 6])('turns %s hash markers into a heading and preserves it when saved', (level) => {
    const editor = editorFor()
    type(editor, `${'#'.repeat(level)} Thema`)
    expect(editor.getAttributes('heading').level).toBe(level)
    expect(noIds(editorFor(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it.each([
    ['1. ', 'orderedList'],
    ['- [ ] ', 'taskList'],
    ['> ', 'blockquote'],
  ])('types %s without using the toolbar', (prefix, node) => {
    const editor = editorFor()
    type(editor, `${prefix} Gedanke`)
    expect(editor.isActive(node)).toBe(true)
    const restored = editorFor(editor.getMarkdown())
    expect(restored.isActive(node)).toBe(true)
    expect(restored.state.doc.textContent.trim()).toBe(editor.state.doc.textContent.trim())
  })
  it('keeps code and mid-sentence markers as literal text', () => {
    const editor = editorFor('```text\n\n```')
    type(editor, '- literal')
    expect(editor.isActive('codeBlock')).toBe(true)
    expect(editor.state.doc.textContent).toBe('- literal')
    const sentence = editorFor()
    type(sentence, 'Ein - Gedanke')
    expect(sentence.isActive('bulletList')).toBe(false)
    expect(sentence.state.doc.textContent).toBe('Ein - Gedanke')
  })
  it('converts only the selected middle bullet into a checked task', () => {
    const editor = editorFor('- Vorher\n- \n- Nachher')
    let position = 0
    editor.state.doc.descendants((node, pos, parent) => {
      if (node.type.name === 'paragraph' && !node.textContent && parent?.type.name === 'listItem') position = pos + 1
    })
    editor.commands.setTextSelection(position)
    type(editor, '[x] Wiederholen')
    expect(
      editor
        .getJSON()
        .content?.slice(0, 3)
        .map((node) => node.type),
    ).toEqual(['bulletList', 'taskList', 'bulletList'])
    expect(editor.state.doc.child(1).firstChild?.attrs.checked).toBe(true)
    expect(editor.getMarkdown()).toContain('Vorher')
    expect(editor.getMarkdown()).toContain('- [x] Wiederholen')
    expect(editor.getMarkdown()).toContain('Nachher')
    expect(noIds(editorFor(editor.getMarkdown()).getJSON())).toEqual(noIds(editor.getJSON()))
  })
  it.each(['Wert $a+b$ bleibt', '$a+b$', '[[Basisfall]]', '$$\nx+y\n$$'])(
    'preserves atom source text in card selection: %s',
    (body) => {
      const editor = editorFor(body)
      editor.commands.selectAll()
      expect(noteCardSelection(editor)).toBe(body)
    },
  )
})
