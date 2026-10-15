// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, expect, it, vi } from 'vitest'
import { StudioBlockActions, StudioOutline } from './StudioChrome'

vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}))

let editor: Editor | null = null
afterEach(() => {
  cleanup()
  editor?.destroy()
  editor = null
})

function make(html: string, cursorInBlock: number) {
  editor = new Editor({ extensions: [StarterKit], content: html })
  let pos = 0
  for (let index = 0; index < cursorInBlock; index++) pos += editor.state.doc.child(index).nodeSize
  editor.commands.setTextSelection(pos + 1)
  return editor
}
const texts = () =>
  Array.from({ length: editor!.state.doc.childCount }, (_, i) => editor!.state.doc.child(i).textContent)

it('moves the block under the cursor down and up again without losing content', () => {
  const instance = make('<p>Eins</p><p>Zwei</p><p>Drei</p>', 0)
  const view = render(<StudioBlockActions editor={instance} disabled={false} />)
  expect(screen.getByText('studio.activeBlock:{"number":1}')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'studio.moveUp' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'studio.moveDown' }))
  expect(texts()).toEqual(['Zwei', 'Eins', 'Drei'])
  view.rerender(<StudioBlockActions editor={instance} disabled={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'studio.moveUp' }))
  expect(texts()).toEqual(['Eins', 'Zwei', 'Drei'])
})

it('duplicates and deletes the current block, and disables everything while uploading', () => {
  const instance = make('<p>Eins</p><p>Zwei</p>', 1)
  const view = render(<StudioBlockActions editor={instance} disabled={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'studio.duplicate' }))
  expect(texts()).toEqual(['Eins', 'Zwei', 'Zwei'])
  fireEvent.click(screen.getByRole('button', { name: 'studio.deleteBlock' }))
  expect(texts()).toEqual(['Eins', 'Zwei'])
  view.rerender(<StudioBlockActions editor={instance} disabled />)
  for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
})

it('lists headings by level and says so when there are none', () => {
  render(<StudioOutline editor={make('<h2>Rekursion</h2><p>Text</p><h3>Basisfall</h3>', 1)} />)
  expect(screen.getByRole('button', { name: 'Rekursion' }).dataset.level).toBe('2')
  expect(screen.getByRole('button', { name: 'Basisfall' }).dataset.level).toBe('3')
  cleanup()
  render(<StudioOutline editor={make('<p>Nur Text</p>', 0)} />)
  expect(screen.getByText('studio.noSections')).toBeTruthy()
})
