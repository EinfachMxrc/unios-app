// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { DeadlinesPage } from './DeadlinesPage'

const fixtures = vi.hoisted(() => ({ queries: new Map<string, { data?: unknown; loading?: boolean; refreshing?: boolean; error?: string; refreshError?: string; reload?: () => void }>() }))
vi.mock('@/api', () => ({
  activeIntlLocale: () => 'de-DE', localDate: (value: string) => value, request: vi.fn(),
  useApi: (path: string) => ({ loading: false, error: null, updatedAt: null, reload: vi.fn(), ...fixtures.queries.get(path) }),
}))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/State', () => ({
  Panel: ({ title, children }: { title: string; children: ReactNode }) => <section aria-label={title}>{children}</section>,
  Empty: ({ title }: { title: string }) => <p>{title}</p>, Loading: () => <p role="status">loading</p>,
  Failure: ({ message, retry }: { message: string; retry?: () => void }) => <div role="alert">{message}<button onClick={retry}>Retry {message}</button></div>,
  ListRows: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/TimetablePanel', () => ({ TimetablePanel: () => <section aria-label="Fixture timetable">Fixture timetable</section> }))
vi.mock('@/components/DeadlineProposalsPanel', () => ({ DeadlineProposalsPanel: () => <p>Fixture proposals</p> }))
vi.mock('@/components/AssignmentDeadline', () => ({ AssignmentDeadline: () => null }))
vi.mock('@/components/DeadlineViews', () => ({ DeadlineViews: () => {
  const [value, setValue] = useState('')
  return <label>Fixture draft<input value={value} onChange={event => setValue(event.target.value)} /></label>
} }))
vi.mock('@/components/TaskPeekDrawer', () => ({ TaskPeekDrawer: ({ target }: { target: { kind: string; id: number } }) => <div role="dialog">{target.kind}:{target.id}</div> }))

const sources = ['/api/primuss/status', '/api/public-periods', '/api/mycampus/status']
const deadline = { id: 5, title: 'Fixture deadline', due_at: '2099-10-08T08:00:00Z', assignment_id: 12, course_id: 2, url: null }
function view(path = '/deadlines') { return render(<MemoryRouter initialEntries={[path]}><DeadlinesPage /></MemoryRouter>) }

beforeEach(() => {
  clearWorkspace()
  fixtures.queries.clear()
  fixtures.queries.set('/api/deadlines', { data: { deadlines: [deadline], courses: { '2': 'Fixture course' }, events: [] } })
})
afterEach(cleanup)

describe('deadline navigation and independent source states', () => {
  it('does not mistake source loading for missing setup and leaves valid deadlines available', () => {
    sources.forEach(path => fixtures.queries.set(path, { loading: true }))
    view()
    expect(screen.getAllByText('sourceLoading')).toHaveLength(3)
    expect(screen.queryByText('enrollmentNotSetUp')).toBeNull()
    expect(screen.queryByText('publicPeriodsNotSetUp')).toBeNull()
    expect(screen.queryByText('campusNotSetUp')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Fixture deadline/ }))
    expect(screen.getByRole('dialog').textContent).toBe('assignment:12')
  })
  it('shows source-specific failures and retries even with stale configuration and valid deadline data', () => {
    const retry = vi.fn()
    fixtures.queries.set('/api/primuss/status', { data: { enrollment_available: false }, refreshError: 'Portal offline', reload: retry })
    fixtures.queries.set('/api/public-periods', { error: 'Public offline' })
    view()
    expect(screen.queryByText('enrollmentNotSetUp')).toBeNull()
    expect(screen.queryByText('publicPeriodsNotSetUp')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry Portal offline' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /Fixture deadline/ })).toBeTruthy()
  })
  it('offers setup only after successful source responses prove it is missing', () => {
    fixtures.queries.set('/api/primuss/status', { data: { enrollment_available: false, session_available: false } })
    fixtures.queries.set('/api/public-periods', { data: { configured: false, periods: [] } })
    view()
    expect(screen.getByText('enrollmentNotSetUp')).toBeTruthy()
    expect(screen.getByText('publicPeriodsNotSetUp')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'setupPrimuss' }).getAttribute('href')).toBe('/setup')
    expect(screen.getByRole('link', { name: 'setupUniversity' }).getAttribute('href')).toBe('/setup')
  })
  it('keeps drafts mounted across the view switch and remembers the view during navigation', () => {
    const first = view()
    const switcher = within(screen.getByRole('group', { name: 'pageViewLabel' }))
    fireEvent.click(switcher.getByRole('button', { name: 'pageAssignments' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Fixture draft' }), { target: { value: 'Newer draft' } })
    fireEvent.click(switcher.getByRole('button', { name: 'pageCalendar' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(switcher.getByRole('button', { name: 'pageAssignments' }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Newer draft')
    first.unmount()
    view()
    expect(screen.getByRole('button', { name: 'pageAssignments' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('honours the timetable deep link while allowing a later intentional switch', () => {
    const first = view()
    fireEvent.click(screen.getByRole('button', { name: 'pageAssignments' }))
    first.unmount()
    view('/deadlines#timetable')
    expect(screen.getByRole('region', { name: 'Fixture timetable' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'pageAssignments' }))
    expect(screen.getByRole('textbox', { name: 'Fixture draft' })).toBeTruthy()
  })
  it('retains cached deadlines after a main query error and exposes a precise main retry', () => {
    const retry = vi.fn()
    fixtures.queries.set('/api/deadlines', { ...fixtures.queries.get('/api/deadlines'), refreshError: 'Deadline refresh failed', reload: retry })
    view()
    expect(screen.getByRole('button', { name: /Fixture deadline/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry Deadline refresh failed' }))
    expect(retry).toHaveBeenCalledOnce()
  })
  it('shows cached source revalidation separately from a confirmed missing setup', () => {
    fixtures.queries.set('/api/primuss/status', { data: { enrollment_available: false }, refreshing: true })
    view()
    expect(screen.getByText('sourceLoading')).toBeTruthy()
    expect(screen.queryByText('enrollmentNotSetUp')).toBeNull()
  })
})
