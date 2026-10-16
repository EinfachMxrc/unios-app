// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { Editor } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import { editorExtensions } from '@/editor/extensions'
import { emptyWritingGrid, parseWritingGrid, writingGridAt } from './writingGridModel'
import { readStudyFence, studyFence } from './studyModels'

/** Block ids are assigned per editor; compare structure only. */
const noIds = (json: unknown) => JSON.parse(JSON.stringify(json, (key, value) => (key === 'blockId' ? undefined : value)))
const editors: Editor[] = []
function parse(body: string) {
  const editor = new Editor({ extensions: editorExtensions(), content: body, contentType: 'markdown' })
  editors.push(editor)
  return editor
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

it('roundtrips positions, empty cells, operators and number writing without computing a result', () => {
  const rows = [
    ['2^5', '(-9)10', '<script>alert(1)</script>'],
    ['', '(10111)2', 'A | B'],
    ['X', '', '=23'],
  ]
  const source = JSON.stringify(rows),
    body = 'Davor\n\n' + studyFence('grid', source) + 'Danach'
  const editor = parse(body)
  expect(editor.getJSON().content?.find((node) => node.type === 'studyBlock')?.attrs).toMatchObject({ kind: 'grid', source })
  const saved = editor.getMarkdown()
  expect(noIds(parse(saved).getJSON())).toEqual(noIds(editor.getJSON()))
  expect(readStudyFence(studyFence('grid', source))?.source).toBe(source)
  expect(parseWritingGrid(source)).toEqual(rows)
  expect(editor.state.doc.lastChild?.textContent).toBe('Danach')
})

it.each(
  [
    null,
    {},
    [],
    [['x'], ['y', 'z']],
    [['a\nb']],
    [['a\tb']],
    [[2]],
    [['x'.repeat(201)]],
    Array.from({ length: 21 }, () => ['']),
    [['', '', '', '', '', '', '']],
  ].map((value) => ({ value })),
)('rejects malformed or oversized grid %j without silently changing it', ({ value }) => {
  expect(() => parseWritingGrid(JSON.stringify(value))).toThrow()
  expect(readStudyFence(studyFence('grid', JSON.stringify(value)))).toBeNull()
  expect(
    parse(studyFence('grid', JSON.stringify(value)))
      .getJSON()
      .content?.some((node) => node.type === 'codeBlock'),
  ).toBe(true)
})

it('replaces only the selected grid and ignores fenced examples', () => {
  const grid = studyFence('grid', JSON.stringify(emptyWritingGrid())),
    body = 'Before' + grid + 'After'
  const at = body.indexOf('unios-grid')
  const selected = writingGridAt(body, at, at + 4)!
  expect(body.slice(0, selected.from)).toBe('Before\n\n')
  expect(body.slice(selected.to)).toBe('\nAfter')
  expect(writingGridAt(body, body.length, body.length)).toBeNull()
  const code = '````text\n' + grid + '\n````'
  expect(writingGridAt(code, code.indexOf('unios-grid'), code.indexOf('unios-grid'))).toBeNull()
})
