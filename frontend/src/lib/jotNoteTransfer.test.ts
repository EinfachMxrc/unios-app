// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { keepDraft, keepNewNoteDraft, newNoteDraftFor, rememberVolatileNoteDraft } from '@/noteDraft'
import type { NoteDetail } from '@/types'
import {
  rememberSourceWorkingDraft,
  saveSourceNote,
  sourceNoteSaveState,
  sourceWorkingDraft,
} from '@/lib/sourceNoteSave'
import { includesJotSource, JotTransferBlocked, prepareJotNoteDraft, transferJotToNote } from './jotNoteTransfer'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api', () => ({ request: mocks.request }))
const jot = { id: 'aaaaaaaa-0000-0000-0000-000000000001', body: 'Was ist ein Eigenvektor?\nMeine Frage' }
const noteId = 'bbbbbbbb-0000-0000-0000-000000000002'
const source = `[Original](/jots#jot-${jot.id})`
function detail(body = 'Vorhandene Mitschrift', revision = 7): NoteDetail {
  return {
    note: {
      id: noteId,
      course_id: 3,
      course_name: 'Synthetischer Kurs',
      resource_id: null,
      title: 'Mein Titel',
      current_revision: revision,
      created_at: '',
      updated_at: '',
    },
    body,
    selected_revision: revision,
    versions: [],
  }
}
function workingDraft() {
  return {
    noteId,
    baseRevision: 7,
    baseTitle: 'Mein Titel',
    baseBody: 'Vorhandene Mitschrift',
    title: 'Lokaler Titel',
    body: 'UNSAVED DEVICE TEXT',
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new Event('unios:workspace-cleared'))
  vi.clearAllMocks()
  mocks.request.mockImplementation((path: string, options?: RequestInit) =>
    Promise.resolve(
      path === '/api/host'
        ? { mode: 'host', generation: 12 }
        : options?.method === 'PUT'
          ? detail(JSON.parse(options.body as string).body, 8)
          : detail(),
    ),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  window.dispatchEvent(new Event('unios:workspace-cleared'))
})

it('appends exact text and the UUID source, preserves the title and binds the live revision and host generation', async () => {
  const result = await transferJotToNote(jot, noteId, 3, 'Original')
  expect(mocks.request.mock.calls.map((call) => call[0])).toEqual([
    '/api/host',
    `/api/notes/${noteId}`,
    `/api/notes/${noteId}`,
  ])
  const options = mocks.request.mock.calls[2][1]
  expect(options.method).toBe('PUT')
  expect(options.headers).toEqual({ 'X-UniOS-Lease-Generation': '12' })
  expect(JSON.parse(options.body)).toEqual({
    title: 'Mein Titel',
    expected_revision: 7,
    body: `Vorhandene Mitschrift\n\n${jot.body}\n\n${source}`,
  })
  expect(result.alreadyLinked).toBe(false)
  expect(result.detail.note.current_revision).toBe(8)
  expect(jot.body).toBe('Was ist ein Eigenvektor?\nMeine Frage')
  expect(localStorage.length).toBe(0)
})

it.each(['persistent', 'volatile'])('blocks a %s local draft before making a request and retains it', async (kind) => {
  if (kind === 'persistent') keepDraft(workingDraft())
  else rememberVolatileNoteDraft(workingDraft())
  const before = localStorage.getItem(`unios:note-draft:v1:${noteId}`)
  await expect(transferJotToNote(jot, noteId, 3, 'Original')).rejects.toMatchObject({ reason: 'localDraft' })
  expect(mocks.request).not.toHaveBeenCalled()
  expect(localStorage.getItem(`unios:note-draft:v1:${noteId}`)).toBe(before)
})

it('blocks a local draft created while the live note read is pending', async () => {
  const read = deferred<NoteDetail>()
  mocks.request.mockImplementation((path) =>
    path === '/api/host' ? Promise.resolve({ mode: 'host', generation: 12 }) : read.promise,
  )
  const pending = transferJotToNote(jot, noteId, 3, 'Original')
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
  keepDraft(workingDraft())
  read.resolve(detail())
  await expect(pending).rejects.toMatchObject({ reason: 'localDraft' })
  expect(mocks.request).toHaveBeenCalledTimes(2)
})

it.each(['other-note', 'other-course', 'historical'])('rejects a %s result without a write', async (scenario) => {
  const wrong = detail()
  if (scenario === 'other-note') wrong.note.id = 'cccccccc-0000-0000-0000-000000000003'
  if (scenario === 'other-course') wrong.note.course_id = 4
  if (scenario === 'historical') wrong.selected_revision = 6
  mocks.request.mockResolvedValueOnce({ mode: 'host', generation: 12 }).mockResolvedValueOnce(wrong)
  await expect(transferJotToNote(jot, noteId, 3, 'Original')).rejects.toMatchObject({ reason: 'wrongNote' })
  expect(mocks.request).toHaveBeenCalledTimes(2)
})

it.each([
  { mode: 'standby', generation: 12 },
  { mode: 'host', generation: null },
])('rejects unavailable host %j', async (host) => {
  mocks.request.mockResolvedValueOnce(host)
  await expect(transferJotToNote(jot, noteId, 3, 'Original')).rejects.toMatchObject({ reason: 'hostUnavailable' })
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it('lets the existing revision/lease conflict fail without retrying or replacing any draft', async () => {
  mocks.request
    .mockResolvedValueOnce({ mode: 'host', generation: 12 })
    .mockResolvedValueOnce(detail())
    .mockRejectedValueOnce(new Error('409 version conflict'))
  await expect(transferJotToNote(jot, noteId, 3, 'Original')).rejects.toThrow('409 version conflict')
  expect(mocks.request).toHaveBeenCalledTimes(3)
  expect(localStorage.length).toBe(0)
})

it('after a lost write ACK explicitly retries the live read and does not append the same UUID twice', async () => {
  let server = detail()
  let writes = 0
  mocks.request.mockImplementation((path: string, options?: RequestInit) => {
    if (path === '/api/host') return Promise.resolve({ mode: 'host', generation: 12 })
    if (options?.method === 'PUT') {
      writes++
      server = detail(JSON.parse(options.body as string).body, 8)
      return Promise.reject(new Error('ACK lost'))
    }
    return Promise.resolve(server)
  })
  await expect(transferJotToNote(jot, noteId, 3, 'Original')).rejects.toThrow('ACK lost')
  const retry = await transferJotToNote(jot, noteId, 3, 'Original')
  expect(retry.alreadyLinked).toBe(true)
  expect(writes).toBe(1)
  expect(server.body.split(source)).toHaveLength(2)
  expect(includesJotSource(`[Other](/jots#jot-aaaaaaaa-0000-0000-0000-000000000011)`, jot.id)).toBe(false)
})

it('rejects a too-long append without writing', async () => {
  mocks.request
    .mockResolvedValueOnce({ mode: 'host', generation: 12 })
    .mockResolvedValueOnce(detail('x'.repeat(100_000)))
  await expect(transferJotToNote(jot, noteId, 3, 'Original')).rejects.toBeInstanceOf(JotTransferBlocked)
  expect(mocks.request).toHaveBeenCalledTimes(2)
})

it('prepares the existing create form, preserving earlier title/text and preventing repeated source insertion', () => {
  keepNewNoteDraft(3, null, 'Vorheriger Titel', 'Vorheriger Entwurf')
  expect(prepareJotNoteDraft(jot, 3, 'Neuer Titel', 'Original')).toBe('/notes?new=1&course_id=3')
  const first = newNoteDraftFor(3, null)!
  expect(first.title).toBe('Vorheriger Titel')
  expect(first.body).toBe(`Vorheriger Entwurf\n\n${jot.body}\n\n${source}`)
  prepareJotNoteDraft(jot, 3, 'Noch ein Titel', 'Original')
  expect(newNoteDraftFor(3, null)).toEqual(first)
  expect(mocks.request).not.toHaveBeenCalled()
})

it('does not claim a prepared draft when storage fails, and leaves the old device copy unchanged', () => {
  keepNewNoteDraft(3, null, 'Vorheriger Titel', 'Vorheriger Entwurf')
  const previous = newNoteDraftFor(3, null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  expect(() => prepareJotNoteDraft(jot, 3, 'Neuer Titel', 'Original')).toThrow('quota')
  expect(newNoteDraftFor(3, null)).toEqual(previous)
})

it('releases a clean completed free-note receipt only after preparing a distinct jot note', async () => {
  const first = keepNewNoteDraft(3, null, 'Old note', 'Already confirmed')
  mocks.request.mockResolvedValueOnce(detail('Already confirmed'))
  await saveSourceNote({ courseId: 3, resourceId: null, title: first.title, body: first.body, draft: first })
  expect(sourceNoteSaveState(3, null)).toMatchObject({ phase: 'saved', noteId })
  expect(prepareJotNoteDraft(jot, 3, 'New jot note', 'Original')).toBe('/notes?new=1&course_id=3')
  expect(sourceNoteSaveState(3, null).phase).toBe('idle')
  expect(newNoteDraftFor(3, null)).toMatchObject({ title: 'New jot note', body: `${jot.body}\n\n${source}` })
})

it('keeps later RAM-only free-note text and its confirmed UUID when adding a jot', async () => {
  const first = keepNewNoteDraft(3, null, 'Old note', 'Already sent')
  const pending = deferred<NoteDetail>()
  mocks.request.mockReturnValueOnce(pending.promise)
  const saving = saveSourceNote({ courseId: 3, resourceId: null, title: first.title, body: first.body, draft: first })
  rememberSourceWorkingDraft(3, null, {
    title: 'Later title',
    body: 'Newer RAM explanation',
    persisted: first,
    status: 'error',
  })
  pending.resolve(detail('Already sent'))
  await saving
  prepareJotNoteDraft(jot, 3, 'New jot note', 'Original')
  expect(sourceNoteSaveState(3, null)).toMatchObject({ phase: 'saved', noteId })
  expect(sourceWorkingDraft(3, null)).toMatchObject({
    title: 'Later title',
    body: `Newer RAM explanation\n\n${jot.body}\n\n${source}`,
    status: 'local',
  })
  expect(newNoteDraftFor(3, null)?.body).toBe(sourceWorkingDraft(3, null)?.body)
})

it('does not release a confirmed UUID when preparing its next jot note fails', async () => {
  const first = keepNewNoteDraft(3, null, 'Old note', 'Already confirmed')
  mocks.request.mockResolvedValueOnce(detail('Already confirmed'))
  await saveSourceNote({ courseId: 3, resourceId: null, title: first.title, body: first.body, draft: first })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  expect(() => prepareJotNoteDraft(jot, 3, 'New jot note', 'Original')).toThrow('quota')
  expect(sourceNoteSaveState(3, null)).toMatchObject({ phase: 'saved', noteId })
})
