// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace, rememberWorkspace, workspaceValue } from '@/lib/workspaceState'
import { LearningPage } from './LearningPage'

vi.mock('@/api', () => ({ request: vi.fn(), useApi: (path: string) => ({ data: path === '/api/learning/questions'
  ? { questions: [{ id: 'synthetic-solved', resolved: true, comment: 'Synthetic resolved question', quote: 'Synthetic quote',
    course_id: 1, course_name: 'Synthetic course', resource_name: 'Synthetic source', version_id: 1, source_page: 1 }] }
  : path === '/api/learning/practice' || path === '/api/learning/cycles' || path === '/api/learning/blocks' ? [] : null,
  error: null, loading: false, reload: () => undefined }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/hooks/useAnchorScroll', () => ({ useAnchorScroll: () => undefined }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/LearningTabs', () => ({ LearningTabs: () => null }))
vi.mock('@/addons/AddonWidgetSlot', () => ({ AddonWidgetSlot: () => null }))
vi.mock('@/components/FocusTimerPanel', () => ({ FocusTimerPanel: () => null }))
vi.mock('@/components/LearningStatusPanel', () => ({ LearningStatusPanel: () => null }))
vi.mock('@/components/PracticePanel', () => ({ PracticePanel: () => null }))
vi.mock('@/components/StudyBlocksPanel', () => ({ StudyBlocksPanel: () => null }))
vi.mock('@/components/StudyCyclesPanel', () => ({ StudyCyclesPanel: () => null }))
vi.mock('@/components/WeeklyLearningPanel', () => ({ WeeklyLearningPanel: () => null }))
vi.mock('@/components/TimeBudgetPanel', () => ({ TimeBudgetPanel: () => null }))
vi.mock('@/components/MetadataEditor', () => ({ MetadataEditor: () => null }))

beforeEach(() => { clearWorkspace(); rememberWorkspace('learning:resolved', false) })
afterEach(() => { cleanup(); clearWorkspace() })
function open(path: string) { render(<MemoryRouter initialEntries={[path]}><Link to="/learning">plain</Link><Link to="/learning?all=1#question-synthetic-solved">solvedLink</Link><LearningPage /></MemoryRouter>) }

it('shows the addressed solved question immediately despite a stored false preference', () => {
  open('/learning?all=1#question-synthetic-solved')
  expect(screen.getByRole('link', { name: 'Synthetic resolved question' })).toBeTruthy()
  expect((screen.getByLabelText('showResolvedLabel') as HTMLInputElement).checked).toBe(true)
  expect(workspaceValue('learning:resolved', false)).toBe(false)
})

it('honours another explicit link after the user hid resolved questions on the previous visit', () => {
  open('/learning')
  expect(screen.queryByText('Synthetic resolved question')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'solvedLink' }))
  expect(screen.getByText('Synthetic resolved question')).toBeTruthy()
  fireEvent.click(screen.getByLabelText('showResolvedLabel'))
  expect(screen.queryByText('Synthetic resolved question')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'plain' }))
  expect(screen.queryByText('Synthetic resolved question')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'solvedLink' }))
  expect(screen.getByText('Synthetic resolved question')).toBeTruthy()
})

it('does not treat all=0 as a request to reveal solved questions', () => {
  open('/learning?all=0')
  expect(screen.queryByText('Synthetic resolved question')).toBeNull()
})
