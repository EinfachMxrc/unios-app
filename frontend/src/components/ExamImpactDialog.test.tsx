// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ExamImpactDialog, type ExamImpact } from './ExamImpactDialog'

const mocks = vi.hoisted(() => ({ api: vi.fn(), mutation: vi.fn(), mutate: vi.fn(), reload: vi.fn(), reset: vi.fn(), writable: true }))
vi.mock('@/api', () => ({ useApi: mocks.api, request: vi.fn(), localDate: (value: string) => value }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key} ${Object.values(values).join(' ')}` : key }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => mocks.writable }))
vi.mock('@/hooks/useApiMutation', () => ({ useApiMutation: mocks.mutation }))

const preview: ExamImpact = {
  cycle_id: 3, exam_id: 5, exam_title: 'Synthetic Exam', old_exam_at: '2026-10-23T12:00:00Z', current_exam_at: '2026-10-21T12:00:00Z',
  planned_at: '2026-10-09T12:00:00Z', revision: 'a'.repeat(64), history_count: 1, can_apply: true, reasons: [],
  phases: [{ id: 3, phase_label: 'Synthetic practice', old_starts_at: '2026-10-08T12:00:00Z', old_ends_at: '2026-10-20T12:00:00Z',
    new_starts_at: '2026-10-08T12:00:00Z', new_ends_at: '2026-10-18T12:00:00Z' }],
  blocks: [{ id: 7, topic: 'Synthetic derivatives', duration_minutes: 45, old_starts_at: '2026-10-22T16:00:00Z', new_starts_at: '2026-10-20T16:00:00Z' }],
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.writable = true
  mocks.api.mockReturnValue({ data: preview, loading: false, error: null, reload: mocks.reload })
  mocks.mutation.mockReturnValue({ mutate: mocks.mutate, pending: false, error: null, reset: mocks.reset })
})
afterEach(cleanup)

it('shows the old/new exam and plan before any write, and confirms only the displayed preview', () => {
  render(<ExamImpactDialog cycleId={3} onClose={vi.fn()} onApplied={vi.fn()} />)
  expect(screen.getByText('oldDate 2026-10-23T12:00:00Z')).toBeTruthy()
  expect(screen.getByText('newDate 2026-10-21T12:00:00Z')).toBeTruthy()
  expect(screen.getByText('2026-10-22T16:00:00Z')).toBeTruthy()
  expect(screen.getByText('2026-10-20T16:00:00Z')).toBeTruthy()
  expect(mocks.mutate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'confirm' }))
  expect(mocks.mutate).toHaveBeenCalledWith(preview)
})

it('keeps the plan unchanged on cancel and provides a fresh preview after a stale revision', () => {
  const close = vi.fn()
  mocks.mutation.mockReturnValue({ mutate: mocks.mutate, pending: false, error: 'Synthetic stale preview', reset: mocks.reset })
  render(<ExamImpactDialog cycleId={3} onClose={close} onApplied={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toBe('Synthetic stale preview')
  fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
  expect(mocks.reload).toHaveBeenCalledOnce()
  expect(mocks.reset).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
  expect(close).toHaveBeenCalledOnce()
  expect(mocks.mutate).not.toHaveBeenCalled()
})

it('blocks confirmation for an unavailable slot and for a reading device', () => {
  mocks.api.mockReturnValue({ data: { ...preview, can_apply: false, reasons: ['no_slot'], blocks: [{ ...preview.blocks[0], new_starts_at: null }] },
    loading: false, error: null, reload: mocks.reload })
  mocks.writable = false
  render(<ExamImpactDialog cycleId={3} onClose={vi.fn()} onApplied={vi.fn()} />)
  expect((screen.getByRole('button', { name: 'confirm' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('reason_no_slot')).toBeTruthy()
  expect(screen.getByText('readOnly')).toBeTruthy()
  expect(screen.getByText('unavailable')).toBeTruthy()
})
