// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationCenter } from '@/hooks/useNotifications'
import { NotificationPopover } from './NotificationPopover'

const state = vi.hoisted(() => ({ language: 'de', data: undefined as NotificationCenter | undefined }))
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: state.data, loading: false, error: null }),
  markAllNotificationsSeen: vi.fn(), setNotificationRead: vi.fn(),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/api', () => ({ localDate: vi.fn() }))
vi.mock('@/i18n/useT', async () => {
  const { default: de } = await import('@/i18n/locales/de/activity')
  const { default: en } = await import('@/i18n/locales/en/activity')
  return { useT: () => ({
    t: (key: string, values: Record<string, unknown> = {}) => {
      const strings = state.language === 'de' ? de : en
      const value = strings[key as keyof typeof strings]
      return (typeof value === 'string' ? value : key)
        .replace(/{{(\w+)}}/g, (_match, name: string) => String(values[name] ?? ''))
    },
  }) }
})

afterEach(cleanup)

describe.each([
  ['de', 'Benachrichtigungen', 'ungelesen', 'ungelesene Benachrichtigungen'],
  ['en', 'Notifications', 'unread', 'unread notifications'],
])('notification trigger accessibility in %s', (language, label, unread, tooltip) => {
  it.each([0, 2, 102])('includes the visible badge in its name for count %s', count => {
    state.language = language
    state.data = { unread: count, muted_scopes: [], courses: [], items: [] }
    render(<MemoryRouter><NotificationPopover /></MemoryRouter>)
    const badge = count > 99 ? '99+' : String(count)
    const name = count > 0 ? `${label}: ${badge} ${unread}` : label
    const button = screen.getByRole('button', { name })
    expect(button.getAttribute('title')).toBe(count > 0 ? `${count} ${tooltip}` : label)
    const visibleBadge = button.querySelector('.topbar-notification-count')
    if (count > 0) {
      expect(visibleBadge?.textContent).toBe(badge)
      expect(button.getAttribute('aria-label')).toContain(visibleBadge?.textContent)
    } else {
      expect(visibleBadge).toBeNull()
    }
  })
})
