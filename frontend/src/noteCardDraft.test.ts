// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import type { NoteCardContext } from './noteCardTypes'

const mocks = vi.hoisted(() => ({ readWorkspace: vi.fn() }))
vi.mock('@/api', () => ({ ApiError: class extends Error {}, request: vi.fn() }))
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/manualCardDraft', () => ({ invalidateManualCardReads: vi.fn() }))
vi.mock('@/lib/manualDraftCoordination', () => ({
  manualWebLocksAvailable: () => true,
  withManualBinding: async (_key: string, work: () => Promise<unknown>) => work(),
  withManualStorageLock: async (_key: string, work: () => Promise<unknown>) => work(),
}))
vi.mock('@/lib/manualDraftPersistence', () => ({
  readManualWorkspace: mocks.readWorkspace,
  assertManualWorkspace: vi.fn(async () => undefined),
}))

const context: NoteCardContext = {
  noteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  revision: 1,
  title: 'Synthetic note',
  courseId: 1,
  courseName: 'Synthetic course',
  quote: 'Synthetic quote',
}

beforeEach(() => {
  vi.resetModules()
  mocks.readWorkspace.mockReset()
  localStorage.clear()
})

it('does not leave the dialog loading when the workspace is reset during the first load', async () => {
  let release!: () => void
  mocks.readWorkspace
    .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ id: 'old' }))))
    .mockResolvedValue({ id: 'new' })
  const { openNoteCardDraft, noteCardState } = await import('./noteCardDraft')
  const first = openNoteCardDraft(context)
  window.dispatchEvent(new Event('unios:workspace-cleared'))
  // The re-render after the reset asks again; it must start a fresh load, not reuse the stale promise.
  const second = openNoteCardDraft(context)
  await second
  expect(noteCardState(context).phase).toBe('editing')
  release()
  await first
  expect(noteCardState(context).phase).toBe('editing')
})
