// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, request } from '@/api'
import type { NoteCardContext, NoteCardInput, NoteCardResponse } from '@/noteCardTypes'
import { NoteSelectionCardDialog } from './NoteSelectionCardDialog'

const mocks = vi.hoisted(() => ({ online: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/api', async (original) => ({ ...(await original<typeof import('@/api')>()), request: vi.fn() }))
vi.mock('@/manualCardDraft', () => ({ invalidateManualCardReads: mocks.invalidate }))
vi.mock('@/lib/manualDraftPersistence', () => ({
  readManualWorkspace: async () => ({ id: 'test-workspace', backend: 'local' }),
  assertManualWorkspace: async () => undefined,
}))
vi.mock('@/hostAvailability', () => ({ useHostOnline: mocks.online }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

const context: NoteCardContext = {
  noteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  revision: 2,
  title: 'Synthetic note',
  courseId: 1,
  courseName: 'Synthetic course',
  quote: 'Original selection <T> &',
}
function response(sent: NoteCardInput): NoteCardResponse {
  return {
    queue_id: 7,
    status: 'approved',
    card: { card_type: 'basic', front: sent.front, back: sent.back, topic: sent.topic, course: 'synthetic' },
    source: {
      kind: 'note',
      note_id: context.noteId,
      note_title: context.title,
      revision: 2,
      course_id: 1,
      course_name: context.courseName,
      quote: context.quote,
      sha256: 'synthetic-hash',
      url: '/malicious-cache',
    },
    deck_name: 'Uni::Synthetic course',
    note_id: null,
    transfer_error: null,
  }
}
function open(canWrite = true, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <NoteSelectionCardDialog context={context} canWrite={canWrite} onClose={onClose} />
    </MemoryRouter>,
  )
}
async function question(value = 'What is the selection?') {
  await waitFor(() => expect(screen.getByLabelText('front')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('front'), { target: { value } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'save' })).toBeEnabled())
}
beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new Event('unios:workspace-cleared'))
  vi.clearAllMocks()
  mocks.online.mockReturnValue(true)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_key: string, options: unknown, callback: (() => Promise<unknown>) | undefined) =>
        (typeof options === 'function' ? (options as () => Promise<unknown>) : callback!)(),
    },
  })
  vi.mocked(request).mockImplementation(
    async (_path, options) => response(JSON.parse(options!.body as string)) as never,
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('prefills only the answer and requires the user to confirm their own question', async () => {
  open()
  await waitFor(() => expect(screen.getByLabelText('front')).toBeEnabled())
  expect(screen.getByLabelText('front')).toHaveValue('')
  expect(screen.getByLabelText('back')).toHaveValue(context.quote)
  expect(request).not.toHaveBeenCalled()
  await question()
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  await screen.findByText('pendingTransfer')
  expect(screen.queryByText('transferred')).toBeNull()
  const [path, options] = vi.mocked(request).mock.calls[0]
  expect(path).toBe('/api/anki/note-cards')
  expect(JSON.parse(options!.body as string)).toMatchObject({
    front: 'What is the selection?',
    back: context.quote,
    source: { note_id: context.noteId, revision: 2, quote: context.quote },
  })
  expect(screen.getByRole('link', { name: 'openSource' })).toHaveAttribute(
    'href',
    `/notes?id=${context.noteId}&revision=2`,
  )
  expect(mocks.invalidate).toHaveBeenCalled()
})

it('recovers an ambiguous send after a reload with the exact same identity and locked content', async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error('Synthetic lost response'))
  const first = open()
  await question()
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  await screen.findByText('unconfirmed')
  const sent = vi.mocked(request).mock.calls[0][1]!.body
  first.unmount()
  window.dispatchEvent(new Event('unios:workspace-cleared'))
  open()
  await screen.findByText('unconfirmed')
  expect(screen.getByLabelText('front')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'retryExact' }))
  await screen.findByText('pendingTransfer')
  expect(vi.mocked(request).mock.calls[1][1]!.body).toBe(sent)
})

it('retains an offline draft without sending a card', async () => {
  mocks.online.mockReturnValue(false)
  const first = open(false)
  await waitFor(() => expect(screen.getByLabelText('front')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('front'), { target: { value: 'Offline question' } })
  await waitFor(() => expect(screen.getByText('localSaved')).toBeVisible())
  first.unmount()
  window.dispatchEvent(new Event('unios:workspace-cleared'))
  open(false)
  await waitFor(() => expect(screen.getByLabelText('front')).toHaveValue('Offline question'))
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  expect(request).not.toHaveBeenCalled()
})

it('does not silently retarget a changed note revision', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError('Synthetic changed note', 409, 'MANUAL_SOURCE_CHANGED'))
  open()
  await question()
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  await screen.findByText(
    'Notiz oder Auswahl wurde inzwischen geändert. Öffne die aktuelle Mitschrift und wähle die Stelle erneut.',
  )
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  expect(screen.getByLabelText('front')).toBeDisabled()
  expect(request).toHaveBeenCalledTimes(1)
})

it('keeps unsaved input visible when persistence fails and requires acknowledgment before closing', async () => {
  const onClose = vi.fn()
  open(true, onClose)
  await waitFor(() => expect(screen.getByLabelText('front')).toBeEnabled())
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic quota failure')
  })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  fireEvent.change(screen.getByLabelText('front'), { target: { value: 'Keep this question' } })
  await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
  expect(screen.getByLabelText('front')).toHaveValue('Keep this question')
  expect(screen.queryByText('localSaved')).toBeNull()
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: 'close' })[0])
  expect(window.confirm).toHaveBeenCalledWith('closeUnsafeConfirm')
  expect(onClose).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
})
