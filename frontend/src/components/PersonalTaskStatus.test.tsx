// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { queryClient } from '@/offlineCache'
import { markHostReachable, markHostVerified } from '@/hostAvailability'
import { setRuntimeVerified } from '@/lib/runtimeAccess'
import type { TaskMetadata } from '@/lib/taskWorkflow'
import { PersonalTaskStatus } from './PersonalTaskStatus'
import '@/i18n'

vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
const path = '/api/metadata/assignment/7'
let metadata: TaskMetadata
let writes: Record<string, unknown>[]
beforeEach(() => {
  queryClient.clear()
  markHostReachable(true)
  markHostVerified(1)
  setRuntimeVerified(true)
  metadata = {
    object_type: 'assignment',
    object_id: '7',
    revision: 0,
    tags: ['math'],
    priority: 'high',
    exam_relevant: false,
    difficulty: 'hard',
    workflow_status: 'open',
  }
  writes = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === path && options?.method === 'PUT') {
        const payload = JSON.parse(options.body as string) as Record<string, unknown>
        writes.push(payload)
        if (payload.expected_revision !== metadata.revision)
          return Response.json({ detail: 'Eigenschaften wurden inzwischen geändert' }, { status: 409 })
        metadata = { ...metadata, ...payload, revision: metadata.revision + 1 } as TaskMetadata
      }
      return Response.json(metadata)
    }),
  )
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  setRuntimeVerified(false)
  vi.unstubAllGlobals()
})
function show(removed = false) {
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonalTaskStatus kind="assignment" id={7} removed={removed} />
    </QueryClientProvider>,
  )
}

it('changes and reverses the personal status without clearing other properties', async () => {
  show()
  await waitFor(() => expect(screen.getByRole('button', { name: 'In Arbeit' }).hasAttribute('disabled')).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'In Arbeit' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy())
  expect(metadata).toMatchObject({
    tags: ['math'],
    priority: 'high',
    exam_relevant: false,
    difficulty: 'hard',
    workflow_status: 'working',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  await waitFor(() => expect(metadata.workflow_status).toBe('open'))
  expect(writes.map((value) => value.expected_revision)).toEqual([0, 1])
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull())
})

it('refuses stale Undo and refreshes the new status and tags after a revision conflict', async () => {
  show()
  await waitFor(() => expect(screen.getByRole('button', { name: 'In Arbeit' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'In Arbeit' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy())
  metadata = { ...metadata, revision: 2, tags: ['external-confirmed'], workflow_status: 'done' }
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('inzwischen geändert'))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Erledigt' }).getAttribute('aria-pressed')).toBe('true'),
  )
  expect(metadata).toMatchObject({ tags: ['external-confirmed'], workflow_status: 'done', revision: 2 })
  expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull()
  expect(screen.queryByText('Änderung zurückgenommen')).toBeNull()
})

it('expires Undo immediately when another view publishes a newer confirmed revision', async () => {
  show()
  await waitFor(() => expect(screen.getByRole('button', { name: 'In Arbeit' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'In Arbeit' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy())
  await act(async () => {
    queryClient.setQueryData(['api', path], { ...metadata, revision: 2, tags: ['new'] })
  })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull())
})

it('shows a removed item without allowing a personal write', async () => {
  show(true)
  await waitFor(() => expect(screen.getByRole('button', { name: 'In Arbeit' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'In Arbeit' }).hasAttribute('disabled')).toBe(true)
  expect(writes).toEqual([])
})
