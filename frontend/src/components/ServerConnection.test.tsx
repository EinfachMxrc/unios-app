// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ServerConnectionPanel } from './ServerConnection'
import { request } from '@/api'
import {
  openManualDraft,
  manualDraftState,
  saveManualDraft,
  resetManualDraftWorkspace,
  settleManualWorkspaceReset,
} from '@/manualCardDraft'
import type { ManualCardContext, ManualCardResponse } from '@/manualCardTypes'
const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  removePersisted: vi.fn(),
  clearFiles: vi.fn(),
}))
vi.mock('@/api', () => ({ request: vi.fn() }))
vi.mock('@/offlineCache', () => ({
  queryClient: { invalidateQueries: mocks.invalidate, cancelQueries: mocks.cancel, removeQueries: mocks.remove },
  persister: { removeClient: mocks.removePersisted },
}))
vi.mock('@/lib/courseOffline', () => ({ clearCourseOfflineData: mocks.clearFiles }))
vi.mock('@/lib/runtimeAccess', () => ({ runtimeWritesAllowed: () => true, useRuntimeVerified: () => true }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
const context: ManualCardContext = {
  resource_id: 1,
  resource_name: 'Synthetic.pdf',
  course_id: 2,
  course_name: 'Synthetic',
  version_id: 17,
  version: 1,
  page: 12,
  quote: 'Synthetic quote',
  annotation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  annotation_revision: 3,
  comment: 'Synthetic question',
  url: '/material/17?page=12',
}
const response: ManualCardResponse = {
  queue_id: 8,
  status: 'approved',
  card: {
    card_type: 'basic',
    front: context.comment,
    back: context.quote,
    course: 'synthetic',
    topic: 'Synthetic',
    confidence: null,
  },
  source: { ...context, sha256: 'synthetic-hash' },
  deck_name: 'Uni::Synthetic',
  note_id: null,
  transfer_error: null,
}
const marker = 'unios:manual-card-workspace:v2'
beforeEach(async () => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, options: unknown, callback?: () => Promise<unknown>) =>
        typeof options === 'function' ? options() : callback!(),
    },
  })
  vi.clearAllMocks()
  localStorage.clear()
  resetManualDraftWorkspace()
  await settleManualWorkspaceReset()
  mocks.invalidate.mockResolvedValue(undefined)
  vi.mocked(request).mockResolvedValue(response)
  mocks.cancel.mockResolvedValue(undefined)
  mocks.removePersisted.mockResolvedValue(undefined)
  mocks.clearFiles.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetManualDraftWorkspace()
  await settleManualWorkspaceReset()
})
function pair() {
  render(
    <ServerConnectionPanel state={{ mode: 'client', configured: false, server_url: '', keyring_available: true }} />,
  )
  fireEvent.change(screen.getByLabelText('address'), { target: { value: 'https://synthetic.invalid' } })
  fireEvent.change(screen.getByLabelText('code'), { target: { value: 'synthetic-pair-code' } })
  fireEvent.click(screen.getByRole('button', { name: 'connect' }))
}
it('commits the binding fence before pairing and rolls back only the proven pre-write 401 rejection', async () => {
  await openManualDraft(context)
  vi.mocked(request).mockRejectedValueOnce(new Error('Synthetic old ACK lost'))
  await saveManualDraft(context)
  const payload = JSON.parse(vi.mocked(request).mock.calls[0][1]!.body as string)
  const previous = JSON.parse(localStorage.getItem(marker)!)
  vi.mocked(fetch).mockImplementation(async () => {
    expect(JSON.parse(localStorage.getItem(marker)!).binding).toBe('changing')
    return new Response('{}', { status: 401 })
  })
  pair()
  await screen.findByText('invalidCode')
  await waitFor(() => expect(manualDraftState(context).phase).toBe('unconfirmed'))
  expect(JSON.parse(localStorage.getItem(marker)!)).toMatchObject({ id: previous.id, binding: 'ready' })
  await saveManualDraft(context)
  expect(JSON.parse(vi.mocked(request).mock.calls[1][1]!.body as string)).toEqual(payload)
})
it('keeps a network-ambiguous pairing fenced instead of sending the old UUID to a potentially new host', async () => {
  await openManualDraft(context)
  vi.mocked(request).mockRejectedValueOnce(new Error('Synthetic old ACK lost'))
  await saveManualDraft(context)
  vi.mocked(fetch).mockRejectedValueOnce(new Error('Synthetic pairing ACK lost'))
  pair()
  await screen.findByText('unavailable')
  expect(JSON.parse(localStorage.getItem(marker)!).binding).toBe('changing')
  await saveManualDraft(context)
  expect(request).toHaveBeenCalledTimes(1)
})
it('keeps a successful pair fenced if the subsequent durable namespace write fails', async () => {
  await openManualDraft(context)
  const previous = JSON.parse(localStorage.getItem(marker)!),
    original = Storage.prototype.setItem
  vi.mocked(fetch).mockImplementation(async () => {
    expect(JSON.parse(localStorage.getItem(marker)!).binding).toBe('changing')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === marker && JSON.parse(value).id !== previous.id) throw new Error('Synthetic rotation quota')
      return original.call(this, key, value)
    })
    return new Response('{}', { status: 200 })
  })
  pair()
  await screen.findByText('unavailable')
  expect(JSON.parse(localStorage.getItem(marker)!)).toMatchObject({ id: previous.id, binding: 'changing' })
  await openManualDraft(context)
  expect(manualDraftState(context).phase).toBe('unavailable')
  await saveManualDraft(context)
  expect(request).not.toHaveBeenCalled()
})
it('cancels and removes old authenticated reads and explicit files before opening a renewed pairing', async () => {
  await openManualDraft(context)
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
  pair()
  await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['native-client-status'] }))
  expect(mocks.clearFiles).toHaveBeenCalledOnce()
  expect(mocks.cancel).toHaveBeenCalledWith({ queryKey: ['api'] })
  expect(mocks.remove).toHaveBeenCalledWith({ queryKey: ['api'] })
  expect(mocks.removePersisted).toHaveBeenCalledOnce()
  expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0])
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.removePersisted.mock.invocationCallOrder[0])
  expect(mocks.removePersisted.mock.invocationCallOrder[0]).toBeLessThan(mocks.invalidate.mock.invocationCallOrder[0])
})
