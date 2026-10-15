// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((path: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          path === '/api/recovery/status'
            ? { mode: 'normal' }
            : path === '/api/host/conflicts'
              ? []
              : path === '/api/courses'
                ? { courses: [] }
                : path === '/api/mensa/services'
                  ? { canteens: [], timezone: 'Europe/Berlin' }
                  : {
                      date: '2026-09-24',
                      moodle_configured: true,
                      new_files: 0,
                      new_assignments: 0,
                      changes: [],
                      deadlines: [],
                      courses: {},
                      warnings: [],
                      latest_sync: null,
                      sync_continuity: {
                        state: 'never',
                        hours_since: null,
                        recovered_gap_hours: null,
                        last_usable_at: null,
                      },
                      pending_group_courses: [{ id: 7, name: 'Mathe' }],
                    },
      }),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows a pending group assignment in the local dashboard', async () => {
  render(<App />)
  expect(await screen.findByText('Gruppenzuordnung offen')).toBeTruthy()
  expect(screen.getByText('Für Mathe kannst du festlegen, welche Abschnitte zu deiner Gruppe gehören.')).toBeTruthy()
  expect(screen.getByRole('link', { name: /Im Kurs zuordnen/ }).getAttribute('href')).toBe('/courses/7')
})
