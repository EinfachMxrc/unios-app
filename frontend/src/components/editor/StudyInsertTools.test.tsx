// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudyInsertTools } from './StudyInsertTools'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('./MathEntryDialog', () => ({
  default: ({ onApply, onClose }: { onApply: (value: string) => void; onClose: () => void }) => (
    <div>
      <button onClick={() => onApply('x')}>apply synthetic formula</button>
      <button onClick={onClose}>cancel synthetic formula</button>
    </div>
  ),
}))

function Harness({ initial, limit = 100, disabled = false }: { initial: string; limit?: number; disabled?: boolean }) {
  const field = useRef<HTMLTextAreaElement>(null)
  const [value, change] = useState(initial)
  return (
    <>
      <textarea
        aria-label="synthetic notes"
        ref={field}
        value={value}
        onChange={(event) => change(event.target.value)}
      />
      <StudyInsertTools field={field} value={value} maxLength={limit} onChange={change} disabled={disabled} />
    </>
  )
}
afterEach(cleanup)

it('uses a real tab in prose without losing the suffix and permits keyboard exit', async () => {
  render(<Harness initial="left right" />)
  const field = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  field.focus()
  field.setSelectionRange(4, 4)
  fireEvent.keyDown(field, { key: 'Tab' })
  expect(field.value).toBe('left\t right')
  await waitFor(() => expect(field.selectionStart).toBe(5))
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(fireEvent.keyDown(field, { key: 'Tab' })).toBe(true)
  expect(field.value).toBe('left\t right')
})

it('leaves list indentation to the source editor and keeps a full field unchanged', () => {
  const view = render(<Harness initial="- list" />)
  const field = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  field.setSelectionRange(field.value.length, field.value.length)
  expect(fireEvent.keyDown(field, { key: 'Tab' })).toBe(true)
  expect(field.value).toBe('- list')
  view.unmount()
  render(<Harness initial="Full" limit={4} />)
  const full = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  full.setSelectionRange(4, 4)
  expect(fireEvent.keyDown(full, { key: 'Tab' })).toBe(true)
  expect(full.value).toBe('Full')
})

it('opens a slash command inside a sentence and resumes immediately after its replacement', async () => {
  render(<Harness initial="F = /bruch Ende" />)
  const field = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  field.focus()
  field.setSelectionRange(10, 10)
  fireEvent.keyDown(field, { key: 'Tab' })
  fireEvent.click(await screen.findByRole('button', { name: 'apply synthetic formula' }))
  expect(field.value).toBe('F = $x$ Ende')
  await waitFor(() => {
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(7)
  })
  expect(field.selectionEnd).toBe(7)
})

it('restores selected text and keeps a cancelled slash command intact', async () => {
  render(<Harness initial="/bruch Ende" />)
  const field = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  field.focus()
  field.setSelectionRange(0, 6)
  fireEvent.click(screen.getByRole('button', { name: 'math.inline' }))
  fireEvent.click(await screen.findByRole('button', { name: 'cancel synthetic formula' }))
  await waitFor(() => expect(document.activeElement).toBe(field))
  expect(field.value).toBe('/bruch Ende')
  expect(field.selectionStart).toBe(0)
  expect(field.selectionEnd).toBe(6)
})

it('preserves externally changed text and avoids insertion with stale offsets', async () => {
  render(<Harness initial="Older notes" />)
  const field = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  field.setSelectionRange(5, 5)
  fireEvent.click(screen.getByRole('button', { name: 'math.inline' }))
  await screen.findByRole('button', { name: 'apply synthetic formula' })
  fireEvent.change(field, { target: { value: 'Newer notes with another range' } })
  fireEvent.click(screen.getByRole('button', { name: 'apply synthetic formula' }))
  expect(field.value).toBe('Newer notes with another range')
  expect(screen.getByRole('status').textContent).toBe('sourceChanged')
})

it('retains text on the length boundary and ignores composition and disabled shortcuts', async () => {
  const view = render(<Harness initial="Full" limit={4} />)
  const field = screen.getByRole('textbox', { name: 'synthetic notes' }) as HTMLTextAreaElement
  field.setSelectionRange(4, 4)
  fireEvent.keyDown(field, { key: 'm', ctrlKey: true, shiftKey: true, isComposing: true })
  expect(screen.queryByRole('button', { name: 'apply synthetic formula' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'math.inline' }))
  fireEvent.click(await screen.findByRole('button', { name: 'apply synthetic formula' }))
  expect(field.value).toBe('Full')
  expect(screen.getByRole('status').textContent).toBe('studio.tooLong')
  view.rerender(<Harness initial="Full" disabled />)
  fireEvent.keyDown(field, { key: 'm', ctrlKey: true, shiftKey: true })
  expect(screen.queryByRole('button', { name: 'apply synthetic formula' })).toBeNull()
})
