// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { resetSourceNoteSaves, sourceNoteSaveState } from '@/lib/sourceNoteSave'
import { clearWorkspace } from '@/lib/workspaceState'
import { draftFor, keepNewNoteDraft, newNoteDraftFor, workingNoteDraftFor } from '@/noteDraft'
import { queryClient } from '@/offlineCache'
import { serializeDoc } from '@/editor/doc'
import type { Material, NoteDetail, NotesResponse } from '@/types'
import { ReaderStudyTools } from '../material/ReaderStudyTools'
import { NewNote } from './NewNote'

vi.mock('@/api', () => ({
  request: vi.fn(),
  useApi: (path: string) => ({
    data: queryClient.getQueryData(['api', path]),
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
vi.mock('@/pages/notes/NoteDocument', () => ({
  NoteDocument: ({ id }: { id: string }) => (
    <textarea
      aria-label="continuedBody"
      value={
        workingNoteDraftFor(id)?.body ?? queryClient.getQueryData<NoteDetail>(['api', `/api/notes/${id}`])?.body ?? ''
      }
      readOnly
    />
  ),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/i18n/useT', () => {
  const t = (key: string) => key
  return { useT: () => ({ t }) }
})
vi.mock('@/editor/NoteEditor', () => ({
  NoteEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="noteContentAria" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const material: Material = {
  version_id: 17,
  resource_id: 4,
  course_id: 2,
  resource_name: 'Erfundenes Skript.pdf',
  course_name: 'Erfundener Kurs',
  version: 1,
  versions: [{ id: 17, version: 1 }],
  annotations: [],
}
const data: NotesResponse = {
  notes: [],
  courses: [
    {
      id: 2,
      name: 'Erfundener Kurs',
      short_name: null,
      semester_id: null,
      source: 'manual',
      source_id: 'synthetic-course',
      is_active: true,
      download_other_groups: false,
    },
  ],
}
/** One paragraph in the stored block form, with a fixed id so drafts compare exactly. */
const docOf = (text: string) => ({
  version: 1,
  blocks: [{ id: 'para0001', type: 'paragraph', props: {}, content: [{ type: 'text', text }], children: [] }],
})
const created = (id: string): NoteDetail => ({
  note: {
    id,
    course_id: 2,
    resource_id: 4,
    course_name: 'Erfundener Kurs',
    title: 'Mitschrift',
    current_revision: 1,
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z',
  },
  selected_revision: 1,
  body: 'Vorhandener Lernstoff',
  document: docOf('Vorhandener Lernstoff'),
  versions: [],
})

function deferred() {
  let resolve!: (value: NoteDetail) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<NoteDetail>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}
function openReader() {
  return render(
    <MemoryRouter>
      <ReaderStudyTools
        material={material}
        tab="notes"
        onTabChange={() => undefined}
        excerptRevision={0}
        onPage={() => undefined}
        canWrite
      >
        {null}
      </ReaderStudyTools>
    </MemoryRouter>,
  )
}
function openNewNote(onCreated = vi.fn(), resourceId: number | null = 4) {
  return render(
    <MemoryRouter>
      <NewNote data={data} courseId={2} resourceId={resourceId} suggestedTitle="Mitschrift" onCreated={onCreated} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  clearWorkspace()
  resetSourceNoteSaves()
  localStorage.clear()
  queryClient.clear()
  vi.mocked(request).mockReset()
  keepNewNoteDraft(2, 4, 'Mitschrift', 'Vorhandener Lernstoff')
})
afterEach(() => {
  cleanup()
  resetSourceNoteSaves()
  vi.restoreAllMocks()
})

it('keeps the Reader create locked when opening the full editor and opens its single acknowledgement', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const reader = openReader()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  reader.unmount()
  const onCreated = vi.fn()
  openNewNote(onCreated)
  const button = screen.getByRole('button', { name: 'saving' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Vorhandener Lernstoff')
  fireEvent.click(button)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    await pending.promise
  })
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
  expect(newNoteDraftFor(2, 4)).toBeNull()
})

it('preserves newer source text in the acknowledged UUID when the full editor replaces the Reader', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const reader = openReader()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const newer = 'Vorhandener Lernstoff\n\nNeue Erklärung'
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: newer } })
  reader.unmount()
  const onCreated = vi.fn()
  openNewNote(onCreated)
  await act(async () => {
    pending.resolve(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    await pending.promise
  })
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
  expect(newNoteDraftFor(2, 4)).toBeNull()
  expect(draftFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toMatchObject({
    body: newer,
    baseRevision: 1,
    baseBody: serializeDoc(docOf('Vorhandener Lernstoff') as never),
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('shares a create started in the full editor when returning to the Reader', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const fullEditor = openNewNote()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  fullEditor.unmount()
  openReader()
  expect((screen.getByRole('button', { name: 'saving' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByLabelText('noteContentAria').closest('form')!)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    await pending.promise
  })
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'readerOpenNote' }).getAttribute('href')).toBe(
      '/notes?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ),
  )
})

it('recovers RAM-only Reader text and its failed request in the full editor without claiming device safety', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const reader = openReader()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  const unsaved = 'Nur im Arbeitsspeicher erhaltener Lernstoff'
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: unsaved } })
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  reader.unmount()
  await act(async () => {
    pending.reject(new Error('Synthetic server unavailable'))
    await pending.promise.catch(() => undefined)
  })
  const onCreated = vi.fn()
  openNewNote(onCreated)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(unsaved)
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
  expect(screen.queryByText('draftRestoredLocally')).toBeNull()
  expect(screen.getByText('Synthetic server unavailable')).toBeTruthy()
  const retry = deferred()
  vi.mocked(request).mockReturnValue(retry.promise)
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  expect(JSON.parse(vi.mocked(request).mock.calls[1][1]?.body as string).document.blocks[0].content[0].text).toBe(
    unsaved,
  )
  await act(async () => {
    retry.resolve(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    await retry.promise
  })
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
})

it('creates a free note independently while a resource-bound Reader note is pending', async () => {
  const pending = deferred()
  vi.mocked(request)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(created('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
  const reader = openReader()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  reader.unmount()
  const onCreated = vi.fn()
  openNewNote(onCreated, null)
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
  expect(request).toHaveBeenCalledTimes(2)
  expect(JSON.parse(vi.mocked(request).mock.calls[1][1]?.body as string)).toMatchObject({ resource_id: null })
  expect(sourceNoteSaveState(2, 4).phase).toBe('pending')
  expect(newNoteDraftFor(2, 4)?.body).toBe('Vorhandener Lernstoff')
  await act(async () => {
    pending.resolve(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    await pending.promise
  })
})

it('ignores an old source acknowledgement after workspace reset even if the server ignores cancellation', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const onCreated = vi.fn()
  openNewNote(onCreated)
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const signal = vi.mocked(request).mock.calls[0][1]?.signal
  act(clearWorkspace)
  expect(signal?.aborted).toBe(true)
  const newer = keepNewNoteDraft(2, 4, 'Neuer Kontext', 'Neuer Bestand')
  await act(async () => {
    pending.resolve(created('dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
    await pending.promise
  })
  expect(onCreated).not.toHaveBeenCalled()
  expect(sourceNoteSaveState(2, 4).phase).toBe('idle')
  expect(newNoteDraftFor(2, 4)).toEqual(newer)
})

it('retains the successful acknowledgement through failed local cleanup and retries continuation without another POST', async () => {
  vi.mocked(request).mockResolvedValue(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
  const blockedRemoval = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  const onCreated = vi.fn()
  openNewNote(onCreated)
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  // The save store publishes its acknowledgement before the editor effect
  // applies the local-cleanup error. Wait for the final user-facing state.
  await waitFor(() => expect(screen.getByText('localSaveFailed')).toBeTruthy())
  expect(blockedRemoval).toHaveBeenCalledWith('unios:new-note-draft:v1:2:4')
  expect(sourceNoteSaveState(2, 4)).toMatchObject({ phase: 'saved', localCleanupFailed: true })
  expect(screen.getByRole('button', { name: 'readerOpenNote' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'readerContinueNote' }) as HTMLButtonElement).disabled).toBe(false)
  expect(onCreated).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(onCreated).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledTimes(1)
  blockedRemoval.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(onCreated).toHaveBeenCalledExactlyOnceWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  expect(request).toHaveBeenCalledTimes(1)
  expect(newNoteDraftFor(2, 4)).toBeNull()
})

it('keeps newer RAM text after a source ACK until its existing-note draft can be safely transferred', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const reader = openReader()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const failedWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic quota')
  })
  const newer = 'Newer source explanation only in RAM'
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: newer } })
  reader.unmount()
  const onCreated = vi.fn()
  openNewNote(onCreated)
  await act(async () => {
    pending.resolve(created('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    await pending.promise
  })
  expect(onCreated).not.toHaveBeenCalled()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(newer)
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(request).toHaveBeenCalledTimes(1)
  expect(onCreated).not.toHaveBeenCalled()
  failedWrite.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(onCreated).toHaveBeenCalledExactlyOnceWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  expect(draftFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toMatchObject({ body: newer, baseRevision: 1 })
  expect(newNoteDraftFor(2, 4)).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})
