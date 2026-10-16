// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest'
import type { Material, NoteDetail } from '@/types'
import { chooseSourceNoteTarget, sourceNoteTarget, sourceNoteTargetsSettled } from '@/lib/sourceNoteTarget'
import { clearWorkspace } from '@/lib/workspaceState'
import { queryClient } from '@/offlineCache'
import { appendReaderExcerpt, prepareReaderTarget, ReaderExcerptError } from './readerExcerpt'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api', () => ({ request: mocks.request }))
vi.mock('@/lib/manualDraftPersistence', () => ({ readManualWorkspace: async () => ({ id: 'workspace-1' }) }))

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const material: Material = {
  version_id: 17,
  resource_id: 4,
  course_id: 2,
  resource_name: 'Vorlesung 3.pdf',
  course_name: 'Erfundener Kurs',
  version: 1,
  versions: [{ id: 17, version: 1 }],
  annotations: [],
}
const detail: NoteDetail = {
  note: {
    id,
    course_id: 2,
    resource_id: 4,
    course_name: 'Erfundener Kurs',
    title: 'Lecture',
    current_revision: 3,
    created_at: '2026-10-09T10:00:00Z',
    updated_at: '2026-10-09T10:00:00Z',
  },
  body: 'Saved baseline',
  selected_revision: 3,
  versions: [],
}

beforeEach(() => {
  vi.restoreAllMocks()
  mocks.request.mockReset()
  localStorage.clear()
  sessionStorage.clear()
  clearWorkspace()
  queryClient.clear()
})

it('restores the durable target and loads its note before the drawer ever opened', async () => {
  // A fresh tab: the durable handle is in localStorage, nothing was chosen in this session yet.
  localStorage.setItem(
    'unios-source-note-targets-v1',
    JSON.stringify({ schema: 1, workspaceId: 'workspace-1', targets: [[2, 4, id]] }),
  )
  expect(sourceNoteTarget(2, 4)).toBeNull()
  mocks.request.mockResolvedValue(detail)

  await prepareReaderTarget(material)

  expect(sourceNoteTarget(2, 4)).toBe(id)
  expect(mocks.request).toHaveBeenCalledWith(`/api/notes/${id}`, expect.anything())
  const draft = appendReaderExcerpt({ material, quote: 'Genau diese Stelle', page: 3 })
  expect('noteId' in draft && draft.noteId).toBe(id)
})

it('refuses to guess a new draft when the chosen note cannot be loaded', async () => {
  chooseSourceNoteTarget(2, 4, id)
  await sourceNoteTargetsSettled()
  mocks.request.mockRejectedValue(new Error('offline'))
  await expect(prepareReaderTarget(material)).rejects.toThrowError(ReaderExcerptError)
})

it('needs no network when no target note was ever chosen', async () => {
  await prepareReaderTarget(material)
  expect(mocks.request).not.toHaveBeenCalled()
})
