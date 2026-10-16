// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { request } from '@/api'
import { draftFor, keepNewNoteDraft, newNoteDraftFor } from '@/noteDraft'
import { queryClient } from '@/offlineCache'
import type { Material, NoteDetail, NotesResponse } from '@/types'
import { ReaderStudyTools } from './ReaderStudyTools'
import { resetSourceNoteSaves } from '@/lib/sourceNoteSave'
import { clearWorkspace } from '@/lib/workspaceState'
import { chooseSourceNoteTarget } from '@/lib/sourceNoteTarget'
import { appendReaderExcerpt } from './readerExcerpt'
vi.mock('@/components/LectureCoveragePanel', () => ({ LectureCoveragePanel: () => null }))

const mocks = vi.hoisted(() => ({
  error: null as string | null,
  workspaceRead: null as null | (() => Promise<{ id: string }>),
}))
vi.mock('@/lib/manualDraftPersistence', () => ({
  readManualWorkspace: () =>
    mocks.workspaceRead ? mocks.workspaceRead() : Promise.resolve({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
}))
vi.mock('@/api', () => ({
  request: vi.fn(),
  useApi: (path: string) => ({
    data: queryClient.getQueryData(['api', path]),
    loading: false,
    error: mocks.error,
    reload: vi.fn(),
  }),
}))
vi.mock('@/pages/notes/NoteDocument', () => ({
  NoteDocument: ({ id }: { id: string }) => (
    <div data-testid="continued-note">
      {id}
      <textarea
        aria-label="continuedBody"
        value={draftFor(id)?.body ?? queryClient.getQueryData<NoteDetail>(['api', `/api/notes/${id}`])?.body ?? ''}
        readOnly
      />
    </div>
  ),
}))
vi.mock('@/editor/NoteEditor', () => ({
  NoteEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="noteContentAria" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))
vi.mock('@/i18n/useT', () => {
  const t = (key: string) => key
  return { useT: () => ({ t }) }
})

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
const created: NoteDetail = {
  note: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
  document: {
    version: 1,
    blocks: [
      {
        id: 'para0001',
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: 'Vorhandener Lernstoff' }],
        children: [],
      },
    ],
  },
  versions: [],
}

function deferred() {
  let resolve!: (value: NoteDetail) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<NoteDetail>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

function openTools(excerptRevision = 0) {
  return render(
    <MemoryRouter>
      <ReaderStudyTools
        material={material}
        tab="notes"
        onTabChange={() => undefined}
        excerptRevision={excerptRevision}
        onPage={() => undefined}
        canWrite
      >
        {null}
      </ReaderStudyTools>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  clearWorkspace()
  resetSourceNoteSaves()
  localStorage.clear()
  queryClient.clear()
  vi.mocked(request).mockReset()
  mocks.error = null
  mocks.workspaceRead = null
  keepNewNoteDraft(2, 4, 'Mitschrift', 'Vorhandener Lernstoff')
})
afterEach(() => {
  cleanup()
  resetSourceNoteSaves()
  vi.restoreAllMocks()
})

it('retains Recall position and revealed answer through card-dialog suspension but resets reveal on navigation', () => {
  const annotated: Material = {
    ...material,
    annotations: [1, 2].map((page) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${page}`,
      resource_id: 4,
      source_version_id: 17,
      revision: 1,
      kind: 'highlight',
      quote: `Synthetic answer ${page}`,
      comment: `Own prompt ${page}`,
      resolved: false,
      created_at: '2026-10-07T10:00:00Z',
      updated_at: '2026-10-07T10:00:00Z',
      anchor: { status: 'matched', page, rects: [] },
    })),
  }
  const create = vi.fn()
  const tree = () => (
    <MemoryRouter>
      <ReaderStudyTools
        material={annotated}
        tab="recall"
        onTabChange={() => undefined}
        excerptRevision={0}
        onPage={() => undefined}
        canWrite
        onCreateCard={create}
      >
        {null}
      </ReaderStudyTools>
    </MemoryRouter>
  )
  const first = render(tree())
  fireEvent.click(screen.getByRole('button', { name: 'recallNext' }))
  fireEvent.click(screen.getByRole('button', { name: 'recallReveal' }))
  expect(screen.getByText('Synthetic answer 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'manual.createAction' }))
  expect(create).toHaveBeenCalledWith(annotated.annotations[1])
  first.unmount()
  render(tree())
  expect(screen.getByRole('heading', { name: 'Own prompt 2' })).toBeTruthy()
  expect(screen.getByText('Synthetic answer 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'recallPrevious' }))
  expect(screen.queryByText('Synthetic answer 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'recallNext' }))
  expect(screen.queryByText('Synthetic answer 2')).toBeNull()
  expect(screen.getByRole('button', { name: 'recallReveal' })).toBeTruthy()
})

it('keeps an in-flight create locked through close/reopen and settles in the new view with one POST', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const first = openTools()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  expect(request).toHaveBeenCalledTimes(1)
  first.unmount()
  openTools()
  expect((screen.getByRole('button', { name: 'saving' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByLabelText('noteContentAria').closest('form')!)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve(created)
    await pending.promise
  })
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'readerOpenNote' }).getAttribute('href')).toBe(
      `/notes?id=${created.note.id}`,
    ),
  )
  expect((screen.getByLabelText('continuedBody') as HTMLTextAreaElement).value).toBe(created.body)
  expect(screen.getByTestId('continued-note').textContent).toContain(created.note.id)
  expect(screen.queryByRole('button', { name: 'createNoteButton' })).toBeNull()
  expect(newNoteDraftFor(2, 4)).toBeNull()
})

it('preserves text edited during a pending request across remount and old acknowledgement', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const first = openTools()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const edited = 'Vorhandener Lernstoff\n\nNeue Idee während des Speicherns'
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: edited } })
  first.unmount()
  openTools()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(edited)
  fireEvent.submit(screen.getByLabelText('noteContentAria').closest('form')!)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve(created)
    await pending.promise
  })
  await waitFor(() => expect(screen.getByRole('link', { name: 'readerOpenNote' })).toBeTruthy())
  expect((screen.getByLabelText('continuedBody') as HTMLTextAreaElement).value).toBe(edited)
  expect(draftFor(created.note.id)?.body).toBe(edited)
  expect(draftFor(created.note.id)?.baseRevision).toBe(1)
  expect(newNoteDraftFor(2, 4)).toBeNull()
  expect(screen.queryByRole('button', { name: 'createNoteButton' })).toBeNull()
})

it('shows a failure after remount and leaves the recovery draft available for an explicit retry', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const first = openTools()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  first.unmount()
  await act(async () => {
    pending.reject(new Error('Synthetic server unavailable'))
    await pending.promise.catch(() => undefined)
  })
  openTools()
  expect(screen.getByText('Synthetic server unavailable')).toBeTruthy()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Vorhandener Lernstoff')
  expect(screen.queryByText('readerNoteSaved')).toBeNull()
  expect(newNoteDraftFor(2, 4)?.body).toBe('Vorhandener Lernstoff')
})

it('reports a device write failure without claiming a local recovery copy', () => {
  openTools()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Nur im Arbeitsspeicher' } })
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
  expect(screen.queryByText('draftSavedLocally')).toBeNull()
  expect(newNoteDraftFor(2, 4)?.body).toBe('Vorhandener Lernstoff')
})

it('recovers RAM-only request text after remount and a failed server save, so retry keeps that text', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const first = openTools()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  const unsaved = 'Lernstoff, der nicht auf das Gerät geschrieben werden konnte'
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: unsaved } })
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  first.unmount()
  await act(async () => {
    pending.reject(new Error('Synthetic server unavailable'))
    await pending.promise.catch(() => undefined)
  })
  openTools()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(unsaved)
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
  expect(screen.queryByText('draftRestoredLocally')).toBeNull()
  const retried = deferred()
  vi.mocked(request).mockReturnValue(retried.promise)
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  expect(JSON.parse(vi.mocked(request).mock.calls[1][1]?.body as string).document.blocks[0].content[0].text).toBe(
    unsaved,
  )
  await act(async () => {
    retried.resolve(created)
    await retried.promise
  })
})

it('retains newer RAM-only edits during the pending request through responsive remount and acknowledgement', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const first = openTools()
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  const newer = 'Vorhandener Lernstoff\n\nNeu und nur im Arbeitsspeicher'
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: newer } })
  first.unmount()
  openTools()
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(newer)
  await act(async () => {
    pending.resolve(created)
    await pending.promise
  })
  await waitFor(() => expect(screen.getByRole('link', { name: 'readerOpenNote' })).toBeTruthy())
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(newer)
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'readerContinueNote' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'readerContinueNote' }))
  expect(request).toHaveBeenCalledTimes(1)
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe(newer)
})

it('retains new RAM text and merges a later excerpt once quota recovers', () => {
  const view = openTools()
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic quota')
  })
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'New explanation only in RAM' } })
  failure.mockRestore()
  appendReaderExcerpt({ material, quote: 'Next selected concept', page: 12 })
  view.rerender(
    <MemoryRouter>
      <ReaderStudyTools
        material={material}
        tab="notes"
        onTabChange={() => undefined}
        excerptRevision={1}
        onPage={() => undefined}
        canWrite
      >
        {null}
      </ReaderStudyTools>
    </MemoryRouter>,
  )
  const text = (screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value
  expect(text).toContain('New explanation only in RAM')
  expect(text).toContain('Next selected concept')
  expect(text).not.toContain('Vorhandener Lernstoff')
  expect(newNoteDraftFor(2, 4)?.body).toBe(text)
})

it('keeps the saved target visible through a cached read error without recreating the source note', () => {
  chooseSourceNoteTarget(2, 4, created.note.id)
  queryClient.setQueryData(['api', `/api/notes/${created.note.id}`], created)
  mocks.error = 'Synthetic connection unavailable'
  openTools()
  expect(screen.getByTestId('continued-note').textContent).toContain(created.note.id)
  expect((screen.getByLabelText('continuedBody') as HTMLTextAreaElement).value).toBe(created.body)
  expect(screen.queryByLabelText('noteContentAria')).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

it('switches to the requested saved UUID while preserving source-scoped new drafts', async () => {
  const other = {
    ...created,
    note: { ...created.note, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    body: 'Second saved document',
  }
  queryClient.setQueryData(['api', `/api/notes/${created.note.id}`], created)
  queryClient.setQueryData(['api', `/api/notes/${other.note.id}`], other)
  const tree = (selectedNoteId: string) => (
    <MemoryRouter>
      <ReaderStudyTools
        material={material}
        tab="notes"
        onTabChange={() => undefined}
        excerptRevision={0}
        onPage={() => undefined}
        canWrite
        selectedNoteId={selectedNoteId}
      >
        {null}
      </ReaderStudyTools>
    </MemoryRouter>
  )
  const view = render(tree(created.note.id))
  expect((screen.getByLabelText('continuedBody') as HTMLTextAreaElement).value).toBe(created.body)
  view.rerender(tree(other.note.id))
  await waitFor(() => expect(screen.getByTestId('continued-note').textContent).toContain(other.note.id))
  expect((screen.getByLabelText('continuedBody') as HTMLTextAreaElement).value).toBe(other.body)
  expect(newNoteDraftFor(2, 4)?.body).toBe('Vorhandener Lernstoff')
  expect(request).not.toHaveBeenCalled()
})

it('opens older course notes next to the PDF and keeps an unfinished new composition when returning', async () => {
  const courseNote = {
    ...created.note,
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    title: 'Other course notes',
    resource_id: null,
    updated_at: '2026-10-14T12:00:00Z',
  }
  const foreign = { ...created.note, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', course_id: 3, title: 'Foreign course' }
  const response: NotesResponse = { notes: [courseNote, foreign, created.note], courses: [] }
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20'], response)
  queryClient.setQueryData(['api', `/api/notes/${created.note.id}`], created)
  openTools()
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Unfinished explanation' } })
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  const picker = screen.getByRole('region', { name: 'title' })
  const choices = within(picker).getAllByRole('button')
  expect(choices[0].textContent).toContain('Mitschrift')
  expect(within(picker).queryByText('Foreign course')).toBeNull()
  fireEvent.click(within(picker).getByRole('button', { name: /Mitschrift/ }))
  expect(screen.getByTestId('continued-note').textContent).toContain(created.note.id)
  expect(screen.queryByLabelText('noteContentAria')).toBeNull()
  expect(newNoteDraftFor(2, 4)?.body).toBe('Unfinished explanation')
  fireEvent.click(screen.getByRole('button', { name: 'readerNewNote' }))
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Unfinished explanation')
  expect(request).not.toHaveBeenCalled()
})

it('preserves a RAM-only draft when the note picker switches away and returns', () => {
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20'], { notes: [created.note], courses: [] })
  queryClient.setQueryData(['api', `/api/notes/${created.note.id}`], created)
  openTools()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: 'Only retained in RAM' } })
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  fireEvent.click(within(screen.getByRole('region', { name: 'title' })).getByRole('button', { name: /Mitschrift/ }))
  fireEvent.click(screen.getByRole('button', { name: 'readerNewNote' }))
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Only retained in RAM')
  expect(screen.getByText('localSaveFailed')).toBeTruthy()
})

it('allows an explicitly saved empty source note without creating it automatically', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  openTools()
  fireEvent.change(screen.getByLabelText('noteContentAria'), { target: { value: '' } })
  expect(request).not.toHaveBeenCalled()
  const save = screen.getByRole('button', { name: 'createNoteButton' }) as HTMLButtonElement
  expect(save.disabled).toBe(false)
  fireEvent.click(save)
  expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string).document.blocks).toEqual([])
  await act(async () => {
    pending.resolve({ ...created, body: '', document: { version: 1, blocks: [] } })
    await pending.promise
  })
  await waitFor(() => expect(screen.getByTestId('continued-note').textContent).toContain(created.note.id))
})

it('blocks picking another note while a create is pending and preserves the request draft', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20'], { notes: [created.note], courses: [] })
  openTools()
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  fireEvent.click(screen.getByRole('button', { name: 'createNoteButton' }))
  const choice = within(screen.getByRole('region', { name: 'title' })).getByRole('button', {
    name: /Mitschrift/,
  }) as HTMLButtonElement
  expect(choice.disabled).toBe(true)
  expect(screen.getByText('savingBeforeSwitch')).toBeTruthy()
  expect(newNoteDraftFor(2, 4)?.body).toBe('Vorhandener Lernstoff')
  await act(async () => {
    pending.resolve(created)
    await pending.promise
  })
})

it('keeps the picker usable when a remembered note is deleted or belongs to a different course', () => {
  chooseSourceNoteTarget(2, 4, created.note.id)
  queryClient.setQueryData(['api', `/api/notes/${created.note.id}`], {
    ...created,
    note: { ...created.note, course_id: 3 },
  })
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20'], { notes: [], courses: [] })
  openTools()
  expect(screen.getByText('focusForeignNote')).toBeTruthy()
  expect(screen.queryByTestId('continued-note')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  expect(screen.getByText('empty')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'readerNewNote' }))
  expect((screen.getByLabelText('noteContentAria') as HTMLTextAreaElement).value).toBe('Vorhandener Lernstoff')
})

it('searches only the current course and offers subsequent pages of old notes', async () => {
  const response: NotesResponse = {
    notes: [created.note],
    courses: [],
    page: { offset: 0, limit: 20, total: 21, has_more: true },
  }
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20'], response)
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20&offset=20'], {
    notes: [{ ...created.note, title: 'Older notes' }],
    courses: [],
  })
  queryClient.setQueryData(['api', '/api/notes?course_id=2&limit=20&q=Older'], {
    notes: [{ ...created.note, title: 'Filtered older notes' }],
    courses: [],
  })
  openTools()
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  fireEvent.click(screen.getByRole('button', { name: 'next' }))
  expect(screen.getByText('Older notes')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox', { name: 'search' }), { target: { value: 'Older' } })
  await waitFor(() => expect(screen.getByText('Filtered older notes')).toBeTruthy())
  expect(screen.queryByText('Older notes')).toBeNull()
})

it('does not offer a new composition that a slow remembered-note restoration could replace', async () => {
  let release!: (value: { id: string }) => void
  mocks.workspaceRead = () =>
    new Promise((resolve) => {
      release = resolve
    })
  localStorage.setItem(
    'unios-source-note-targets-v1',
    JSON.stringify({
      schema: 1,
      workspaceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      targets: [[2, 4, created.note.id]],
    }),
  )
  queryClient.setQueryData(['api', `/api/notes/${created.note.id}`], created)
  openTools()
  expect(screen.queryByLabelText('noteContentAria')).toBeNull()
  expect(screen.getByRole('button', { name: 'open' })).toBeTruthy()
  await act(async () => {
    release({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })
    await Promise.resolve()
  })
  await waitFor(() => expect(screen.getByTestId('continued-note').textContent).toContain(created.note.id))
  expect(newNoteDraftFor(2, 4)?.body).toBe('Vorhandener Lernstoff')
})
