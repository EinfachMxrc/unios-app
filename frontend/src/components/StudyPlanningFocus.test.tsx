// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { StudyBlocksPanel } from './StudyBlocksPanel'
import { StudyCyclesPanel } from './StudyCyclesPanel'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/api', () => ({ useApi: mocks.api, request: vi.fn(), localDate: (value: string) => value }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => false }))
vi.mock('@/hooks/useApiMutation', () => ({ useApiMutation: () => ({ pending: false, error: null, mutate: vi.fn() }) }))
afterEach(cleanup)

it('opens only an accepted block in its own workspace, also on a reading host', () => {
  mocks.api.mockReturnValue({ loading: false, error: null, data: [
    { id: 3, status: 'accepted', topic: 'Accepted synthetic topic', course_name: 'Synthetic Analysis', starts_at: '2026-10-07T12:00:00Z' },
    { id: 4, status: 'proposed', topic: 'Undecided synthetic topic', course_name: 'Synthetic Analysis', starts_at: '2026-10-07T13:00:00Z' },
  ] })
  render(<MemoryRouter><StudyBlocksPanel /></MemoryRouter>)
  const links = screen.getAllByRole('link', { name: 'focusStart' })
  expect(links).toHaveLength(1)
  expect(links[0].getAttribute('href')).toBe('/learning/focus/block/3')
  expect((screen.getByRole('button', { name: 'blocksAccept' }) as HTMLButtonElement).disabled).toBe(true)
})

it('opens an accepted phase by its stable ID instead of its editable course or topic names', () => {
  const phase = { course_name: 'Renamed synthetic course', exam_title: 'Synthetic Exam', phase_label: 'Synthetic phase',
    starts_at: '2026-10-07T12:00:00Z', ends_at: '2026-10-14T12:00:00Z', topic_names: [], new_exam_materials: [],
    progress_percent: null, exam_changed: false }
  mocks.api.mockReturnValue({ loading: false, error: null, data: [
    { ...phase, id: 12, status: 'accepted' }, { ...phase, id: 13, status: 'proposed' },
  ] })
  render(<MemoryRouter><StudyCyclesPanel /></MemoryRouter>)
  const links = screen.getAllByRole('link', { name: 'focusStart' })
  expect(links).toHaveLength(1)
  expect(links[0].getAttribute('href')).toBe('/learning/focus/cycle/12')
})
