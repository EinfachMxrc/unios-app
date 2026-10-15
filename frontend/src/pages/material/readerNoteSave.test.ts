// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { keepNewNoteDraft, newNoteDraftFor } from '@/noteDraft'
import type { NoteDetail } from '@/types'
import {
  beginNewSourceNote,
  rememberSourceWorkingDraft,
  sourceWorkingDraft,
  sourceNoteSaveState,
  resetSourceNoteSaves,
  saveSourceNote,
  type SourceNoteSnapshot,
} from '@/lib/sourceNoteSave'

vi.mock('@/api', () => ({ request: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

function snapshot(resourceId = 4): SourceNoteSnapshot {
  const draft = keepNewNoteDraft(2, resourceId, 'Erfundene Mitschrift', 'Mein Lernstoff')
  return { courseId: 2, resourceId, title: draft.title, body: draft.body, draft }
}

const created = (id: string): NoteDetail => ({
  note: {
    id,
    course_id: 2,
    resource_id: 4,
    course_name: 'Erfundener Kurs',
    title: 'Erfundene Mitschrift',
    current_revision: 1,
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z',
  },
  selected_revision: 1,
  body: 'Mein Lernstoff',
  versions: [],
})

beforeEach(() => {
  resetSourceNoteSaves()
  localStorage.clear()
  vi.mocked(request).mockReset()
})
afterEach(() => {
  resetSourceNoteSaves()
  vi.restoreAllMocks()
})

describe('source-scoped reader note saves', () => {
  it('keeps one acknowledged UUID for an explicit blank source-note creation', async () => {
    const pending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValue(pending.promise)
    const local = keepNewNoteDraft(2, 4, 'Blank lecture', '')
    const blank: SourceNoteSnapshot = { courseId: 2, resourceId: 4, title: local.title, body: '', draft: local }
    rememberSourceWorkingDraft(2, 4, { title: local.title, body: '', persisted: local, status: 'local' })
    expect(request).not.toHaveBeenCalled()
    const first = saveSourceNote(blank)
    expect(saveSourceNote(blank)).toBe(first)
    expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string).body).toBe('')
    const later = keepNewNoteDraft(2, 4, 'Blank lecture', 'Added during the blank create')
    rememberSourceWorkingDraft(2, 4, { title: later.title, body: later.body, persisted: later, status: 'local' })
    pending.resolve({ ...created('synthetic-blank-note'), body: '' })
    await expect(first).resolves.toMatchObject({ phase: 'saved', noteId: 'synthetic-blank-note' })
    expect(newNoteDraftFor(2, 4)).toEqual(later)
    expect(sourceWorkingDraft(2, 4)?.body).toBe(later.body)
    expect(saveSourceNote(blank)).toBe(first)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('shares the same unresolved promise and POST for a draft across callers', async () => {
    const pending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValue(pending.promise)
    const draft = snapshot()
    const first = saveSourceNote(draft)
    const second = saveSourceNote(draft)
    expect(second).toBe(first)
    expect(request).toHaveBeenCalledTimes(1)
    expect(sourceNoteSaveState(2, 4).phase).toBe('pending')
    pending.resolve(created('synthetic-note-1'))
    await expect(first).resolves.toMatchObject({ phase: 'saved', noteId: 'synthetic-note-1' })
    expect(newNoteDraftFor(2, 4)).toBeNull()
  })

  it('blocks a second create for the same source until the old request settles, preserving later edits', async () => {
    const pending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValue(pending.promise)
    const first = saveSourceNote(snapshot())
    const newer = keepNewNoteDraft(2, 4, 'Erfundene Mitschrift', 'Mein Lernstoff\n\nSpäterer Gedanke')
    expect(saveSourceNote({ courseId: 2, resourceId: 4, title: newer.title, body: newer.body, draft: newer })).toBe(
      first,
    )
    expect(request).toHaveBeenCalledTimes(1)
    pending.resolve(created('synthetic-note-1'))
    await first
    expect(newNoteDraftFor(2, 4)).toEqual(newer)
    expect(saveSourceNote({ courseId: 2, resourceId: 4, title: newer.title, body: newer.body, draft: newer })).toBe(
      first,
    )
    expect(request).toHaveBeenCalledTimes(1)
    beginNewSourceNote(2, 4)
    vi.mocked(request).mockResolvedValue(created('synthetic-note-2'))
    await saveSourceNote({ courseId: 2, resourceId: 4, title: newer.title, body: newer.body, draft: newer })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('allows another source to save independently while the first is pending', async () => {
    const firstPending = deferred<NoteDetail>()
    const secondPending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValueOnce(firstPending.promise).mockReturnValueOnce(secondPending.promise)
    const first = saveSourceNote(snapshot(4))
    const second = saveSourceNote(snapshot(5))
    expect(request).toHaveBeenCalledTimes(2)
    secondPending.resolve(created('synthetic-note-2'))
    await second
    expect(sourceNoteSaveState(2, 4).phase).toBe('pending')
    expect(sourceNoteSaveState(2, 5).phase).toBe('saved')
    firstPending.resolve(created('synthetic-note-1'))
    await first
  })

  it('keeps a failed request and recovery draft visible for a remounted caller', async () => {
    const pending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValue(pending.promise)
    const draft = snapshot()
    const result = saveSourceNote(draft)
    pending.reject(new Error('Synthetic server unavailable'))
    await expect(result).resolves.toMatchObject({ phase: 'error', message: 'Synthetic server unavailable' })
    expect(sourceNoteSaveState(2, 4)).toMatchObject({ phase: 'error' })
    expect(newNoteDraftFor(2, 4)).toEqual(draft.draft)
  })

  it('aborts and fences a stale success after pairing without clearing the new server draft', async () => {
    const pending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValue(pending.promise)
    const old = saveSourceNote(snapshot())
    const signal = vi.mocked(request).mock.calls[0][1]?.signal
    window.dispatchEvent(new Event('unios:workspace-cleared'))
    expect(signal?.aborted).toBe(true)
    expect(sourceNoteSaveState(2, 4).phase).toBe('idle')
    const newServerDraft = keepNewNoteDraft(2, 4, 'Neuer Bestand', 'Neuer Inhalt')
    // A test server may ignore cancellation; the completion fence still holds.
    pending.resolve(created('old-server-note'))
    await expect(old).resolves.toEqual({ phase: 'idle' })
    expect(sourceNoteSaveState(2, 4).phase).toBe('idle')
    expect(newNoteDraftFor(2, 4)).toEqual(newServerDraft)
  })

  it('does not duplicate an acknowledged note when removing its old device draft fails', async () => {
    vi.mocked(request).mockResolvedValue(created('synthetic-note-1'))
    const draft = snapshot()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Denied')
    })
    const first = saveSourceNote(draft)
    await expect(first).resolves.toMatchObject({ phase: 'saved', localCleanupFailed: true })
    expect(saveSourceNote(draft)).toBe(first)
    expect(request).toHaveBeenCalledTimes(1)
    expect(newNoteDraftFor(2, 4)).toEqual(draft.draft)
  })

  it('retains the confirmed free-note UUID and later local text while unrelated scopes exceed the cache budget', async () => {
    const pending = deferred<NoteDetail>()
    vi.mocked(request).mockReturnValueOnce(pending.promise)
    const firstDraft = keepNewNoteDraft(2, null, 'Free lecture', 'Sent A')
    const first = saveSourceNote({
      courseId: 2,
      resourceId: null,
      title: firstDraft.title,
      body: firstDraft.body,
      draft: firstDraft,
    })
    const later = keepNewNoteDraft(2, null, 'Free lecture', 'Later B')
    rememberSourceWorkingDraft(2, null, { title: later.title, body: later.body, persisted: later, status: 'local' })
    pending.resolve(created('synthetic-free-note'))
    await first
    vi.mocked(request).mockResolvedValue(created('synthetic-other-note'))
    for (let resourceId = 100; resourceId < 140; resourceId += 1) await saveSourceNote(snapshot(resourceId))
    expect(sourceNoteSaveState(2, null)).toMatchObject({ phase: 'saved', noteId: 'synthetic-free-note' })
    expect(sourceWorkingDraft(2, null)?.body).toBe('Later B')
    expect(saveSourceNote({ courseId: 2, resourceId: null, title: later.title, body: later.body, draft: later })).toBe(
      first,
    )
    expect(request).toHaveBeenCalledTimes(41)
  })
})
