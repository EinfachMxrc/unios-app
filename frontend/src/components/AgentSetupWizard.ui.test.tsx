// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import releaseOnboarding from '@/i18n/locales/de/releaseOnboarding'
import { AgentSetupWizard } from './AgentSetupWizard'
import { request } from '@/api'
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/api', () => ({
  request: vi.fn().mockResolvedValue({}),
  useApi: (path: string) => ({
    data:
      path === '/api/ai/access'
        ? {
            courses: [
              { id: 1, name: 'Demo A', allowed: true },
              { id: 2, name: 'Demo B', allowed: true },
            ],
            categories: { course_material: true, notes: false, deadlines: false, mail: true, exam_status: true },
          }
        : { configured: false, enabled: false },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
i18n.addResourceBundle('de', 'releaseOnboarding', releaseOnboarding)
afterEach(() => {
  cleanup()
  vi.mocked(request).mockClear()
})
it('asks a new user to choose courses and review a readable grant before creating a connection', async () => {
  render(<AgentSetupWizard />)
  expect((screen.getByRole('button', { name: 'Auswahl prüfen' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kurs für Work auswählen: Demo A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl prüfen' }))
  expect(
    (screen.getByRole('checkbox', { name: 'Mail-Hinweise lesen (ohne Inhalt und Anhänge)' }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect((screen.getByRole('checkbox', { name: 'Prüfungsstatus lesen' }) as HTMLInputElement).checked).toBe(false)
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl prüfen' }))
  expect(screen.getByText(/Work kann keine Moodle-Abgabe abschicken/)).toBeTruthy()
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Freigabe speichern und verbinden' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/ai/connection', { method: 'POST' }))
  expect(vi.mocked(request).mock.calls).toContainEqual([
    '/api/ai/access/course/2',
    { method: 'PUT', body: '{"allowed":false}' },
  ])
})
