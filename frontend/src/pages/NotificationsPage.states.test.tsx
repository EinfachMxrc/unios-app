// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NotificationCenter } from '@/hooks/useNotifications'
import { NotificationsPage } from './NotificationsPage'

const mocks = vi.hoisted(() => ({
  data: null as NotificationCenter | null,
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
}))
vi.mock('@/api', () => ({ request: vi.fn(), localDate: (value: string) => value }))
vi.mock('@/offlineCache', () => ({ queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() } }))
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: mocks.data, loading: mocks.loading, error: mocks.error, reload: mocks.reload }),
  setNotificationRead: vi.fn(),
  markAllNotificationsSeen: vi.fn(),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

const center: NotificationCenter = {
  unread: 0,
  muted_scopes: [],
  courses: [],
  latest_id: 1,
  items: [
    {
      id: 1,
      title: 'Synthetic read event',
      body: 'Synthetic body',
      course_id: null,
      kind: 'new',
      created_at: '2026-10-09T12:00:00Z',
      read_at: '2026-10-09T13:00:00Z',
      muted: false,
      url: '/activity',
    },
  ],
}
function open() {
  render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.data = null
  mocks.loading = false
  mocks.error = null
})
afterEach(() => cleanup())

it('shows initial loading instead of implying there are no notifications', () => {
  mocks.loading = true
  open()
  expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy()
  expect(screen.queryByText('noNotifications')).toBeNull()
  expect((screen.getByLabelText('muteAll') as HTMLInputElement).disabled).toBe(true)
})

it('shows a load failure and retry without a false empty state when no data is available', () => {
  mocks.error = 'Synthetic load failure'
  open()
  expect(screen.getByText('Synthetic load failure')).toBeTruthy()
  expect(screen.queryByText('noNotifications')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  expect(mocks.reload).toHaveBeenCalledTimes(1)
})

it('distinguishes a truly empty center from a filtered empty view with a route back to its items', () => {
  mocks.data = { ...center, items: [] }
  const view = render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('noNotifications')).toBeTruthy()
  expect(screen.queryByText('noUnreadNotifications')).toBeNull()
  view.unmount()
  mocks.data = center
  open()
  expect(screen.getByText('noUnreadNotifications')).toBeTruthy()
  expect(screen.queryByText('noNotifications')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'showAllNotifications' }))
  expect(screen.getByRole('link', { name: 'Synthetic read event' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('notificationFilter'), { target: { value: 'muted' } })
  expect(screen.getByText('noMutedNotifications')).toBeTruthy()
})

it('keeps a failed refetch visible alongside cached items, filtered emptiness and true emptiness', () => {
  mocks.data = center
  mocks.error = 'Synthetic refetch failure'
  const view = render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('Synthetic refetch failure')).toBeTruthy()
  expect(screen.getByText('noUnreadNotifications')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'showAllNotifications' }))
  expect(screen.getByRole('link', { name: 'Synthetic read event' })).toBeTruthy()
  expect(screen.getByText('Synthetic refetch failure')).toBeTruthy()
  view.unmount()
  mocks.data = { ...center, items: [] }
  open()
  expect(screen.getByText('Synthetic refetch failure')).toBeTruthy()
  expect(screen.getByText('noNotifications')).toBeTruthy()
})
