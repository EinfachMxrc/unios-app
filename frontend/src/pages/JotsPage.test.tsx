// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { queryClient } from '@/offlineCache'
import { keepNewNoteDraft, newNoteDraftFor } from '@/noteDraft'
import messages from '@/i18n/locales/de/jots'
import type { Jot, JotsResponse, NoteDetail } from '@/types'
import { JotsPage } from './JotsPage'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  listFailure: false,
  pending: [] as Jot[],
  taskCourse: null as number | null,
}))
vi.mock('@/api', () => ({ request: mocks.request, localDate: (date: string) => date }))
vi.mock('@/offlineCache', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
    mayCache: () => true,
  }
})
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/hooks/useJotOutbox', () => ({ useJotOutbox: () => ({ pending: mocks.pending }) }))
vi.mock('@/jotQueue', () => ({ flushJots: vi.fn() }))
vi.mock('@/components/JotCapture', () => ({ JotCapture: () => null }))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      (messages[key as keyof typeof messages] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(values[name]),
      ),
  }),
}))

const noteId = 'bbbbbbbb-0000-0000-0000-000000000002'
function jot(index: number): Jot {
  return {
    id: `aaaaaaaa-0000-0000-0000-${String(index).padStart(12, '0')}`,
    kind: 'thought',
    body: `Synthetischer Eintrag ${index}`,
    course_id: 3,
    note_id: noteId,
    task_id: null,
    created_at: '',
    updated_at: '',
  }
}
const items = Array.from({ length: 205 }, (_, index) => jot(index + 1))
function detail(body = 'Vorhandener Text'): NoteDetail {
  return {
    note: {
      id: noteId,
      course_id: 3,
      course_name: 'Kurs',
      title: 'Mitschrift',
      current_revision: 7,
      created_at: '',
      updated_at: '',
      resource_id: null,
    },
    selected_revision: 7,
    body,
    versions: [],
  }
}
function response(
  path: string,
): JotsResponse & { page: { total: number; offset: number; limit: number; has_more: boolean } } {
  const params = new URL(path, 'http://localhost').searchParams
  const offset = Number(params.get('offset'))
  const target = params.get('jot_id')
  const selected = target ? items.filter((item) => item.id === target) : items
  return {
    jots: selected
      .slice(offset, offset + 20)
      .map((item) =>
        mocks.taskCourse && item.id === items[0].id ? { ...item, task_id: 55, task_course_id: mocks.taskCourse } : item,
      ),
    courses: [
      {
        id: 3,
        source: 'fixture',
        source_id: '1',
        name: 'Kurs',
        short_name: '',
        semester_id: null,
        is_active: true,
        download_other_groups: false,
      },
    ],
    notes: [detail().note],
    page: { total: selected.length, offset, limit: 20, has_more: offset + 20 < selected.length },
  }
}
function Location() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  )
}
function open(route = '/jots') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <JotsPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
async function expandFirst() {
  await screen.findByText('Synthetischer Eintrag 1')
  fireEvent.click(screen.getAllByRole('button', { name: 'Zuordnung und Mitschrift' })[0])
}
beforeEach(() => {
  queryClient.clear()
  localStorage.clear()
  vi.clearAllMocks()
  mocks.listFailure = false
  mocks.pending = []
  mocks.taskCourse = null
  Element.prototype.scrollIntoView = vi.fn()
  mocks.request.mockImplementation((path: string, options?: RequestInit) => {
    if (path.startsWith('/api/jots?'))
      return mocks.listFailure ? Promise.reject(new Error('Synthetic refetch error')) : Promise.resolve(response(path))
    if (path === '/api/host') return Promise.resolve({ mode: 'host', generation: 12 })
    if (path.startsWith('/api/notes/'))
      return Promise.resolve(detail(options?.method === 'PUT' ? JSON.parse(options.body as string).body : undefined))
    return Promise.resolve(undefined)
  })
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.restoreAllMocks()
})

it('renders 20 saved entries at a time and reaches entries older than 200 with real server pagination', async () => {
  open()
  await screen.findByText('Synthetischer Eintrag 1')
  expect(document.querySelectorAll('.jot-row')).toHaveLength(20)
  expect(screen.getByText('Seite 1 von 11 · 205 Einträge')).toBeTruthy()
  for (let page = 1; page <= 10; page++) {
    fireEvent.click(screen.getByRole('button', { name: 'Ältere Einträge' }))
    await screen.findByText(`Synthetischer Eintrag ${page * 20 + 1}`)
  }
  expect(document.querySelectorAll('.jot-row')).toHaveLength(5)
  expect(screen.getByTestId('location').textContent).toBe('/jots?offset=200')
  expect((screen.getByRole('button', { name: 'Ältere Einträge' }) as HTMLButtonElement).disabled).toBe(true)
})

it.each([false, true])(
  'resolves and focuses an exact old UUID target, uppercase=%s, beyond the first 200',
  async (uppercase) => {
    open(`/jots#jot-${uppercase ? items[204].id.toUpperCase() : items[204].id}`)
    await screen.findByText('Synthetischer Eintrag 205')
    expect(document.querySelectorAll('.jot-row')).toHaveLength(1)
    expect(document.activeElement).toBe(document.getElementById(`jot-${items[204].id}`))
    expect(mocks.request.mock.calls[0][0]).toContain(`jot_id=${items[204].id}`)
    fireEvent.click(screen.getByRole('link', { name: 'Alle Schnellnotizen anzeigen' }))
    await screen.findByText('Synthetischer Eintrag 1')
    expect(document.querySelectorAll('.jot-row')).toHaveLength(20)
  },
)

it('assignment details are collapsed by default and metadata assignment does not copy note text', async () => {
  open()
  await screen.findByText('Synthetischer Eintrag 1')
  expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  await expandFirst()
  expect(screen.getByText(/Der Text der Mitschrift bleibt dabei unverändert/)).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Notiz für Synthetischer Eintrag 1' }), {
    target: { value: '' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Zuordnen' }))
  await waitFor(() => expect(mocks.request.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(true))
  expect(mocks.request.mock.calls.find((call) => call[1]?.method === 'PATCH')).toEqual([
    `/api/jots/${items[0].id}/assignment`,
    { method: 'PATCH', body: JSON.stringify({ course_id: 3, note_id: null }) },
  ])
  expect(mocks.request.mock.calls.some((call) => call[1]?.method === 'PUT')).toBe(false)
})

it('explicit copy appends note text with revision and lease guards while leaving the original jot visible', async () => {
  open()
  await expandFirst()
  fireEvent.click(screen.getByRole('button', { name: 'In Mitschrift übernehmen' }))
  await screen.findByText('Text in der Mitschrift ergänzt.')
  const write = mocks.request.mock.calls.find((call) => call[1]?.method === 'PUT')!
  expect(write[0]).toBe(`/api/notes/${noteId}`)
  expect(write[1].headers).toEqual({ 'X-UniOS-Lease-Generation': '12' })
  expect(JSON.parse(write[1].body)).toEqual({
    title: 'Mitschrift',
    expected_revision: 7,
    body: `Vorhandener Text\n\n${items[0].body}\n\n[Ursprüngliche Schnellnotiz](/jots#jot-${items[0].id})`,
  })
  expect(screen.getByText('Synthetischer Eintrag 1')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Mitschrift öffnen' }).getAttribute('href')).toBe(`/notes?id=${noteId}`)
  expect(mocks.request.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false)
})

it('opens the existing smart-capture task in its real course after the jot was assigned elsewhere', async () => {
  mocks.taskCourse = 9
  open()
  await screen.findByText('Synthetischer Eintrag 1')
  expect(screen.getByRole('link', { name: 'Aufgabe im Kurs öffnen' }).getAttribute('href')).toBe(
    '/courses/9#assignment-55',
  )
})

it('prepares a new-note form using the existing device draft and navigates only after persistence', async () => {
  keepNewNoteDraft(3, null, 'Vorheriger Titel', 'Vorheriger Entwurf')
  open()
  await expandFirst()
  fireEvent.click(screen.getByRole('button', { name: 'Neue Mitschrift mit diesem Eintrag' }))
  expect(screen.getByTestId('location').textContent).toBe('/notes?new=1&course_id=3')
  expect(newNoteDraftFor(3, null)?.title).toBe('Vorheriger Titel')
  expect(newNoteDraftFor(3, null)?.body).toContain('Vorheriger Entwurf\n\nSynthetischer Eintrag 1')
  expect(mocks.request.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false)
})

it('keeps cached rows and selected assignment fields visible alongside a failed refetch', async () => {
  open()
  await expandFirst()
  fireEvent.change(screen.getByRole('combobox', { name: 'Notiz für Synthetischer Eintrag 1' }), {
    target: { value: '' },
  })
  mocks.listFailure = true
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['api', '/api/jots'] })
  })
  await screen.findByText('Synthetic refetch error')
  expect(screen.getByText('Synthetischer Eintrag 1')).toBeTruthy()
  expect((screen.getByRole('combobox', { name: 'Notiz für Synthetischer Eintrag 1' }) as HTMLSelectElement).value).toBe(
    '',
  )
  expect(document.querySelectorAll('.jot-row')).toHaveLength(20)
})

it('keeps the offline outbox intact while rendering at most 20 pending entries per page', async () => {
  mocks.pending = Array.from({ length: 45 }, (_, index) => ({ ...jot(index + 500), body: `Pending ${index}` }))
  open()
  await screen.findByText('Synthetischer Eintrag 1')
  expect(screen.queryByText('Pending 20')).toBeNull()
  expect(mocks.pending).toHaveLength(45)
  fireEvent.click(screen.getAllByRole('button', { name: 'Ältere Einträge' })[0])
  expect(screen.getByText('Pending 20')).toBeTruthy()
  expect(screen.queryByText('Pending 0')).toBeNull()
  expect(mocks.pending).toHaveLength(45)
})
