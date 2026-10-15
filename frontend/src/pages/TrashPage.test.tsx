// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '@/i18n/locales/de/trash'
import type { TrashItem } from '@/lib/trash'
import { TrashPage } from './TrashPage'

const mocks = vi.hoisted(() => ({
  items: [] as TrashItem[],
  reload: vi.fn(),
  restore: vi.fn(),
  erase: vi.fn(),
  empty: vi.fn(),
}))
vi.mock('@/api', () => ({
  useApi: () => ({ data: { items: mocks.items }, loading: false, error: null, updatedAt: 0, reload: mocks.reload }),
  localDate: (value: string) => value,
}))
vi.mock('@/lib/trash', () => ({ restoreFromTrash: mocks.restore, eraseFromTrash: mocks.erase, emptyTrash: mocks.empty }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string, values: Record<string, unknown> = {}) => {
  const table = messages as Record<string, string>
  const plural = typeof values.count === 'number' ? table[`${key}_${values.count === 1 ? 'one' : 'other'}`] : undefined
  return (plural ?? table[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name]))
} }) }))

const note: TrashItem = { kind: 'note', id: 'n1', title: 'Eigenwerte', course_id: 3, course_name: 'Mathematik', deleted_at: '12.10.2026' }
const jot: TrashItem = { kind: 'jot', id: 'j1', title: 'Buch zurückgeben', course_id: null, course_name: null, deleted_at: '11.10.2026' }

beforeEach(() => { vi.clearAllMocks(); mocks.items = [note, jot] })
afterEach(cleanup)

const open = () => render(<MemoryRouter><TrashPage /></MemoryRouter>)

it('lists what is in the trash with its kind, course and when it was deleted', () => {
  open()
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0].textContent).toContain('Notiz · Mathematik · gelöscht 12.10.2026')
  expect(rows[1].textContent).toContain('Schnellnotiz · Ohne Kurs')
})

it('restores an item right away and says so', async () => {
  mocks.restore.mockResolvedValue(undefined)
  open()
  fireEvent.click(screen.getByRole('button', { name: '„Eigenwerte“ wiederherstellen' }))
  expect(await screen.findByText('„Eigenwerte“ ist wiederhergestellt.')).toBeTruthy()
  expect(mocks.restore).toHaveBeenCalledWith('note', 'n1')
  expect(mocks.reload).toHaveBeenCalled()
})

it('asks before erasing, and cancelling erases nothing', async () => {
  mocks.erase.mockResolvedValue(undefined)
  open()
  fireEvent.click(screen.getByRole('button', { name: '„Buch zurückgeben“ endgültig löschen' }))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByText(/lässt sich nicht rückgängig machen/)).toBeTruthy()
  expect(document.activeElement?.textContent).toBe('Abbrechen')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  expect(mocks.erase).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '„Buch zurückgeben“ endgültig löschen' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Endgültig löschen' }))
  await waitFor(() => expect(mocks.erase).toHaveBeenCalledWith('jot', 'j1'))
  expect(await screen.findByText('„Buch zurückgeben“ ist endgültig gelöscht.')).toBeTruthy()
})

it('empties the whole trash after one confirmation', async () => {
  mocks.empty.mockResolvedValue(2)
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Papierkorb leeren' }))
  expect(within(screen.getByRole('alertdialog')).getByText(/2 Einträge werden/)).toBeTruthy()
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Papierkorb leeren' }))
  expect(await screen.findByText('2 Einträge endgültig gelöscht.')).toBeTruthy()
})

it('shows a calm empty state', () => {
  mocks.items = []
  open()
  expect(screen.getByText('Der Papierkorb ist leer')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Papierkorb leeren' })).toBeNull()
})
