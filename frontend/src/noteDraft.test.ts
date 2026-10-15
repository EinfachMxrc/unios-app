// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { clearDraft, draftFor, keepDraft, rememberVolatileNoteDraft, workingNoteDraftFor } from './noteDraft'

const original = {
  noteId: 'synthetic-note-a',
  baseRevision: 3,
  baseTitle: 'Saved title',
  baseBody: 'Saved baseline',
  title: 'Own title',
  body: 'Old local body',
}
beforeEach(() => {
  clearWorkspace()
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearWorkspace()
})

it('retains durable and RAM note recovery without crypto.randomUUID', () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  const draft = keepDraft(original)
  expect(draft.writeId).toMatch(/^[0-9a-f-]{36}$/)
  expect(draftFor(original.noteId)).toEqual(draft)
  expect(rememberVolatileNoteDraft({ ...original, body: 'New RAM draft' }).writeId).not.toBe(draft.writeId)
})

it('restores the latest RAM text over an older durable draft after a failed local write', () => {
  const disk = keepDraft(original)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic denied storage')
  })
  const newer = { ...original, body: 'Newest text only in this window' }
  expect(() => keepDraft(newer)).toThrow('Synthetic denied storage')
  const ram = rememberVolatileNoteDraft(newer)
  expect(draftFor(original.noteId)).toEqual(disk)
  expect(workingNoteDraftFor(original.noteId)).toEqual(ram)
  expect(ram.baseRevision).toBe(3)
  expect(ram.baseBody).toBe(original.baseBody)
})

it('isolates RAM recovery by UUID through target changes and clears it on workspace reset', () => {
  const one = rememberVolatileNoteDraft(original)
  const two = rememberVolatileNoteDraft({ ...original, noteId: 'synthetic-note-b', body: 'Other target text' })
  expect(workingNoteDraftFor(one.noteId)).toEqual(one)
  expect(workingNoteDraftFor(two.noteId)).toEqual(two)
  clearWorkspace()
  expect(workingNoteDraftFor(one.noteId)).toBeNull()
  expect(workingNoteDraftFor(two.noteId)).toBeNull()
})

it('does not let an old server acknowledgement clear a newer RAM recovery copy', () => {
  const sent = keepDraft(original)
  const newer = rememberVolatileNoteDraft({ ...original, body: 'New during request' })
  clearDraft(sent.noteId, sent.writeId)
  expect(draftFor(sent.noteId)).toBeNull()
  expect(workingNoteDraftFor(sent.noteId)).toEqual(newer)
  clearDraft(newer.noteId, newer.writeId)
  expect(workingNoteDraftFor(sent.noteId)).toBeNull()
})

it('replaces a RAM fallback with the newly durable text once storage recovers', () => {
  rememberVolatileNoteDraft({ ...original, body: 'RAM text' })
  const recovered = keepDraft({ ...original, body: 'Durable newest text' })
  expect(workingNoteDraftFor(original.noteId)).toEqual(recovered)
  expect(draftFor(original.noteId)).toEqual(recovered)
})
