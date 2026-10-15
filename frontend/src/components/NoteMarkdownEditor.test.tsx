// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { NoteMarkdownEditor } from './NoteMarkdownEditor'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/useNoteLinks', () => ({ useNoteSuggestions: () => ({ data: [] }) }))
vi.mock('@/components/editor/StudyInsertTools', () => ({ StudyInsertTools: () => null }))
vi.mock('@/components/NoteMarkdownDocument', () => ({
  NoteMarkdownDocument: ({ body }: { body: string }) => <p>{body}</p>,
}))

function Harness({
  initial = 'Start End',
  changed = () => undefined,
}: {
  initial?: string
  changed?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <MemoryRouter>
      <NoteMarkdownEditor
        id="synthetic-source"
        value={value}
        notes={[]}
        onChange={(next) => {
          changed(next)
          setValue(next)
        }}
      />
    </MemoryRouter>
  )
}

function fileWithText(read: () => Promise<string>) {
  const file = new File(['small synthetic source'], 'synthetic.md', { type: 'text/markdown' })
  Object.defineProperty(file, 'text', { value: read })
  return file
}

function drop(file: File) {
  fireEvent.drop(screen.getByRole('textbox', { name: 'noteContentAria' }).closest('.note-writing-field')!, {
    dataTransfer: { files: [file], types: ['Files'] },
  })
}

afterEach(cleanup)

it('preserves newer typing while an imported file is still being read', async () => {
  let finish!: (text: string) => void
  render(<Harness />)
  const field = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
  drop(
    fileWithText(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  )
  fireEvent.change(field, { target: { value: 'Newer lecture text' } })
  await act(async () => finish('Imported formula $x^2$'))
  expect(field.value).toBe('Newer lecture text')
  expect(screen.getByRole('status').textContent).toContain('fileChangedBeforeImportMessage')
})

it('imports at the captured caret instead of a later selection and resumes there', async () => {
  let finish!: (text: string) => void
  render(<Harness />)
  const field = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
  field.setSelectionRange(6, 6)
  drop(
    fileWithText(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  )
  field.setSelectionRange(0, 0)
  await act(async () => finish('Imported'))
  expect(field.value).toBe('Start ImportedEnd')
  await waitFor(() => {
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(14)
  })
  expect(field.selectionEnd).toBe(14)
})

it('reports failed and oversized reads without changing the note', async () => {
  render(<Harness />)
  const field = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
  drop(fileWithText(() => Promise.reject(new Error('Synthetic read failure'))))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('fileReadFailedMessage'))
  expect(field.value).toBe('Start End')
  drop(fileWithText(() => Promise.resolve('x'.repeat(100_001))))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('studio.tooLong'))
  expect(field.value).toBe('Start End')
})

it('does not apply a pending import after leaving the editor', async () => {
  let finish!: (text: string) => void
  const changed = vi.fn()
  const view = render(<Harness changed={changed} />)
  drop(
    fileWithText(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  )
  view.unmount()
  await act(async () => finish('Late import'))
  expect(changed).not.toHaveBeenCalled()
})

it('returns from source preview to the same typing selection only after a user action', async () => {
  render(<Harness />)
  const field = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
  expect(document.activeElement).not.toBe(field)
  field.focus()
  field.setSelectionRange(2, 5)
  fireEvent.click(screen.getByRole('button', { name: 'previewMode' }))
  expect(screen.queryByRole('textbox', { name: 'noteContentAria' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'writeMode' }))
  const resumed = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
  await waitFor(() => expect(document.activeElement).toBe(resumed))
  expect(resumed.selectionStart).toBe(2)
  expect(resumed.selectionEnd).toBe(5)
  expect(resumed.value).toBe('Start End')
})

it('places the caret before the following text as soon as a list item is indented', () => {
  render(<Harness initial={'- Read\n- Question'} />)
  const field = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
  field.focus()
  const caret = field.value.indexOf('Question')
  field.setSelectionRange(caret, caret)
  fireEvent.keyDown(field, { key: 'Tab' })
  expect(field.value).toBe('- Read\n  - Question')
  expect(field.selectionStart).toBe(caret + 2)
  expect(field.selectionEnd).toBe(caret + 2)
})

it('keeps fast typing after Tab ahead of any delayed selection work', () => {
  const frames: FrameRequestCallback[] = []
  const schedule = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  try {
    render(<Harness initial={'- Read\n- '} />)
    const field = screen.getByRole('textbox', { name: 'noteContentAria' }) as HTMLTextAreaElement
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
    fireEvent.keyDown(field, { key: 'Tab' })
    fireEvent.change(field, { target: { value: field.value + 'F' } })
    act(() => frames.forEach((callback) => callback(0)))
    expect(field.value).toBe('- Read\n  - F')
    expect(field.selectionStart).toBe(field.value.length)
  } finally {
    schedule.mockRestore()
  }
})
