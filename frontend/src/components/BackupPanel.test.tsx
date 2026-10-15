// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '@/i18n/locales/de/backup'
import { BackupPanel, formatSize, type BackupState } from './BackupPanel'

const mocks = vi.hoisted(() => ({ state: null as BackupState | null, request: vi.fn(), reload: vi.fn(), desktop: false, restart: vi.fn() }))
vi.mock('@/api', () => ({
  useApi: () => ({ data: mocks.state, error: null, loading: false, reload: mocks.reload }),
  request: mocks.request,
  localDate: (value: string) => value.slice(0, 10),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/lib/desktop', () => ({ isDesktopApp: () => mocks.desktop }))
vi.mock('@/lib/releaseModes', () => ({ restartNativeBackend: mocks.restart }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string, values: Record<string, unknown> = {}) => {
  const table = messages as Record<string, string>
  const plural = typeof values.count === 'number' ? table[`${key}_${values.count === 1 ? 'one' : 'other'}`] : undefined
  return (plural ?? table[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name]))
} }) }))

const empty: BackupState = { folder: null, daily: true, keep: 14, status: {}, snapshots: [], pending_restore: null,
  last_restore: null, suggestions: ['C:/Users/a/OneDrive/UniOS-Backups', 'C:/Users/a/Documents/UniOS-Backups'], confirmation: 'WIEDERHERSTELLEN' }
const snapshot = { name: 'UniOS-2026-10-13_093000', created_at: '2026-10-13T09:30:00+00:00', files: 120, bytes: 268_000_000 }
const configured: BackupState = { ...empty, folder: 'C:/Users/a/OneDrive/UniOS-Backups',
  status: { status: 'success', at: '2026-10-13T09:30:00+00:00', files: 120, bytes: 268_000_000 }, snapshots: [snapshot] }

beforeEach(() => { vi.clearAllMocks(); mocks.desktop = false })
afterEach(cleanup)

it('offers likely folders and saves the chosen one', async () => {
  mocks.state = empty
  mocks.request.mockResolvedValue(configured)
  render(<BackupPanel />)
  const field = screen.getByLabelText('Backup-Ordner') as HTMLInputElement
  expect(field.value).toBe('C:/Users/a/OneDrive/UniOS-Backups')
  fireEvent.click(screen.getByRole('button', { name: /Documents/ }))
  expect(field.value).toBe('C:/Users/a/Documents/UniOS-Backups')
  fireEvent.click(screen.getByRole('button', { name: 'Ordner übernehmen' }))
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/api/backup/settings', expect.objectContaining({ method: 'PUT' })))
  expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ folder: 'C:/Users/a/Documents/UniOS-Backups', daily: true, keep: 14 })
  expect(await screen.findByText('Letzte Sicherung: 2026-10-13 · 120 Dateien, 268 MB')).toBeTruthy()
})

it('restores only after the phrase is typed, then asks for a restart', async () => {
  mocks.state = configured
  mocks.desktop = true
  mocks.request.mockResolvedValue({ ...configured, pending_restore: snapshot.name })
  render(<BackupPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Stand vom 2026-10-13 wiederherstellen' }))
  const dialog = screen.getByRole('alertdialog')
  const confirm = within(dialog).getByRole('button', { name: 'Beim nächsten Start einspielen' }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.change(within(dialog).getByLabelText(/WIEDERHERSTELLEN/), { target: { value: 'WIEDERHERSTELLEN' } })
  expect(confirm.disabled).toBe(false)
  fireEvent.click(confirm)
  expect(await screen.findByText('Der Stand vom 2026-10-13 wird beim nächsten Start von UniOS eingespielt.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'UniOS jetzt neu starten' }))
  expect(mocks.restart).toHaveBeenCalledWith('normal')
})

it('reports what the last restore did', () => {
  mocks.state = { ...configured, last_restore: { status: 'success', name: snapshot.name, previous: 'before-restore-20261013T100000' } }
  render(<BackupPanel />)
  expect(screen.getByText(/wurde eingespielt\. Der vorherige Stand liegt im lokalen Ordner „before-restore-20261013T100000“/)).toBeTruthy()
})

it('writes sizes people can read', () => {
  expect(formatSize(950, 'de-DE')).toBe('950 B')
  expect(formatSize(268_400_000, 'de-DE')).toBe('268,4 MB')
  expect(formatSize(1_500_000_000, 'de-DE')).toBe('1,5 GB')
})
