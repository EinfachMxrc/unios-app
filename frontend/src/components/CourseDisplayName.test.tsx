// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/api'
import type { CourseDetail } from '@/types'
import { CourseDisplayName } from './CourseDisplayName'

vi.mock('@/api', () => ({ request: vi.fn(), notifySyncCompleted: vi.fn() }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

const original = { id: 1, name: 'Synthetic course', display_name: null } as CourseDetail['course']
const tree = (course = original) => <CourseDisplayName course={course} disabled={false} reload={() => undefined} />
beforeEach(() => vi.mocked(request).mockReset())
afterEach(cleanup)

it('refreshes a pristine form before resetting a name restored from a newer server response', async () => {
  const view = render(tree())
  view.rerender(tree({ ...original, display_name: 'Short name' }))
  expect((screen.getByLabelText('displayName') as HTMLInputElement).value).toBe('Short name')
  vi.mocked(request).mockResolvedValue({ display_name: null })
  fireEvent.change(screen.getByLabelText('displayName'), { target: { value: '' } })
  fireEvent.submit(screen.getByLabelText('displayName').closest('form')!)
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)).toEqual({
    display_name: '',
    expected_display_name: 'Short name',
  })
})

it('keeps a dirty edit and its original comparison value when another writer renames the course', async () => {
  const view = render(tree())
  fireEvent.change(screen.getByLabelText('displayName'), { target: { value: 'My own name' } })
  view.rerender(tree({ ...original, display_name: 'Another writer' }))
  expect((screen.getByLabelText('displayName') as HTMLInputElement).value).toBe('My own name')
  vi.mocked(request).mockResolvedValue({ display_name: 'My own name' })
  fireEvent.submit(screen.getByLabelText('displayName').closest('form')!)
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)).toEqual({
    display_name: 'My own name',
    expected_display_name: null,
  })
})
