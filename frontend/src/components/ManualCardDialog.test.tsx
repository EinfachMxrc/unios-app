// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { request } from '@/api'
import { resetManualDraftWorkspace, settleManualWorkspaceReset } from '@/manualCardDraft'
import { manualCardContext, type ManualCardContext, type ManualCardResponse } from '@/manualCardTypes'
import type { Material, MaterialAnnotation } from '@/types'
import { ManualCardDialog } from './ManualCardDialog'

const mocks = vi.hoisted(() => ({ online: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/api', () => ({ request: vi.fn() }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: mocks.invalidate } }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: mocks.online }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

const context: ManualCardContext = { resource_id: 1, resource_name: 'Synthetic.pdf', course_id: 2,
  course_name: 'Synthetic Course', version_id: 17, version: 1, page: 12, quote: 'Original quote <T> &',
  annotation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', annotation_revision: 3, comment: 'Own question',
  url: '/material/17?page=12' }
const response: ManualCardResponse = { queue_id: 8, status: 'approved',
  card: { card_type: 'basic', front: 'Own question', back: context.quote, course: 'synthetic', topic: 'Synthetic', confidence: null },
  source: { ...context, sha256: 'synthetic-hash' }, deck_name: 'Uni::Synthetic Course', note_id: null,
  transfer_error: 'Synthetic engine unavailable' }
function open(canWrite = true, onClose = vi.fn()) {
  return render(<MemoryRouter><ManualCardDialog context={context} canWrite={canWrite} onClose={onClose} /></MemoryRouter>)
}
beforeEach(async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, options, callback) => {
    const work = typeof options === 'function' ? options : callback; return work()
  }) } })
  localStorage.clear(); resetManualDraftWorkspace(); await settleManualWorkspaceReset(); vi.clearAllMocks()
  mocks.online.mockReturnValue(true); mocks.invalidate.mockResolvedValue(undefined)
  vi.mocked(request).mockResolvedValue(response)
})
afterEach(async () => {
  cleanup(); vi.restoreAllMocks()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name: string, work: () => Promise<void>) => work() } })
  resetManualDraftWorkspace(); await settleManualWorkspaceReset()
})

it('requires explicit own approval and shows truthful saved-pending status with frozen source and destination', async () => {
  open()
  const front = await screen.findByLabelText('manual.front') as HTMLTextAreaElement
  await waitFor(() => expect(front.disabled).toBe(false))
  expect(front.value).toBe(context.comment)
  expect((screen.getByLabelText('manual.back') as HTMLTextAreaElement).value).toBe(context.quote)
  expect(request).not.toHaveBeenCalled()
  fireEvent.change(front, { target: { value: 'What is <T> & why?' } })
  fireEvent.click(screen.getByRole('button', { name: 'manual.save' }))
  await screen.findByText('manual.pendingTransfer')
  expect(screen.queryByText('manual.transferred')).toBeNull()
  expect(screen.getByText('Synthetic engine unavailable')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'manual.openSource' }).getAttribute('href')).toBe('/material/17?page=12')
  expect(screen.getByRole('link', { name: 'manual.openQueue' }).getAttribute('href')).toBe('/study/cards#card-8')
  const posts = vi.mocked(request).mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(posts).toHaveLength(1)
  expect(posts[0][0]).toBe('/api/anki/manual-cards')
  expect(JSON.parse(posts[0][1]!.body as string)).toMatchObject({ front: 'What is <T> & why?',
    back: context.quote, source: { version_id: 17, page: 12, expected_revision: 3 } })
  expect(JSON.parse(posts[0][1]!.body as string)).not.toHaveProperty('confidence')
  expect(mocks.invalidate).toHaveBeenCalled()
})

it('lets an offline/read-only user retain a draft without any creation request', async () => {
  mocks.online.mockReturnValue(false)
  const first = open(false)
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('manual.front'), { target: { value: 'Offline question' } })
  await screen.findByText('manual.localSaved')
  expect((screen.getByRole('button', { name: 'manual.save' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByLabelText('manual.front').closest('form')!)
  expect(request).not.toHaveBeenCalled()
  first.unmount(); open(false)
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).value).toBe('Offline question'))
})

it('keeps a pending creation locked through dialog remount and retains one exact request', async () => {
  let resolve!: (value: ManualCardResponse) => void
  const held = new Promise<ManualCardResponse>(accept => { resolve = accept })
  vi.mocked(request).mockReturnValueOnce(held)
  const first = open()
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'manual.save' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  first.unmount(); open()
  expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(true)
  fireEvent.submit(screen.getByLabelText('manual.front').closest('form')!)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => { resolve(response); await held })
  await screen.findByText('manual.pendingTransfer')
  expect(vi.mocked(request).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})

it('does not advertise a local copy or discard the dialog when draft persistence is denied', async () => {
  const onClose = vi.fn()
  open(true, onClose)
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota') })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  fireEvent.change(screen.getByLabelText('manual.front'), { target: { value: 'Keep this question' } })
  await screen.findByText('manual.localFailure')
  expect(screen.queryByText('manual.localSaved')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'manual.save' }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'manual.save' }) as HTMLButtonElement).disabled).toBe(false))
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: 'manual.close' })[0])
  expect(window.confirm).toHaveBeenCalledWith('manual.closeUnsafeConfirm')
  expect(onClose).not.toHaveBeenCalled()
  expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).value).toBe('Keep this question')
})

it('captures the displayed historical version rather than the annotation reanchor version', () => {
  const material: Material = { version_id: 17, version: 1, resource_id: 1, resource_name: 'Synthetic.pdf',
    course_id: 2, course_name: 'Synthetic Course', versions: [{ id: 17, version: 1 }, { id: 18, version: 2 }], annotations: [] }
  const annotation: MaterialAnnotation = { id: context.annotation_id, resource_id: 1, source_version_id: 18,
    revision: 3, quote: context.quote, comment: 'Own question', resolved: false, kind: 'highlight',
    anchor: { status: 'matched', page: 12, rects: [] }, created_at: '2026-10-07T10:00:00Z', updated_at: '2026-10-07T10:00:00Z' }
  expect(manualCardContext(material, annotation)).toMatchObject({ version_id: 17, page: 12, annotation_revision: 3 })
  expect(manualCardContext(material, { ...annotation, anchor: { ...annotation.anchor, status: 'ambiguous' } })).toBeNull()
  expect(manualCardContext(material, { ...annotation, revision: 0 })).toBeNull()
  expect(manualCardContext(material, { ...annotation, resource_id: 9 })).toBeNull()
})

it('keeps rejected own text locked until the user verifies and explicitly accepts the refreshed source', async () => {
  vi.mocked(request).mockRejectedValueOnce(Object.assign(new Error('Synthetic stale source'), {
    status: 409, code: 'MANUAL_SOURCE_CHANGED',
  }))
  open()
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('manual.front'), { target: { value: 'Keep own question' } })
  fireEvent.click(screen.getByRole('button', { name: 'manual.save' }))
  await screen.findByText('manual.sourceChanged')
  const before = JSON.parse(vi.mocked(request).mock.calls[0][1]!.body as string)
  expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'manual.acceptSource' })).toBeNull()
  vi.mocked(request).mockResolvedValueOnce({ version_id: 17, resource_id: 1, resource_name: 'Synthetic.pdf',
    course_id: 2, course_name: 'Synthetic Course', version: 1, versions: [], annotations: [{
      id: context.annotation_id, resource_id: 1, source_version_id: 18, revision: 4, quote: 'Verified fresh quote',
      comment: 'Fresh comment', anchor: { status: 'matched', page: 13, rects: [] },
    }] })
  fireEvent.click(screen.getByRole('button', { name: 'manual.checkSource' }))
  await screen.findByText('Verified fresh quote')
  expect(screen.queryByRole('button', { name: 'manual.save' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'manual.acceptSource' }))
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).value).toBe('Keep own question')
  fireEvent.click(screen.getByRole('button', { name: 'manual.save' }))
  await screen.findByText('manual.pendingTransfer')
  const posts = vi.mocked(request).mock.calls.filter(([, options]) => options?.method === 'POST')
  const recovered = JSON.parse(posts[1][1]!.body as string)
  expect(recovered.mutation_id).not.toBe(before.mutation_id)
  expect(recovered.front).toBe(before.front)
  expect(recovered.source).toMatchObject({ version_id: 17, page: 13, expected_revision: 4 })
})

it('shows a stale own edit as a readable preserved version and requires explicit adoption', async () => {
  open()
  const front = screen.getByLabelText('manual.front') as HTMLTextAreaElement
  await waitFor(() => expect(front.disabled).toBe(false))
  const marker = JSON.parse(localStorage.getItem('unios:manual-card-workspace:v2')!)
  const key = `unios:manual-card-draft:v2:${marker.id}:17:${context.annotation_id}`
  const envelope = JSON.parse(localStorage.getItem(key)!)
  envelope.head.draft.front = 'Other window question'
  envelope.head.draft.writeId = crypto.randomUUID(); envelope.head.revision += 1; envelope.revision += 1
  localStorage.setItem(key, JSON.stringify(envelope))
  fireEvent.change(front, { target: { value: 'Preserve my own question' } })
  await screen.findByText('manual.conflict')
  expect(front.value).toBe('Preserve my own question'); expect(front.disabled).toBe(true)
  const copies = screen.getByRole('region', { name: 'manual.copiesTitle' })
  expect(copies.textContent).toContain('Preserve my own question')
  expect((screen.getByRole('button', { name: 'manual.save' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'manual.adoptCopy' }))
  await waitFor(() => expect(front.disabled).toBe(false))
  expect(front.value).toBe('Preserve my own question')
  expect(screen.getByRole('region', { name: 'manual.copiesTitle' }).textContent).toContain('Other window question')
  expect(request).not.toHaveBeenCalled()
})
it('honestly blocks approval when the browser lacks a safe server binding lock', async () => {
  open()
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  fireEvent.change(screen.getByLabelText('manual.front'), { target: { value: 'RAM question remains available' } })
  await screen.findByText('manual.coordinationUnavailable')
  expect((screen.getByRole('button', { name: 'manual.save' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByLabelText('manual.front').closest('form')!)
  expect(request).not.toHaveBeenCalled()
})
