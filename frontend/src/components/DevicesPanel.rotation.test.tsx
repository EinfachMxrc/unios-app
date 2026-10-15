// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { CalendarSubscriptionPanel } from './DevicesPanel'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api', () => ({
  localDate: (value: string) => value,
  request: mocks.request,
  useApi: () => ({ data: { url: 'https://example.invalid/old' }, loading: false, error: null }),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true, HostContext: { Provider: null } }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mocks.request.mockReset()
})

it('rotates the calendar link only after confirmation and displays the returned URL', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  mocks.request.mockResolvedValue({ url: 'https://example.invalid/new' })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarSubscriptionPanel />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'rotateCalendarLink' }))
  expect(mocks.request).not.toHaveBeenCalled()
  expect(screen.getByText('https://example.invalid/old')).toBeTruthy()
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'rotateCalendarLink' }))
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith('/api/session/ical-url/rotate', {
      method: 'POST',
      body: JSON.stringify({ confirmed: true }),
    }),
  )
  await screen.findByText('https://example.invalid/new')
  expect(screen.queryByText('https://example.invalid/old')).toBeNull()
})
