// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ActivityPage } from './ActivityPage'

vi.mock('@/api', () => ({
  localDate: (value: string) => value,
  useApi: () => ({
    loading: false,
    updatedAt: 0,
    data: {
      courses: [],
      changes: [{ id: 1, kind: 'new', summary: 'Fiktive neue Datei', created_at: '2026-10-14', course_id: 1 }],
    },
  }),
}))
vi.mock('@/components/LocalActions', () => ({
  LocalActions: () => <section aria-label="Local edits">Local edits</section>,
}))
vi.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/useSeenMaterials', () => ({ markMaterialsSeen: vi.fn() }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

function LocationState() {
  const location = useLocation()
  return <output>{JSON.stringify(location.state)}</output>
}

it('shows events before local edits and marks filter changes as preserving the view', () => {
  render(
    <MemoryRouter>
      <ActivityPage />
      <LocationState />
    </MemoryRouter>,
  )
  const events = screen.getByText('Fiktive neue Datei')
  const local = screen.getByRole('region', { name: 'Local edits' })
  expect(events.compareDocumentPosition(local) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'filterEventAria' }), { target: { value: 'new' } })
  expect(screen.getByRole('status').textContent).toContain('"activityFilterSync":true')
})

it('restores explicit filters after remount and keeps clearing them durable', () => {
  const view = render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByRole('combobox', { name: 'filterEventAria' }), { target: { value: 'content' } })
  view.unmount()
  const restored = render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
  expect((screen.getByRole('combobox', { name: 'filterEventAria' }) as HTMLSelectElement).value).toBe('content')
  fireEvent.change(screen.getByRole('combobox', { name: 'filterEventAria' }), { target: { value: '' } })
  restored.unmount()
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
  expect((screen.getByRole('combobox', { name: 'filterEventAria' }) as HTMLSelectElement).value).toBe('')
})

it('gives an explicit linked filter precedence over the saved choice', () => {
  localStorage.setItem('unios-activity-preferences-v1', 'kind=content')
  render(
    <MemoryRouter initialEntries={['/activity?kind=sync']}>
      <ActivityPage />
    </MemoryRouter>,
  )
  expect((screen.getByRole('combobox', { name: 'filterEventAria' }) as HTMLSelectElement).value).toBe('sync')
})
