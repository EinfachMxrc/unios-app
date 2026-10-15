// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { queryClient } from '@/offlineCache'
import { MailPage } from './MailPage'
import { ProjectPage, ProjectsPage } from './ProjectsPage'

const fixtures = vi.hoisted(() => ({
  project: {
    id: 24,
    name: 'Erfundenes Projekt',
    course_id: 2,
    course_name: 'Erfundener Kurs',
    deadline_at: '2026-10-25T01:30:45Z' as string | null,
    notes: '',
    members: [],
    links: [],
    todos: [],
    assignment_ids: [],
    assignments: [],
    github_repo: null,
    revision: 1,
    archived_at: null,
    created_at: '2026-10-09T10:00:00Z',
    updated_at: '2026-10-09T10:00:00Z',
  },
}))

vi.mock('@/api', () => ({
  ApiError: class extends Error {},
  localDate: (value: string) => value,
  request: vi.fn(),
  useApi: (path: string) => ({
    data:
      path === '/api/mail'
        ? [
            {
              id: 3,
              subject: 'Erfundene Mailfrist',
              sender: 'test@example.invalid',
              received_at: null,
              candidate_date: '2026-10-26',
              status: 'proposed',
              deadline_id: null,
              imported_at: '2026-10-09T10:00:00Z',
            },
          ]
        : path === '/api/projects/24'
          ? fixtures.project
          : path === '/api/projects'
            ? []
            : path === '/api/courses?all_semesters=true'
              ? { courses: [{ id: 2, name: 'Erfundener Kurs' }] }
              : path === '/api/courses/2'
                ? { assignments: [] }
                : undefined,
    error: null,
    loading: false,
    updatedAt: null,
    reload: vi.fn(),
  }),
}))
vi.mock('@/offlineCache', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }
})
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values?: { zone?: string }) => (values?.zone ? `${key}: ${values.zone}` : key),
  }),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/State', () => ({
  Panel: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Empty: () => null,
  Loading: () => null,
  Failure: ({ message }: { message: string }) => <p role="alert">{message}</p>,
  ListRows: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))
vi.mock('@/components/EntityProperties', () => ({ EntityProperties: () => null }))
vi.mock('@/components/SubmissionCheck', () => ({ SubmissionCheck: () => null }))
vi.mock('@/components/MailConnection', () => ({ MailConnection: () => null }))
vi.mock('@/components/MailImportConnection', () => ({ MailImportConnection: () => null }))
vi.mock('@/components/MailForwardingConnection', () => ({
  MailForwardingConnection: () => null,
  useMailForwarding: () => ({ data: undefined, error: null, reload: vi.fn() }),
}))

beforeEach(() => {
  fixtures.project.deadline_at = '2026-10-25T01:30:45Z'
  vi.mocked(request)
    .mockReset()
    .mockResolvedValue({ ...fixtures.project, revision: 2 })
})
afterEach(() => {
  cleanup()
  queryClient.clear()
})

function openProject(edit = false) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[edit ? '/projects/24' : '/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: edit ? 'editButton' : 'newProjectButton' }))
  if (!edit) {
    fireEvent.change(screen.getByLabelText('nameLabel'), { target: { value: 'Erfundene Projektfrist' } })
    fireEvent.change(screen.getByLabelText('courseLabel'), { target: { value: '2' } })
  }
}
function openMail() {
  render(
    <MemoryRouter>
      <MailPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'checkDateButton' }))
}
async function sentPayload() {
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  return JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)
}

// Actual browser-zone coverage uses Playwright timezoneId in
// e2e/deadline-campus-time.spec.ts. Mutating TZ at runtime does not change
// Windows Node worker-thread Date instances reliably and proves no UI behavior.
describe('campus deadline input and DST validation', () => {
  it('keeps typed project wall time and sends the same Berlin instant', async () => {
    openProject()
    const field = screen.getByLabelText('deadlineLabel') as HTMLInputElement
    fireEvent.change(field, { target: { value: '2026-10-26T09:15' } })
    expect(field.value).toBe('2026-10-26T09:15')
    expect(screen.getByText('campusTimeHint: Europe/Berlin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'createButton' }))
    expect((await sentPayload()).deadline_at).toBe('2026-10-26T08:15:00.000Z')
  })

  it('preserves an existing second autumn occurrence including untouched seconds', async () => {
    openProject(true)
    expect((screen.getByLabelText('deadlineLabel') as HTMLInputElement).value).toBe('2026-10-25T02:30')
    fireEvent.change(screen.getByLabelText('nameLabel'), { target: { value: 'Umbenannter Entwurf' } })
    fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
    const payload = await sentPayload()
    expect(payload.deadline_at).toBe('2026-10-25T01:30:45Z')
    expect(payload.expected_revision).toBe(1)
  })

  it('keeps the stored autumn offset when changing minutes in the repeated hour', async () => {
    openProject(true)
    fireEvent.change(screen.getByLabelText('deadlineLabel'), { target: { value: '2026-10-25T02:35' } })
    fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
    expect((await sentPayload()).deadline_at).toBe('2026-10-25T01:35:00.000Z')
  })

  it('rejects a project spring gap without posting or normalizing the draft', async () => {
    openProject()
    const field = screen.getByLabelText('deadlineLabel') as HTMLInputElement
    fireEvent.change(field, { target: { value: '2026-03-29T02:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'createButton' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('invalidCampusDateTime'))
    expect(field.value).toBe('2026-03-29T02:30')
    expect(request).not.toHaveBeenCalled()
  })

  it('clears an optional project deadline explicitly', async () => {
    openProject(true)
    fireEvent.change(screen.getByLabelText('deadlineLabel'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
    expect((await sentPayload()).deadline_at).toBeNull()
  })

  it('requires the mail wall time explicitly and sends campus UTC', async () => {
    openMail()
    const field = screen.getByLabelText('dateTimeLabel') as HTMLInputElement
    expect(field.value).toBe('')
    expect((screen.getByRole('button', { name: 'confirmDeadlineButton' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field, { target: { value: '2026-10-26T09:15' } })
    expect(field.value).toBe('2026-10-26T09:15')
    expect(screen.getByText('campusTimeHint: Europe/Berlin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'confirmDeadlineButton' }))
    expect((await sentPayload()).due_at).toBe('2026-10-26T08:15:00.000Z')
  })

  it('rejects a mail spring gap and preserves its correction field', () => {
    openMail()
    const field = screen.getByLabelText('dateTimeLabel') as HTMLInputElement
    fireEvent.change(field, { target: { value: '2026-03-29T02:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'confirmDeadlineButton' }))
    expect(screen.getByRole('alert').textContent).toBe('invalidCampusDateTime')
    expect(field.value).toBe('2026-03-29T02:30')
    expect(request).not.toHaveBeenCalled()
  })

  it('uses the deterministic first autumn occurrence for a new mail deadline', async () => {
    openMail()
    fireEvent.change(screen.getByLabelText('dateTimeLabel'), { target: { value: '2026-10-25T02:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'confirmDeadlineButton' }))
    expect((await sentPayload()).due_at).toBe('2026-10-25T00:30:00.000Z')
  })
})
