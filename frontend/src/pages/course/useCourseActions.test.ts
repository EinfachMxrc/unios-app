// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CourseDetail } from '@/types'
import { useCourseActions } from './useCourseActions'

const api = vi.hoisted(() => ({ request: vi.fn(), notifySyncCompleted: vi.fn() }))
vi.mock('@/api', () => api)

const detail = { course: { is_active: true, download_other_groups: false } } as unknown as CourseDetail

beforeEach(() => { api.request.mockReset(); api.notifySyncCompleted.mockReset() })
afterEach(cleanup)

function setup() {
  const reload = vi.fn()
  const hook = renderHook(() => useCourseActions('7', detail, reload))
  return { reload, ...hook }
}

it('toggles activity with the expected old value and announces the sync', async () => {
  api.request.mockResolvedValue({})
  const { result, reload } = setup()
  await act(() => result.current.changeActivity())
  expect(api.request).toHaveBeenCalledWith('/api/entities/course/7/actions/course.set_activity',
    { method: 'POST', body: JSON.stringify({ confirmed: true, input: { active: false, expected: true } }) })
  expect(api.notifySyncCompleted).toHaveBeenCalledOnce()
  expect(reload).toHaveBeenCalledOnce()
  expect(result.current.busy).toBe(false)
})

it('shows a failure, keeps the data, and clears the old error on the next attempt', async () => {
  api.request.mockRejectedValueOnce(new Error('HTTP 409')).mockResolvedValueOnce({})
  const { result, reload } = setup()
  await act(() => result.current.changeSemester('3'))
  expect(result.current.actionError).toContain('409')
  expect(reload).not.toHaveBeenCalled()
  await act(() => result.current.changeGroup(5, 'mine'))
  expect(result.current.actionError).toBe('')
  expect(reload).toHaveBeenCalledOnce()
})

it('shows the group-download choice at once and rolls it back when saving fails', async () => {
  let fail: (reason: Error) => void = () => undefined
  api.request.mockReturnValue(new Promise((_, reject) => { fail = reject }))
  const { result } = setup()
  let pending: Promise<void> = Promise.resolve()
  act(() => { pending = result.current.changeGroupDownload(true) })
  expect(result.current.downloadOther).toBe(true)
  expect(result.current.busy).toBe(true)
  fail(new Error('HTTP 503'))
  await act(() => pending)
  expect(result.current.downloadOther).toBeNull()
  expect(result.current.actionError).toContain('503')
})
