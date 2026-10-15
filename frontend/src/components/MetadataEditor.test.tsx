// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { queryClient } from '@/offlineCache'
import { markHostReachable, markHostVerified } from '@/hostAvailability'
import { setRuntimeVerified } from '@/lib/runtimeAccess'
import type { TaskMetadata } from '@/lib/taskWorkflow'
import { MetadataEditor } from './MetadataEditor'
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
      if (url === '/api/metadata/tags') return Response.json(['math'])
      if (url === path && options?.method === 'PUT') {
        const payload = JSON.parse(options.body as string) as Record<string, unknown>
        writes.push(payload)
        if (payload.expected_revision !== metadata.revision)
          return Response.json({ detail: 'Eigenschaften wurden inzwischen geändert' }, { status: 409 })
        metadata = {
          ...metadata,
          ...payload,
          revision: metadata.revision + 1,
          tags: (payload.tags as string[]).map((tag) => tag.replace(/^#/, '')),
        } as TaskMetadata
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
async function show(withStatus = false) {
  render(
    <QueryClientProvider client={queryClient}>
      {withStatus && <PersonalTaskStatus kind="assignment" id={7} />}
      <MetadataEditor kind="assignment" id="7" />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByText('Tags & Eigenschaften'))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Tags, mit Komma getrennt' })).toBeTruthy())
}

it('retains a dirty metadata draft during a personal status change and requires explicit resolution', async () => {
  await show(true)
  const tags = screen.getByRole('combobox', { name: 'Tags, mit Komma getrennt' }) as HTMLInputElement
  fireEvent.change(tags, { target: { value: '#my-draft' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Priorität' }), { target: { value: 'low' } })
  fireEvent.click(screen.getByRole('button', { name: 'In Arbeit' }))
  await waitFor(() =>
    expect(
      screen.getByText('Die Eigenschaften wurden inzwischen geändert. Dein Entwurf bleibt hier erhalten.'),
    ).toBeTruthy(),
  )
  expect(tags.value).toBe('#my-draft')
  expect((screen.getByRole('combobox', { name: 'Priorität' }) as HTMLSelectElement).value).toBe('low')
  expect(screen.getByRole('button', { name: 'Eigenschaften speichern' }).hasAttribute('disabled')).toBe(true)
  expect(metadata).toMatchObject({ tags: ['math'], priority: 'high', workflow_status: 'working', revision: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen und neu laden' }))
  await waitFor(() => expect(tags.value).toBe('#math'))
  expect((screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement).value).toBe('working')
  fireEvent.change(tags, { target: { value: '#chosen-after-reload' } })
  fireEvent.click(screen.getByRole('button', { name: 'Eigenschaften speichern' }))
  await waitFor(() => expect(metadata.tags).toEqual(['chosen-after-reload']))
  expect(writes.map((value) => value.expected_revision)).toEqual([0, 1])
  expect(metadata.workflow_status).toBe('working')
})

it('hydrates an untouched editor from the new confirmed revision', async () => {
  await show()
  await act(async () => {
    metadata = { ...metadata, revision: 1, tags: ['external'], workflow_status: 'done' }
    queryClient.setQueryData(['api', path], metadata)
  })
  await waitFor(() =>
    expect((screen.getByRole('combobox', { name: 'Tags, mit Komma getrennt' }) as HTMLInputElement).value).toBe(
      '#external',
    ),
  )
  expect((screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement).value).toBe('done')
  expect(
    screen.queryByText('Die Eigenschaften wurden inzwischen geändert. Dein Entwurf bleibt hier erhalten.'),
  ).toBeNull()
  expect(writes).toEqual([])
})

it('uses the draft baseline for CAS, keeps the failed draft and clears the error only on explicit reload', async () => {
  await show()
  const tags = screen.getByRole('combobox', { name: 'Tags, mit Komma getrennt' }) as HTMLInputElement
  fireEvent.change(tags, { target: { value: '#unsaved' } })
  metadata = { ...metadata, revision: 1, tags: ['external-confirmed'], workflow_status: 'done' }
  fireEvent.click(screen.getByRole('button', { name: 'Eigenschaften speichern' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('inzwischen geändert'))
  await waitFor(() =>
    expect(
      screen.getByText('Die Eigenschaften wurden inzwischen geändert. Dein Entwurf bleibt hier erhalten.'),
    ).toBeTruthy(),
  )
  expect(tags.value).toBe('#unsaved')
  expect(writes[0].expected_revision).toBe(0)
  expect(metadata.tags).toEqual(['external-confirmed'])
  fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen und neu laden' }))
  await waitFor(() => expect(tags.value).toBe('#external-confirmed'))
  expect(screen.queryByRole('alert')).toBeNull()
  expect((screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement).value).toBe('done')
})
