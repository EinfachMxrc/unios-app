// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, request } from '@/api'
import { useCalendarMutation } from './useCalendarMutation'

vi.mock('@/api', async importOriginal => ({ ...await importOriginal<typeof import('@/api')>(), request: vi.fn() }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
const event = { id: 7, title: 'Synthetic lecture', starts_at: '2026-10-07T08:00:00Z', ends_at: '2026-10-07T09:00:00Z', revision: 'revision-1' }
const draft = { title: event.title, starts_at: '2026-10-07T08:15:00Z', ends_at: '2026-10-07T09:15:00Z' }
beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('keeps an optimistic event identifiable and prevents simultaneous writes', async () => {
  let finish!: (value: unknown) => void
  vi.mocked(request).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const changed = vi.fn(), hook = renderHook(() => useCalendarMutation(changed))
  let save!: Promise<boolean>
  act(() => { save = hook.result.current.save(draft, event) })
  expect(hook.result.current.pending).toMatchObject(draft)
  expect(hook.result.current.subject?.id).toBe(7)
  expect(hook.result.current.busy).toBe(true)
  let second = true
  await act(async () => { second = await hook.result.current.save(draft, event) })
  expect(second).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ event: { ...event, ...draft, revision: 'revision-2' }, undo_id: 'action-1' }); await save })
  expect(hook.result.current.pending).toBeNull()
  expect(hook.result.current.busy).toBe(false)
  expect(hook.result.current.undo).toEqual({ action: 'action-1', eventId: 7 })
})

it('rolls back a failed save and retries exactly the revision guarded attempt', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError('Temporary failure', 503))
    .mockResolvedValueOnce({ event: { ...event, ...draft, revision: 'revision-2' }, undo_id: 'action-2' })
  const hook = renderHook(() => useCalendarMutation(vi.fn()))
  await act(async () => { await hook.result.current.save(draft, event) })
  expect(hook.result.current.pending).toBeNull()
  expect(hook.result.current.failure).toBe('Temporary failure')
  expect(hook.result.current.retryable).toBe(true)
  await act(async () => { await hook.result.current.retryLast() })
  expect(request).toHaveBeenNthCalledWith(2, '/api/timetable/events/7', { method: 'PATCH', body: JSON.stringify({ ...draft, revision: 'revision-1' }) })
  expect(hook.result.current.failure).toBe('')
})

it('refreshes after a revision conflict and never retries the stale revision', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('Appointment changed', 409))
  const changed = vi.fn(), hook = renderHook(() => useCalendarMutation(changed))
  await act(async () => { await hook.result.current.save(draft, event) })
  expect(hook.result.current.conflict).toBe(true)
  expect(hook.result.current.retryable).toBe(false)
  expect(changed).toHaveBeenCalledWith({ event: null, undo_id: null })
  await act(async () => { expect(await hook.result.current.retryLast()).toBe(false) })
  expect(request).toHaveBeenCalledTimes(1)
})

it('does not offer a blind retry for a creation whose response was lost', async () => {
  vi.mocked(request).mockRejectedValue(new TypeError('Network response lost'))
  const hook = renderHook(() => useCalendarMutation(vi.fn()))
  await act(async () => { await hook.result.current.save(draft) })
  expect(hook.result.current.retryable).toBe(false)
  act(() => hook.result.current.clearFailure())
  expect(hook.result.current.failure).toBe('')
})

it('clears the short success feedback while keeping Undo available', async () => {
  vi.useFakeTimers()
  vi.mocked(request).mockResolvedValue({ event, undo_id: 'action-3' })
  const hook = renderHook(() => useCalendarMutation(vi.fn()))
  await act(async () => { await hook.result.current.save(draft, event) })
  expect(hook.result.current.message).toBe('calendarSaved')
  act(() => vi.advanceTimersByTime(2000))
  expect(hook.result.current.message).toBe('')
  expect(hook.result.current.undo?.action).toBe('action-3')
})
