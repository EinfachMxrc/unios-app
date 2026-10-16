// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { clearWorkspace } from '@/lib/workspaceState'
import { resetSourceNoteSaves, sourceNoteSaveState } from '@/lib/sourceNoteSave'
import { draftFor, keepNewNoteDraft, newNoteDraftFor } from '@/noteDraft'
import { queryClient } from '@/offlineCache'
import type { NoteDetail, NotesResponse } from '@/types'
import { NewNote } from './NewNote'
import { NotesPage } from '../NotesPage'

vi.mock('@/api', () => ({
  request: vi.fn(),
  localDate: (value: string) => value,
  useApi: (path: string) => ({
    data:
      path.startsWith('/api/notes') && !/^\/api\/notes\/[\da-f-]+/.test(path)
        ? notes
        : queryClient.getQueryData(['api', path]),
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
vi.mock('@/pages/notes/NoteDocument', () => ({
  NoteDocument: ({ id }: { id: string }) => <p data-testid="document-id">{id}</p>,
}))
vi.mock('@/addons/AddonWidgetSlot', () => ({ AddonWidgetSlot: () => null }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/Shell', () => ({
  Shell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <main>
      {actions}
      {children}
    </main>
  ),
}))
vi.mock('@/i18n/useT', () => {
  const t = (key: string) => key
  return { useT: () => ({ t }) }
})
// This adapter preserves NoteStudio's important browser contract: contentEditable
// continues emitting input events inside a disabled HTML fieldset.
vi.mock('@/components/editor/NoteStudio', () => ({
  NoteStudio: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <div
      role="textbox"
      aria-label="noteContentAria"
      contentEditable
      suppressContentEditableWarning
      onInput={(event) => onChange(event.currentTarget.textContent ?? '')}
    >
      {value}
    </div>
  ),
}))

const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const notes: NotesResponse = {
  notes: [],
  courses: [
    {
      id: 2,
      name: 'Synthetic course',
      short_name: null,
      semester_id: null,
      source: 'manual',
      source_id: 'synthetic-course',
      is_active: true,
      download_other_groups: false,
    },
  ],
}
function created(id = firstId, body = 'Sent A'): NoteDetail {
  return {
    note: {
      id,
      course_id: 2,
      resource_id: null,
      course_name: 'Synthetic course',
      title: 'Free lecture',
      current_revision: 1,
      created_at: '2026-10-09T10:00:00Z',
      updated_at: '2026-10-09T10:00:00Z',
    },
    selected_revision: 1,
    body,
    versions: [],
  }
}
function deferred() {
  let resolve!: (value: NoteDetail) => void
  const promise = new Promise<NoteDetail>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
function open(onCreated = vi.fn()) {
  return render(
    <MemoryRouter>
      <NewNote data={notes} courseId={2} resourceId={null} suggestedTitle="Free lecture" onCreated={onCreated} />
    </MemoryRouter>,
  )
}
function type(value: string) {
  fireEvent.input(screen.getByRole('textbox', { name: 'noteContentAria' }), { target: { textContent: value } })
}
function Location() {
  return <output data-testid="location">{useLocation().search}</output>
}
beforeEach(() => {
  clearWorkspace()
  resetSourceNoteSaves()
  queryClient.clear()
  localStorage.clear()
  vi.mocked(request).mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetSourceNoteSaves()
})

it('creates a named blank note only after the explicit create action', async () => {
  vi.mocked(request).mockResolvedValue(created(firstId, ''))
  const onCreated = vi.fn()
  open(onCreated)
  expect(request).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('')
  expect(newNoteDraftFor(2, null)).toBeNull()
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith(firstId))
  expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)).toEqual({
    course_id: 2,
    resource_id: null,
    title: 'Free lecture',
    body: '',
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('preserves a recovered draft instead of replacing it with a blank note', () => {
  keepNewNoteDraft(2, null, 'Recovered lecture', 'Recovered explanation')
  open()
  expect(screen.queryByRole('button', { name: 'emptyNoteButton' })).toBeNull()
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('Recovered explanation')
  expect(request).not.toHaveBeenCalled()
})

it('prepares an assignment solution without creating a note on opening', () => {
  render(
    <MemoryRouter>
      <NewNote
        data={notes}
        courseId={2}
        resourceId={null}
        suggestedTitle="Solution"
        initialBody={'## Own solution\n\nTask source'}
        onCreated={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('## Own solution\n\nTask source')
  expect(request).not.toHaveBeenCalled()
})

it('never replaces an existing lecture draft with a newly opened assignment template', () => {
  keepNewNoteDraft(2, null, 'Recovered lecture', 'My unsaved explanation')
  render(
    <MemoryRouter>
      <NewNote
        data={notes}
        courseId={2}
        resourceId={null}
        suggestedTitle="Solution"
        initialBody="New task template"
        onCreated={vi.fn()}
      />
    </MemoryRouter>,
  )
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('My unsaved explanation')
  expect(request).not.toHaveBeenCalled()
})

it('keeps blank creation available after the editor persists an untouched template', () => {
  keepNewNoteDraft(2, null, 'Named lecture', 'lectureTemplate\n\n')
  open()
  fireEvent.click(screen.getByRole('button', { name: 'emptyNoteButton' }))
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('')
  expect(request).not.toHaveBeenCalled()
})

it('requires a title even when an explicitly blank note is selected', () => {
  open()
  fireEvent.change(screen.getByLabelText('noteTitleAria'), { target: { value: '   ' } })
  expect((screen.getByRole('button', { name: 'createNoteButton' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  expect(request).not.toHaveBeenCalled()
})

it('transfers B typed in contentEditable during a free-note POST to the acknowledged UUID', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const onCreated = vi.fn()
  open(onCreated)
  type('Sent A')
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).closest('fieldset')?.disabled).toBe(true)
  type('Sent A\n\nNew B while saving')
  await act(async () => {
    pending.resolve(created())
    await pending.promise
  })
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith(firstId))
  expect(draftFor(firstId)).toMatchObject({ body: 'Sent A\n\nNew B while saving', baseRevision: 1, baseBody: 'Sent A' })
  expect(newNoteDraftFor(2, null)).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})

it('shares pending and RAM-only B through free-note remount and retries transfer without another POST', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const oldCreated = vi.fn()
  const first = open(oldCreated)
  type('Sent A')
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic quota')
  })
  type('RAM-only B during A')
  first.unmount()
  const currentCreated = vi.fn()
  open(currentCreated)
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('RAM-only B during A')
  expect((screen.getByRole('button', { name: 'saving' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'saving' }))
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve(created())
    await pending.promise
  })
  expect(oldCreated).not.toHaveBeenCalled()
  expect(currentCreated).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'noteContentAria' }).textContent).toBe('RAM-only B during A')
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(request).toHaveBeenCalledTimes(1)
  denied.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(currentCreated).toHaveBeenCalledExactlyOnceWith(firstId)
  expect(draftFor(firstId)?.body).toBe('RAM-only B during A')
})

it('retains a free-note ACK when removing its old local draft fails and never retries the POST', async () => {
  keepNewNoteDraft(2, null, 'Free lecture', 'Sent A')
  vi.mocked(request).mockResolvedValue(created())
  const onCreated = vi.fn()
  open(onCreated)
  const denied = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('Synthetic cleanup denied')
  })
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  await waitFor(() => expect(sourceNoteSaveState(2, null).phase).toBe('saved'))
  expect(onCreated).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(request).toHaveBeenCalledTimes(1)
  expect(onCreated).not.toHaveBeenCalled()
  denied.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(onCreated).toHaveBeenCalledExactlyOnceWith(firstId)
  expect(newNoteDraftFor(2, null)).toBeNull()
})

it('fences an old free-note ACK after workspace reset and preserves the replacement draft', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const onCreated = vi.fn()
  open(onCreated)
  type('Sent A')
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const signal = vi.mocked(request).mock.calls[0][1]?.signal
  act(clearWorkspace)
  const replacement = keepNewNoteDraft(2, null, 'Different workspace', 'Different text')
  await act(async () => {
    pending.resolve(created())
    await pending.promise
  })
  expect(signal?.aborted).toBe(true)
  expect(onCreated).not.toHaveBeenCalled()
  expect(newNoteDraftFor(2, null)).toEqual(replacement)
})

it('starts a distinct free document only through the explicit New note action after acknowledgement', async () => {
  vi.mocked(request).mockResolvedValueOnce(created()).mockResolvedValueOnce(created(secondId, 'Second lecture'))
  const view = render(
    <MemoryRouter initialEntries={['/notes?new=1&course_id=2']}>
      <NotesPage />
      <Location />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('noteTitleAria'), { target: { value: 'Free lecture' } })
  type('Sent A')
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  await waitFor(() => expect(screen.getByTestId('document-id').textContent).toBe(firstId))
  fireEvent.click(within(view.container.querySelector('.page-actions')!).getByRole('button', { name: 'newNoteButton' }))
  expect(screen.getByTestId('location').textContent).toContain('new=1')
  expect(sourceNoteSaveState(2, null).phase).toBe('idle')
  fireEvent.change(screen.getByLabelText('noteTitleAria'), { target: { value: 'Another lecture' } })
  type('Second lecture')
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  await waitFor(() => expect(screen.getByTestId('document-id').textContent).toBe(secondId))
  expect(request).toHaveBeenCalledTimes(2)
})
