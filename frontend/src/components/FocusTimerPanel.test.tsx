// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { FocusTimerPanel } from './FocusTimerPanel'

const mocks = vi.hoisted(() => ({ blocks: [] as unknown[], api: vi.fn() }))
vi.mock('@/api', () => ({ dateFromApi: (value: string) => new Date(value),
  useApi: (path: string, options: unknown) => {
    mocks.api(path, options)
    return { data: mocks.blocks, loading: false, error: null }
  } }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

function block(id: number, dayOffset = 0) {
  return { id, course_id: id, course_name: `Course ${id}`, topic: `Topic ${id}`, topic_id: id,
    exam_id: id, exam_title: `Exam ${id}`, duration_minutes: 35, status: 'accepted' as const,
    starts_at: new Date(Date.now() + dayOffset * 86_400_000).toISOString() }
}
beforeEach(() => { clearWorkspace(); localStorage.clear(); mocks.api.mockClear(); mocks.blocks = [block(12), block(13)] })
afterEach(() => { cleanup(); clearWorkspace() })

it('uses one running timer across two views and keeps another block stoppable after its view closes', () => {
  const first = render(<FocusTimerPanel blockId={12} />)
  const second = render(<FocusTimerPanel blockId={13} />)
  fireEvent.click(within(first.container).getByRole('button', { name: 'focusTimerStart' }))
  expect(within(second.container).getByRole('button', { name: 'focusTimerStart' }).hasAttribute('disabled')).toBe(true)
  expect(within(second.container).getByText('focusTimerOtherBlock')).toBeTruthy()
  first.unmount()
  fireEvent.click(within(second.container).getByRole('button', { name: 'focusTimerPauseAriaLabel' }))
  expect(within(second.container).getByRole('button', { name: 'focusTimerResumeAriaLabel' })).toBeTruthy()
  expect(JSON.parse(localStorage.getItem('unios.focusTimer.v1')!).blockId).toBe(12)
  fireEvent.click(within(second.container).getByRole('button', { name: 'focusTimerStopAriaLabel' }))
  expect(within(second.container).getByRole('button', { name: 'focusTimerStart' }).hasAttribute('disabled')).toBe(false)
  expect(localStorage.getItem('unios.focusTimer.v1')).toBeNull()
})

it('allows an accepted future block from its explicit workspace without exposing other blocks', () => {
  mocks.blocks = [block(12, 2), block(13)]
  render(<FocusTimerPanel blockId={12} />)
  expect(screen.getByText('Topic 12')).toBeTruthy()
  expect(screen.queryByText('Topic 13')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'focusTimerStart' }))
  expect(screen.getByText('35:00')).toBeTruthy()
})

it('ignores corrupt stored timer state and clears the shared timer on server workspace reset', () => {
  localStorage.setItem('unios.focusTimer.v1', JSON.stringify({ blockId: 12, durationSeconds: 'invalid' }))
  window.dispatchEvent(new StorageEvent('storage', { key: 'unios.focusTimer.v1' }))
  render(<FocusTimerPanel blockId={12} />)
  fireEvent.click(screen.getByRole('button', { name: 'focusTimerStart' }))
  expect(screen.queryByText('NaN:NaN')).toBeNull()
  fireEvent(window, new Event('unios:workspace-cleared'))
  expect(screen.getByRole('button', { name: 'focusTimerStart' }).hasAttribute('disabled')).toBe(false)
  expect(localStorage.getItem('unios.focusTimer.v1')).toBeNull()
})

it('uses accepted context directly without querying the overview that generates new plans', () => {
  render(<FocusTimerPanel blockId={41} acceptedBlock={block(41, 2)} />)
  expect(mocks.api).toHaveBeenCalledWith('/api/learning/blocks', { enabled: false })
  expect(screen.getByText('Topic 41')).toBeTruthy()
  expect(screen.queryByText('Topic 12')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'focusTimerStart' }))
  expect(JSON.parse(localStorage.getItem('unios.focusTimer.v1')!).blockId).toBe(41)
})
