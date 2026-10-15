// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import type { LearningFocusContext } from '@/lib/learningFocus'
import {
  rememberSourceWorkingDraft,
  resetSourceNoteSaves,
  saveSourceNote,
  sourceNoteSaveState,
  sourceWorkingDraft,
} from '@/lib/sourceNoteSave'
import { FocusWorkspacePage } from './FocusWorkspacePage'

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  request: vi.fn(),
  reader: vi.fn(),
  note: vi.fn(),
  timer: vi.fn(),
  noteCourse: 9,
  examAt: null as string | null,
}))
vi.mock('@/api', () => ({ useApi: mocks.api, request: mocks.request, localDate: (value: string) => value }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/FocusTimerPanel', () => ({
  FocusTimerPanel: (props: unknown) => {
    mocks.timer(props)
    return <div>Existing timer</div>
  },
}))
vi.mock('@/components/PracticePanel', () => ({
  PracticePanel: function Practice() {
    const [value, setValue] = useState('')
    return (
      <label>
        Existing practice
        <input value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
    )
  },
}))
vi.mock('./MaterialPage', () => ({
  MaterialReader: (props: { versionId: number; expectedCourseId: number; savedNoteHref: (id: string) => string }) => {
    mocks.reader(props)
    return (
      <section aria-label="Existing reader">
        <span>Source version {props.versionId}</span>
        <Link to={props.savedNoteHref('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')}>Saved note</Link>
      </section>
    )
  },
}))
vi.mock('./notes/NoteDocument', () => ({
  NoteDocument: (props: { id: string }) => {
    mocks.note(props)
    return <div>Existing note document</div>
  },
}))
vi.mock('./notes/NewNote', () => ({ NewNote: () => <div>New note receipt: {sourceNoteSaveState(9, null).phase}</div> }))

const context: LearningFocusContext = {
  kind: 'block',
  id: 3,
  label: 'Accepted synthetic block',
  status: 'accepted',
  course_id: 9,
  course_name: 'Synthetic Analysis',
  exam_id: 4,
  exam_title: 'Synthetic Exam',
  exam_at: null,
  exam_changed: null,
  topics: [{ id: 5, name: 'Synthetic limits' }],
  missing_topic_ids: [],
  duration_minutes: 35,
  starts_at: '2026-10-07T12:00:00Z',
  ends_at: null,
  card_scope: {
    mode: 'integrated',
    scope: 'course_related_decks',
    uncertain: false,
    decks: [{ deck_id: 8, name: 'Existing native deck' }],
  },
}
function tree(search = '') {
  return (
    <MemoryRouter initialEntries={[`/learning/focus/block/3${search}`]}>
      <Routes>
        <Route path="/learning/focus/:kind/:id" element={<FocusWorkspacePage />} />
      </Routes>
    </MemoryRouter>
  )
}
beforeEach(() => {
  clearWorkspace()
  resetSourceNoteSaves()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  mocks.noteCourse = 9
  mocks.examAt = null
  mocks.api.mockImplementation((path: string) => ({
    data:
      path === '/api/learning/focus/block/3'
        ? { ...context, exam_at: mocks.examAt }
        : path.startsWith('/api/courses/9')
          ? {
              course: { id: 9 },
              resources: [{ id: 1, name: 'Synthetic.pdf', group_category: 'main', filename: 'Synthetic.pdf' }],
              versions: { 1: [{ id: 17, version: 1, mime_type: 'application/pdf' }] },
              page: { offset: 0, limit: 50, total: 1, has_more: false },
            }
          : path === `/api/notes/${noteId}`
            ? { note: { id: noteId, course_id: mocks.noteCourse } }
            : path.startsWith('/api/notes?course_id=9')
              ? {
                  notes: [{ id: noteId, course_id: 9, title: 'Own notes', updated_at: '2026-10-07T12:00:00Z' }],
                  courses: [],
                }
              : null,
    loading: false,
    error: null,
    updatedAt: 0,
    reload: () => undefined,
  }))
})
afterEach(() => {
  cleanup()
  clearWorkspace()
  resetSourceNoteSaves()
})

it('uses stored context IDs and leaves an absent exam date explicitly unknown', async () => {
  render(tree())
  expect(screen.getByRole('heading', { name: 'Synthetic Analysis' })).toBeTruthy()
  expect(mocks.timer.mock.calls.at(-1)?.[0]).toMatchObject({
    blockId: 3,
    acceptedBlock: {
      id: 3,
      topic: 'Synthetic limits',
      course_name: 'Synthetic Analysis',
      duration_minutes: 35,
      starts_at: context.starts_at,
      status: 'accepted',
    },
  })
  expect(screen.getByText(/focusExamDateUnknown/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'focusCardsMode' }).getAttribute('href')).toBe('/study?focus=block%3A3')
  expect(screen.getByRole('link', { name: 'focusLearnCards' }).getAttribute('href')).toBe('/study?focus=block%3A3')
  fireEvent.click(screen.getByRole('button', { name: /Synthetic.pdf/ }))
  await screen.findByRole('region', { name: 'Existing reader' })
  expect(mocks.reader.mock.calls.at(-1)?.[0]).toMatchObject({ versionId: 17, embedded: true, expectedCourseId: 9 })
})

it('carries an exact saved source into the existing note document and back to the reader', async () => {
  render(tree('?mode=source&version=17&page=80'))
  fireEvent.click(await screen.findByRole('link', { name: 'Saved note' }))
  await screen.findByText('Existing note document')
  expect(mocks.note.mock.calls.at(-1)?.[0].id).toBe(noteId)
  fireEvent.click(screen.getByRole('button', { name: 'focusSourceMode' }))
  await screen.findByRole('region', { name: 'Existing reader' })
  expect(mocks.reader.mock.calls.at(-1)?.[0].versionId).toBe(17)
})

it('does not mount a foreign-course note even when its ID is directly requested outside the catalog page', async () => {
  mocks.noteCourse = 99
  render(tree(`?mode=notes&note=${noteId}`))
  await screen.findByText('focusForeignNote')
  expect(mocks.note).not.toHaveBeenCalled()
})

it('keeps an already started exercise mounted through source work, preserving its local answer and mutation observer', async () => {
  render(tree('?mode=practice'))
  const input = screen.getByRole('textbox', { name: 'Existing practice' })
  fireEvent.change(input, { target: { value: 'Own unsent explanation' } })
  fireEvent.click(screen.getByRole('button', { name: 'focusReturnToSource' }))
  expect(screen.queryByRole('textbox', { name: 'Existing practice' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'focusPracticeMode' }))
  await waitFor(() =>
    expect((screen.getByRole('textbox', { name: 'Existing practice' }) as HTMLInputElement).value).toBe(
      'Own unsent explanation',
    ),
  )
  expect(screen.getByRole('textbox', { name: 'Existing practice' })).toBe(input)
})

it.each([false, true])(
  'the explicit focus new-note action releases only clean receipts, later RAM=%s',
  async (hasLaterRam) => {
    mocks.request.mockResolvedValue({
      note: { id: noteId, course_id: 9, resource_id: null, current_revision: 1, title: 'First lecture' },
      body: 'Confirmed first text',
      selected_revision: 1,
      versions: [],
    })
    await saveSourceNote({
      courseId: 9,
      resourceId: null,
      title: 'First lecture',
      body: 'Confirmed first text',
      draft: null,
    })
    if (hasLaterRam)
      rememberSourceWorkingDraft(9, null, {
        title: 'First lecture',
        body: 'Later RAM text',
        persisted: null,
        status: 'error',
      })
    render(tree('?mode=notes'))
    fireEvent.click(screen.getByRole('button', { name: 'focusNewNote' }))
    await screen.findByText(`New note receipt: ${hasLaterRam ? 'saved' : 'idle'}`)
    if (hasLaterRam) expect(sourceWorkingDraft(9, null)?.body).toBe('Later RAM text')
    expect(mocks.request).toHaveBeenCalledTimes(1)
  },
)
