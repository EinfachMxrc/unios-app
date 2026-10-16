// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { blockCommands, moveBlock, triggerAt } from './commands'
import { parseBody, serializeDoc, type NoteBlock } from './doc'
import { editorExtensions } from './extensions'
import { docToPm, pmToDoc, type PmNode } from './pmConvert'

const instances: Editor[] = []
function create(body = ''): Editor {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions('', () => undefined),
    content: docToPm(parseBody(body)),
  })
  instances.push(editor)
  return editor
}
afterEach(() => instances.splice(0).forEach((editor) => editor.destroy()))
const blocks = (editor: Editor): NoteBlock[] => pmToDoc(editor.getJSON() as PmNode).blocks
const para = (id: string, text: string) =>
  JSON.stringify({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text }], children: [] })

describe('note editor', () => {
  it('gives every new block its own id when a block is split', () => {
    const editor = create(para('first0001', 'Hallo Welt'))
    editor.commands.setTextSelection(6)
    editor.commands.splitBlock()
    const ids = blocks(editor).map((block) => block.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe('first0001')
    expect(new Set(ids).size).toBe(2)
  })

  it('keeps ids across an edit and does not change a document it only displays', () => {
    const body = [para('aaaaaaaa', 'eins'), para('bbbbbbbb', 'zwei')].join('\n')
    const editor = create(body)
    expect(serializeDoc({ version: 1, blocks: blocks(editor) })).toBe(body)
    editor.commands.insertContentAt(5, '!')
    expect(blocks(editor).map((block) => block.id)).toEqual(['aaaaaaaa', 'bbbbbbbb'])
  })

  it('opens the block menu from "/" at the start of a block and the note menu from "[["', () => {
    const editor = create()
    editor.commands.insertContent('/tab')
    expect(triggerAt(editor)).toMatchObject({ kind: 'slash', query: 'tab' })
    editor.commands.clearContent()
    editor.commands.insertContent('Siehe [[Rek')
    expect(triggerAt(editor)).toMatchObject({ kind: 'wiki', query: 'Rek' })
    editor.commands.clearContent()
    editor.commands.insertContent('a / b')
    expect(triggerAt(editor)).toBeNull()
  })

  it('turns the typed trigger into the chosen block', () => {
    const editor = create()
    const run = (id: string, typed: string) => {
      editor.commands.clearContent()
      editor.commands.insertContent(typed)
      const trigger = triggerAt(editor)!
      blockCommands
        .find((command) => command.id === id)!
        .run({ editor, range: { from: trigger.from, to: trigger.to }, openDialog: () => undefined })
      return blocks(editor)
    }
    expect(run('h2', '/ueber')[0]).toMatchObject({ type: 'heading', props: { level: 2 } })
    expect(run('todo', '/check')[0]).toMatchObject({ type: 'todo' })
    expect(run('callout-definition', '/def')[0]).toMatchObject({ type: 'callout', props: { kind: 'definition' } })
    expect(run('toggle', '/auf')[0]).toMatchObject({ type: 'toggle' })
    expect(run('table', '/tab')[0].type).toBe('table')
    expect(run('divider', '/trenn').map((block) => block.type)).toContain('divider')
  })

  it('moves a block past its neighbour', () => {
    const editor = create([para('aaaaaaaa', 'eins'), para('bbbbbbbb', 'zwei')].join('\n'))
    expect(moveBlock(editor, 0, 1)).toBe(true)
    expect(blocks(editor).map((block) => block.id)).toEqual(['bbbbbbbb', 'aaaaaaaa'])
    expect(moveBlock(editor, 0, -1)).toBe(false)
  })

  it('rejects an edit that would exceed the note size', () => {
    let rejected = 0
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions('', () => rejected++),
      content: docToPm(parseBody('')),
    })
    instances.push(editor)
    editor.commands.insertContent('x'.repeat(100_001))
    expect(editor.getText().length).toBeLessThanOrEqual(100_000)
  })
})
