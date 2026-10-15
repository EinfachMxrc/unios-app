// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ReleaseHealthPanel } from './ReleaseHealthPanel'

const report = vi.hoisted(() => ({ status: 'warning' }))
vi.mock('@/api', () => ({
  localDate: () => '14.10.2026, 18:34',
  useApi: () => ({
    data: {
      checked_at: '',
      database: { status: 'ok' },
      index: null,
      connectors: [{ id: 'moodle', status: report.status, last_success_at: '2026-10-14T16:34:00Z' }],
    },
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
beforeEach(async () => {
  await i18n.changeLanguage('de')
})
afterEach(cleanup)

it('distinguishes a sync warning from a failed check and labels its successful timestamp', () => {
  report.status = 'warning'
  render(<ReleaseHealthPanel />)
  expect(screen.getByText(/moodle: Abgleich mit Warnung/)).toBeTruthy()
  expect(screen.queryByText(/Prüfung fehlgeschlagen/)).toBeNull()
  expect(screen.getByText(/Letzter erfolgreicher Abgleich: 14.10.2026, 18:34/)).toBeTruthy()
})

it('keeps an actual connector error visible', () => {
  report.status = 'error'
  render(<ReleaseHealthPanel />)
  expect(screen.getByText(/moodle: Abgleich fehlgeschlagen/)).toBeTruthy()
})

it('shows the matching reason from the normal system view', () => {
  report.status = 'warning'
  render(
    <ReleaseHealthPanel
      connectorDetails={[{ connector: 'moodle', status: 'warning', message: 'Invented partial sync' }]}
    />,
  )
  expect(screen.getByText('Invented partial sync')).toBeTruthy()
})

it('does not attach a mismatching old failure to a new warning', () => {
  report.status = 'warning'
  render(
    <ReleaseHealthPanel
      connectorDetails={[{ connector: 'moodle', status: 'error', message: 'Invented stale login error' }]}
    />,
  )
  expect(screen.queryByText('Invented stale login error')).toBeNull()
  expect(screen.getByText('Zu diesem Hinweis wurde kein zusätzlicher Text gespeichert.')).toBeTruthy()
})

it('keeps an informational notice visible for a successful connector', () => {
  report.status = 'ok'
  render(
    <ReleaseHealthPanel
      connectorDetails={[{ connector: 'moodle', status: 'ok', message: 'Invented access restriction notice' }]}
    />,
  )
  expect(screen.getByText('moodle: Geprüft')).toBeTruthy()
  expect(screen.getByText('Invented access restriction notice').className).toBe('muted-text')
  expect(screen.queryByText(/Abgleich mit Warnung/)).toBeNull()
})
