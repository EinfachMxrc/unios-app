// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { draftFor, keepDraft, workingNoteDraftFor } from '@/noteDraft'
import type { NoteDetail } from '@/types'
import { NoteDocument } from './NoteDocument'

const mocks = vi.hoisted(() => ({ details: new Map<string, NoteDetail>(), refreshError: null as string | null }))
vi.mock('@/api', () => ({
  ApiError: class ApiError extends Error { status = 503 }, activeIntlLocale: () => 'de', localDate: (value: string) => value,
  request: vi.fn(), useApi: (path: string) => ({ data: mocks.details.get(path), loading: false, error: null,
    refreshError: mocks.refreshError, reload: vi.fn() }),
}))
vi.mock('@/hooks/host', async importOriginal => ({ ...await importOriginal<typeof import('@/hooks/host')>(), useWritableHost: () => true }))
vi.mock('@/components/EntityProperties', () => ({ EntityProperties: () => null }))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))
vi.mock('@/components/LocalActions', () => ({ LocalActions: () => null }))
vi.mock('@/components/NoteReferences', () => ({ NoteReferences: () => null }))
vi.mock('@/components/NoteMarkdownDocument', () => ({ NoteMarkdownDocument: ({ body }: { body: string }) => <p>{body}</p> }))
vi.mock('@/components/editor/NoteStudio', () => ({ NoteStudio: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
  <textarea aria-label="noteContentAria" value={value} onChange={event => onChange(event.target.value)} /> }))
vi.mock('@/i18n/useT', () => {
  const t = (key: string) => key
  return { useT: () => ({ t }) }
})

const detail: NoteDetail = { note: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', course_id: 2, resource_id: 4,
  course_name: 'Synthetic course', title: 'Lecture', current_revision: 3, created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z' },
  body: 'Saved lecture section', selected_revision: 3, versions: [] }
const second = { ...detail, note: { ...detail.note, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, body: 'Other source notes' }
function open(id = detail.note.id) {
  return render(<MemoryRouter><NoteDocument key={id} id={id} revision={null} notes={[]} startEditing
    onRevision={() => undefined} onEditing={() => undefined} onSaved={() => undefined} /></MemoryRouter>)
}
beforeEach(() => {
  clearWorkspace(); localStorage.clear(); mocks.refreshError = null; mocks.details.clear()
  mocks.details.set(`/api/notes/${detail.note.id}`, detail)
  mocks.details.set(`/api/notes/${second.note.id}`, second)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearWorkspace() })

it('hydrates a clean open editor from a newer refetch and rejects older cache rollback', () => {
  const view = open()
  const next = { ...detail, note: { ...detail.note, current_revision: 4, title: 'Confirmed newer title' },
    selected_revision: 4, body: 'Confirmed newer explanation' }
  const tree = <MemoryRouter><NoteDocument key={detail.note.id} id={detail.note.id} revision={null} notes={[]} startEditing
    onRevision={() => undefined} onEditing={() => undefined} onSaved={() => undefined} /></MemoryRouter>
  mocks.details.set(`/api/notes/${detail.note.id}`, next)
  view.rerender(tree)
  expect((screen.getByLabelText('noteTitleAria') as HTMLInputElement).value).toBe(next.note.title)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(next.body)
  mocks.details.set(`/api/notes/${detail.note.id}`, detail)
  view.rerender(<MemoryRouter><NoteDocument key={detail.note.id} id={detail.note.id} revision={null} notes={[]} startEditing
    onRevision={() => undefined} onEditing={() => undefined} onSaved={() => undefined} /></MemoryRouter>)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(next.body)
})

it('preserves its own draft when a newer confirmed revision arrives', () => {
  const view = open()
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Own unsaved explanation' } })
  mocks.details.set(`/api/notes/${detail.note.id}`, { ...detail, note: { ...detail.note, current_revision: 4 },
    selected_revision: 4, body: 'Another confirmed explanation' })
  view.rerender(<MemoryRouter><NoteDocument key={detail.note.id} id={detail.note.id} revision={null} notes={[]} startEditing
    onRevision={() => undefined} onEditing={() => undefined} onSaved={() => undefined} /></MemoryRouter>)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Own unsaved explanation')
  expect(workingNoteDraftFor(detail.note.id)).toMatchObject({ baseRevision: 3, baseBody: detail.body })
})

it('restores a current RAM-only note after remount without claiming a durable device copy', () => {
  keepDraft({ noteId: detail.note.id, baseRevision: 3, baseTitle: detail.note.title, baseBody: detail.body,
    title: 'Old durable title', body: 'Old durable text' })
  const view = open()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota exhausted') })
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Current explanation only in RAM' } })
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
  view.unmount(); open()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Current explanation only in RAM')
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
  expect(draftFor(detail.note.id)?.body).toBe('Old durable text')
  expect(workingNoteDraftFor(detail.note.id)?.baseBody).toBe(detail.body)
})

it('never places a RAM draft into the different saved target and restores it on return', () => {
  const first = open()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota exhausted') })
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Draft of the first note' } })
  first.unmount(); const other = open(second.note.id)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(second.body)
  other.unmount(); open()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Draft of the first note')
})

it('keeps the saved editor and its RAM draft visible through an offline cached refetch failure', () => {
  const view = open()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota exhausted') })
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Continue this working explanation' } })
  mocks.refreshError = 'Synthetic host unavailable'
  view.rerender(<MemoryRouter><NoteDocument id={detail.note.id} revision={null} notes={[]} startEditing
    onRevision={() => undefined} onEditing={() => undefined} onSaved={() => undefined} /></MemoryRouter>)
  expect(screen.getByText('Synthetic host unavailable')).toBeTruthy()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Continue this working explanation')
})

function read(revision: number | null = null) {
  const onEditing = vi.fn()
  render(<MemoryRouter><NoteDocument key={detail.note.id} id={detail.note.id} revision={revision} notes={[]}
    onRevision={() => undefined} onEditing={onEditing} onSaved={() => undefined} /></MemoryRouter>)
  return { onEditing }
}

it('opens the editor when the reader clicks into the page, like the edit button', () => {
  const { onEditing } = read()
  fireEvent.click(screen.getByText('Saved lecture section'))
  expect(screen.getByLabelText('noteContentAria')).toBeTruthy()
  expect(onEditing).toHaveBeenCalledOnce()
})

it('keeps a text selection in read mode so passages can still be copied', () => {
  read()
  vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Saved lecture' } as Selection)
  fireEvent.click(screen.getByText('Saved lecture section'))
  expect(screen.queryByLabelText('noteContentAria')).toBeNull()
})

it('never turns an old version into an editor by clicking it', () => {
  mocks.details.set(`/api/notes/${detail.note.id}?revision=2`, { ...detail, selected_revision: 2 })
  read(2)
  fireEvent.click(screen.getByText('Saved lecture section'))
  expect(screen.queryByLabelText('noteContentAria')).toBeNull()
})
