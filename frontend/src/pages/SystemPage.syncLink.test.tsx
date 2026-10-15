// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SystemPage } from './SystemPage'
import { ActivityPage } from './ActivityPage'

const mocks = vi.hoisted(() => ({ error: null as string | null, preferenceWrites: vi.fn(), scroll: vi.fn() }))
vi.mock('@/api', () => ({
  request: vi.fn(),
  localDate: (value: string) => value,
  useApi: (path: string) => ({
    data:
      path === '/api/system'
        ? {
            moodle_configured: false,
            runs: [
              {
                id: 7,
                status: 'error',
                started_at: '2026-10-09T12:00:00Z',
                course_count: 2,
                resource_count: 5,
                change_count: 1,
                error: 'Synthetic sync detail',
              },
            ],
          }
        : path.startsWith('/api/activity?')
          ? {
              courses: [],
              changes: [
                {
                  id: 'synthetic-sync',
                  kind: 'sync',
                  sync_run_id: 7,
                  summary: 'Synthetic activity sync',
                  created_at: '2026-10-09T12:00:00Z',
                },
              ],
            }
          : { moodle_available: false, portals: [] },
    error: path === '/api/system' ? mocks.error : null,
    loading: false,
  }),
}))
vi.mock('@/preferences', () => ({
  usePreferences: () => ({ advanced: false }),
  updatePreferences: mocks.preferenceWrites,
}))
vi.mock('@/hooks/useApiMutation', () => ({
  useApiMutation: () => ({ pending: false, error: null, data: null, mutate: vi.fn() }),
}))
vi.mock('@/hooks/host', async () => {
  const { createContext } = await import('react')
  return { HostContext: createContext(null), useWritableHost: () => true }
})
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/LocalActions', () => ({ LocalActions: () => null }))
vi.mock('@/hooks/useSeenMaterials', () => ({ markMaterialsSeen: vi.fn() }))
vi.mock('@/components/CapabilitiesPanel', () => ({ CapabilitiesPanel: () => null }))
vi.mock('@/components/ConnectorCatalog', () => ({ ConnectorCatalog: () => null }))
vi.mock('@/components/DevicesPanel', () => ({ CalendarSubscriptionPanel: () => null, DevicesPanel: () => null }))
vi.mock('@/components/HostHandoff', () => ({ HostHandoff: () => null }))
vi.mock('@/components/ConflictReview', () => ({ ConflictReview: () => null }))
vi.mock('@/components/MoodleRefresh', () => ({ MoodleRefresh: () => null }))
vi.mock('@/components/ReleaseSafetyPanel', () => ({ ReleaseSafetyPanel: () => null }))
vi.mock('@/components/DesktopReleaseUpdates', () => ({ DesktopReleaseUpdates: () => null }))
vi.mock('@/components/ReleaseHealthPanel', () => ({ ReleaseHealthPanel: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.error = null
  Element.prototype.scrollIntoView = mocks.scroll
})
afterEach(() => cleanup())
function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SystemPage />
    </MemoryRouter>,
  )
}

it('opens the exact linked sync in normal mode and focuses its anchor without changing preferences', () => {
  open('/system#sync-7')
  expect(screen.getByText('Synthetic sync detail')).toBeTruthy()
  const target = document.getElementById('sync-7')!
  expect(target.classList.contains('is-target')).toBe(true)
  expect(document.activeElement).toBe(target)
  expect(mocks.scroll).toHaveBeenCalledWith({ block: 'center' })
  expect(mocks.preferenceWrites).not.toHaveBeenCalled()
  expect(screen.queryByText('handoffTitle')).toBeNull()
})

it('follows a real activity link to its details while advanced mode remains disabled', () => {
  render(
    <MemoryRouter initialEntries={['/activity']}>
      <Routes>
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/system" element={<SystemPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const link = screen.getByRole('link', { name: 'Synthetic activity sync' })
  expect(link.getAttribute('href')).toBe('/system#sync-7')
  fireEvent.click(link)
  expect(screen.getByText('Synthetic sync detail')).toBeTruthy()
  expect(mocks.preferenceWrites).not.toHaveBeenCalled()
})

it('keeps the regular normal system page compact when it has no sync link', () => {
  open('/system')
  expect(screen.queryByText('syncHistoryTitle')).toBeNull()
  expect(screen.queryByText('Synthetic sync detail')).toBeNull()
  expect(screen.getByText('thisDeviceTitle')).toBeTruthy()
  expect(mocks.preferenceWrites).not.toHaveBeenCalled()
})

it('describes an unavailable linked historical run instead of hiding or inventing its details', () => {
  open('/system#sync-999')
  expect(screen.getByText('syncRunUnavailableTitle')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'openSyncActivity' }).getAttribute('href')).toBe('/activity?kind=sync')
  expect(screen.queryByText('Synthetic sync detail')).toBeNull()
  expect(mocks.preferenceWrites).not.toHaveBeenCalled()
})

it('shows refetch failure with the cached linked detail and its known anchor', () => {
  mocks.error = 'Synthetic refetch error'
  open('/system#sync-7')
  expect(screen.getByText('reloadHint')).toBeTruthy()
  expect(screen.getByText('Synthetic sync detail')).toBeTruthy()
})
