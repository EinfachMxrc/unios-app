// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { queryClient } from '@/offlineCache'
import { JournalPage } from './JournalPage'
import { VoicePage } from './VoicePage'
import { GradesPage } from './GradesPage'

const fixtures = vi.hoisted(() => {
  const module = {
    id: 7,
    source: 'manual',
    title: 'Erfundene Mathematik',
    semester_id: null,
    semester_name: null,
    ects: '5',
    grade: null as string | null,
    weight: null,
    attempt: null,
    status: 'open',
    revision: 1,
    archived_at: null,
    updated_at: '2026-10-09T10:00:00Z',
  }
  const memo = {
    id: 'synthetic-memo',
    title: 'Erfundenes Sprachmemo',
    transcript: 'Gespeicherter Text',
    course_id: 2,
    course_name: 'Erfundener Kurs',
    topic_id: null,
    topic_name: null,
    jot_id: 'synthetic-jot',
    audio_url: '/api/voice/synthetic-memo/audio',
    mime_type: 'audio/webm',
    size: 8,
    revision: 1,
    created_at: '2026-10-09T10:00:00Z',
    task_id: null,
  }
  const journal = (day: string) => ({
    day,
    reflection: 'Gespeicherte Tagesnotiz',
    revision: 1,
    sessions: [],
    materials: [],
    notes: [],
    questions: [],
    jots: [],
    reviews: 0,
    attempts: 0,
    incorrect_attempts: 0,
    courses: [
      { course_id: 2, course_name: 'Erfundener Kurs', covered: 'Gleicher gespeicherter Kurstext', revision: 1 },
    ],
  })
  const dashboard = () => ({
    modules: [module],
    semesters: [],
    overall: { planned_ects: '5', earned_ects: '0', hypothetical_ects: '0' },
    average: null,
    average_basis: 'no_grades',
    weighting_complete: true,
    scenario_average: null as string | null,
    scenario_basis: 'ects',
    scenario_weighting_complete: true,
  })
  return {
    module,
    memo,
    journal,
    dashboard,
    journals: { '2026-10-09': journal('2026-10-09'), '2026-10-10': journal('2026-10-10') },
    grades: dashboard(),
    loadingDay: '',
    reload: vi.fn(),
  }
})

vi.mock('@/api', () => ({
  activeIntlLocale: () => 'de-DE',
  localDate: (value: string) => value,
  request: vi.fn(),
  useApi: (path: string) => ({
    data:
      path === `/api/journal/${fixtures.loadingDay}`
        ? undefined
        : path.startsWith('/api/journal/')
          ? fixtures.journals[path.slice('/api/journal/'.length) as keyof typeof fixtures.journals]
          : path.startsWith('/api/grades')
            ? fixtures.grades
            : path === '/api/voice'
              ? [fixtures.memo]
              : path.startsWith('/api/courses')
                ? { courses: [{ id: 2, name: 'Erfundener Kurs' }], semesters: [] }
                : path === '/api/learning/topics'
                  ? []
                  : path === '/api/primuss/exams'
                    ? []
                    : undefined,
    error: null,
    loading: path === `/api/journal/${fixtures.loadingDay}`,
    updatedAt: null,
    reload: fixtures.reload,
  }),
}))
vi.mock('@/offlineCache', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }
})
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values?: { average?: string; values?: string }) =>
      values?.average ? `${key} ${values.average}` : values?.values ? `${key} ${values.values}` : key,
  }),
}))
vi.mock('@/hooks/host', async () => {
  const { createContext } = await import('react')
  return { useWritableHost: () => true, HostContext: createContext(null) }
})
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/State', () => ({
  Panel: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Empty: () => null,
  Loading: () => null,
  Failure: ({ message }: { message: string }) => <p role="alert">{message}</p>,
}))
vi.mock('@/components/EntityProperties', () => ({ EntityProperties: () => null }))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))

beforeEach(() => {
  fixtures.module.revision = 1
  fixtures.module.title = 'Erfundene Mathematik'
  fixtures.memo.revision = 1
  fixtures.memo.transcript = 'Gespeicherter Text'
  fixtures.memo.title = 'Erfundenes Sprachmemo'
  fixtures.journals = { '2026-10-09': fixtures.journal('2026-10-09'), '2026-10-10': fixtures.journal('2026-10-10') }
  fixtures.grades = fixtures.dashboard()
  fixtures.loadingDay = ''
  fixtures.reload.mockClear()
  vi.mocked(request).mockReset()
})
afterEach(() => {
  cleanup()
  queryClient.clear()
})

function PageTree({ kind }: { kind: 'journal' | 'voice' | 'grades' }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[kind === 'journal' ? '/journal/2026-10-09' : `/${kind}`]}>
        <Routes>
          <Route path="/journal/:day" element={<JournalPage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/grades" element={<GradesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
function openPage(kind: 'journal' | 'voice' | 'grades') {
  const view = render(<PageTree kind={kind} />)
  return { refresh: () => view.rerender(<PageTree kind={kind} />) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
function payload(index = 0) {
  return JSON.parse(vi.mocked(request).mock.calls[index][1]?.body as string)
}

it('binds cached course drafts to their day and restores each draft on navigation', async () => {
  openPage('journal')
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), { target: { value: 'Entwurf für Freitag' } })
  fireEvent.click(screen.getByRole('link', { name: 'nextDayAria' }))
  expect((screen.getByLabelText('coveredTodayLabel') as HTMLTextAreaElement).value).toBe(
    'Gleicher gespeicherter Kurstext',
  )
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), { target: { value: 'Entwurf für Samstag' } })
  fireEvent.click(screen.getByRole('link', { name: 'prevDayAria' }))
  expect((screen.getByLabelText('coveredTodayLabel') as HTMLTextAreaElement).value).toBe('Entwurf für Freitag')
  vi.mocked(request).mockResolvedValue({
    ...fixtures.journals['2026-10-09'],
    courses: [{ ...fixtures.journals['2026-10-09'].courses[0], covered: 'Entwurf für Freitag', revision: 2 }],
  })
  fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(vi.mocked(request).mock.calls[0][0]).toBe('/api/journal/2026-10-09/courses/2')
  expect(payload()).toEqual({ expected_revision: 1, covered: 'Entwurf für Freitag' })
  fireEvent.click(screen.getByRole('link', { name: 'nextDayAria' }))
  expect((screen.getByLabelText('coveredTodayLabel') as HTMLTextAreaElement).value).toBe('Entwurf für Samstag')
})

it('retains a course draft when an uncached day temporarily unmounts its editor', () => {
  openPage('journal')
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), {
    target: { value: 'Entwurf vor ungecachetem Tageswechsel' },
  })
  fixtures.loadingDay = '2026-10-10'
  fireEvent.click(screen.getByRole('link', { name: 'nextDayAria' }))
  expect(screen.queryByLabelText('coveredTodayLabel')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'prevDayAria' }))
  expect((screen.getByLabelText('coveredTodayLabel') as HTMLTextAreaElement).value).toBe(
    'Entwurf vor ungecachetem Tageswechsel',
  )
})

it('keeps a new-day course draft when an old-day acknowledgement arrives', async () => {
  openPage('journal')
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), { target: { value: 'Abgeschickter Freitag' } })
  const pending = deferred<(typeof fixtures.journals)['2026-10-09']>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('link', { name: 'nextDayAria' }))
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), { target: { value: 'Offener Samstag' } })
  await act(async () => {
    pending.resolve({
      ...fixtures.journals['2026-10-09'],
      courses: [{ ...fixtures.journals['2026-10-09'].courses[0], covered: 'Abgeschickter Freitag', revision: 2 }],
    })
    await pending.promise
  })
  expect((screen.getByLabelText('coveredTodayLabel') as HTMLTextAreaElement).value).toBe('Offener Samstag')
  vi.mocked(request).mockResolvedValue({
    ...fixtures.journals['2026-10-10'],
    courses: [{ ...fixtures.journals['2026-10-10'].courses[0], covered: 'Offener Samstag', revision: 2 }],
  })
  fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  expect(vi.mocked(request).mock.calls[1][0]).toBe('/api/journal/2026-10-10/courses/2')
  expect(payload(1)).toEqual({ expected_revision: 1, covered: 'Offener Samstag' })
})

it('keeps dirty journal reflection on refetch and requires explicit adoption of the new revision', async () => {
  const page = openPage('journal')
  fireEvent.change(screen.getByLabelText('myDailyNoteAria'), { target: { value: 'Eigener offener Tagesentwurf' } })
  fixtures.journals['2026-10-09'] = { ...fixtures.journals['2026-10-09'], reflection: 'Neuer Serverstand', revision: 2 }
  page.refresh()
  expect((screen.getByLabelText('myDailyNoteAria') as HTMLTextAreaElement).value).toBe('Eigener offener Tagesentwurf')
  expect(screen.getByText('draftChanged')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'saveReflectionButton' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'discardDraftReload' }))
  expect((screen.getByLabelText('myDailyNoteAria') as HTMLTextAreaElement).value).toBe('Neuer Serverstand')
  fireEvent.change(screen.getByLabelText('myDailyNoteAria'), { target: { value: 'Bewusste Fortsetzung' } })
  vi.mocked(request).mockResolvedValue({
    ...fixtures.journals['2026-10-09'],
    reflection: 'Bewusste Fortsetzung',
    revision: 3,
  })
  fireEvent.click(screen.getByRole('button', { name: 'saveReflectionButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(payload().expected_revision).toBe(2)
})

it('adopts a clean journal refetch and preserves reflection text typed during its save', async () => {
  const page = openPage('journal')
  fixtures.journals['2026-10-09'] = {
    ...fixtures.journals['2026-10-09'],
    reflection: 'Neuer sauberer Stand',
    revision: 2,
  }
  page.refresh()
  await waitFor(() =>
    expect((screen.getByLabelText('myDailyNoteAria') as HTMLTextAreaElement).value).toBe('Neuer sauberer Stand'),
  )
  fireEvent.change(screen.getByLabelText('myDailyNoteAria'), { target: { value: 'Abgeschickter Stand A' } })
  const pending = deferred<(typeof fixtures.journals)['2026-10-09']>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'saveReflectionButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  fireEvent.change(screen.getByLabelText('myDailyNoteAria'), { target: { value: 'Weitergetippter Stand B' } })
  await act(async () => {
    pending.resolve({ ...fixtures.journals['2026-10-09'], reflection: 'Abgeschickter Stand A', revision: 3 })
    await pending.promise
  })
  expect((screen.getByLabelText('myDailyNoteAria') as HTMLTextAreaElement).value).toBe('Weitergetippter Stand B')
  expect((screen.getByRole('button', { name: 'saveReflectionButton' }) as HTMLButtonElement).disabled).toBe(false)
})

it('preserves a newly added course continuation when the acknowledged course enters the fetched list', async () => {
  fixtures.journals['2026-10-09'].courses = []
  const page = openPage('journal')
  fireEvent.change(screen.getByLabelText('addCourse'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), { target: { value: 'Kursstand A' } })
  const pending = deferred<(typeof fixtures.journals)['2026-10-09']>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  fireEvent.change(screen.getByLabelText('coveredTodayLabel'), { target: { value: 'Kursfortsetzung B' } })
  fixtures.journals['2026-10-09'] = {
    ...fixtures.journals['2026-10-09'],
    courses: [{ course_id: 2, course_name: 'Erfundener Kurs', covered: 'Kursstand A', revision: 1 }],
  }
  await act(async () => {
    pending.resolve(fixtures.journals['2026-10-09'])
    await pending.promise
  })
  page.refresh()
  expect((screen.getByLabelText('coveredTodayLabel') as HTMLTextAreaElement).value).toBe('Kursfortsetzung B')
  vi.mocked(request).mockResolvedValue({
    ...fixtures.journals['2026-10-09'],
    courses: [{ ...fixtures.journals['2026-10-09'].courses[0], covered: 'Kursfortsetzung B', revision: 2 }],
  })
  fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  expect(payload(1)).toEqual({ expected_revision: 1, covered: 'Kursfortsetzung B' })
})

it('keeps a dirty memo across refetch and reloads only on explicit choice', async () => {
  const page = openPage('voice')
  const memo = within(document.querySelector('.voice-memo') as HTMLElement)
  fireEvent.click(memo.getByRole('button', { name: 'editButton' }))
  fireEvent.change(memo.getByLabelText('transcriptLabel'), { target: { value: 'Eigene Transkriptkorrektur' } })
  fixtures.memo = { ...fixtures.memo, transcript: 'Neuer Servertext', revision: 2 }
  page.refresh()
  expect((memo.getByLabelText('transcriptLabel') as HTMLTextAreaElement).value).toBe('Eigene Transkriptkorrektur')
  expect(memo.getByText('draftChanged')).toBeTruthy()
  expect((memo.getByRole('button', { name: 'saveChangesButton' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(memo.getByRole('button', { name: 'discardDraftReload' }))
  expect((memo.getByLabelText('transcriptLabel') as HTMLTextAreaElement).value).toBe('Neuer Servertext')
  fireEvent.change(memo.getByLabelText('transcriptLabel'), { target: { value: 'Bewusste Korrektur' } })
  vi.mocked(request).mockResolvedValue({ ...fixtures.memo, transcript: 'Bewusste Korrektur', revision: 3 })
  fireEvent.click(memo.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(payload().expected_revision).toBe(2)
})

it('hydrates a clean open memo from a newer fetched revision', async () => {
  const page = openPage('voice')
  const memo = within(document.querySelector('.voice-memo') as HTMLElement)
  fireEvent.click(memo.getByRole('button', { name: 'editButton' }))
  fixtures.memo = { ...fixtures.memo, transcript: 'Sauber übernommener Memo-Stand', revision: 2 }
  page.refresh()
  await waitFor(() =>
    expect((memo.getByLabelText('transcriptLabel') as HTMLTextAreaElement).value).toBe(
      'Sauber übernommener Memo-Stand',
    ),
  )
  expect(memo.queryByText('draftChanged')).toBeNull()
})

it('does not close a memo editor or lose its newer text after an older acknowledgement', async () => {
  openPage('voice')
  const memo = within(document.querySelector('.voice-memo') as HTMLElement)
  fireEvent.click(memo.getByRole('button', { name: 'editButton' }))
  fireEvent.change(memo.getByLabelText('transcriptLabel'), { target: { value: 'Memo A' } })
  const pending = deferred<typeof fixtures.memo>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(memo.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  fireEvent.change(memo.getByLabelText('transcriptLabel'), { target: { value: 'Memo B' } })
  await act(async () => {
    pending.resolve({ ...fixtures.memo, transcript: 'Memo A', revision: 2 })
    await pending.promise
  })
  expect((memo.getByLabelText('transcriptLabel') as HTMLTextAreaElement).value).toBe('Memo B')
  vi.mocked(request).mockResolvedValue({ ...fixtures.memo, transcript: 'Memo B', revision: 3 })
  fireEvent.click(memo.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  expect(payload(1).expected_revision).toBe(2)
})

it('keeps a manual-grade draft and its baseline on refetch instead of remounting the form', async () => {
  const page = openPage('grades')
  fireEvent.click(screen.getByRole('button', { name: 'editButton' }))
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), { target: { value: 'Eigener Modulname' } })
  fixtures.grades = { ...fixtures.grades, modules: [{ ...fixtures.module, title: 'Server-Modulname', revision: 2 }] }
  page.refresh()
  expect((screen.getByLabelText('moduleNameLabel') as HTMLInputElement).value).toBe('Eigener Modulname')
  expect(screen.getByText('draftChanged')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'saveModuleButton' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'discardDraftReload' }))
  expect((screen.getByLabelText('moduleNameLabel') as HTMLInputElement).value).toBe('Server-Modulname')
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), { target: { value: 'Bewusst überarbeitet' } })
  vi.mocked(request).mockResolvedValue({ ...fixtures.grades.modules[0], title: 'Bewusst überarbeitet', revision: 3 })
  fireEvent.click(screen.getByRole('button', { name: 'saveModuleButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(payload().expected_revision).toBe(2)
})

it('hydrates a clean open manual module from a new server revision', async () => {
  const page = openPage('grades')
  fireEvent.click(screen.getByRole('button', { name: 'editButton' }))
  fixtures.grades = { ...fixtures.grades, modules: [{ ...fixtures.module, title: 'Sauberer Modulstand', revision: 2 }] }
  page.refresh()
  await waitFor(() =>
    expect((screen.getByLabelText('moduleNameLabel') as HTMLInputElement).value).toBe('Sauberer Modulstand'),
  )
  expect(screen.queryByText('draftChanged')).toBeNull()
})

it('keeps a 409 grade draft and submits the original baseline revision', async () => {
  openPage('grades')
  fireEvent.click(screen.getByRole('button', { name: 'editButton' }))
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), {
    target: { value: 'Offener konfliktbehafteter Entwurf' },
  })
  vi.mocked(request).mockRejectedValue(new Error('HTTP 409: Erfundener Revisionskonflikt'))
  fireEvent.click(screen.getByRole('button', { name: 'saveModuleButton' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(payload().expected_revision).toBe(1)
  expect((screen.getByLabelText('moduleNameLabel') as HTMLInputElement).value).toBe(
    'Offener konfliktbehafteter Entwurf',
  )
})

it('continues a newly created manual module with PUT after typing through the POST acknowledgement', async () => {
  openPage('grades')
  fireEvent.click(screen.getByRole('button', { name: 'addModuleButton' }))
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), { target: { value: 'Neues Modul A' } })
  fireEvent.change(screen.getByLabelText('ectsLabel'), { target: { value: '5' } })
  const pending = deferred<typeof fixtures.module>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'saveModuleButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), { target: { value: 'Neues Modul B' } })
  await act(async () => {
    pending.resolve({ ...fixtures.module, id: 11, title: 'Neues Modul A' })
    await pending.promise
  })
  expect((screen.getByLabelText('moduleNameLabel') as HTMLInputElement).value).toBe('Neues Modul B')
  vi.mocked(request).mockResolvedValue({ ...fixtures.module, id: 11, title: 'Neues Modul B', revision: 2 })
  fireEvent.click(screen.getByRole('button', { name: 'saveModuleButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  expect(vi.mocked(request).mock.calls[1][0]).toBe('/api/grades/11')
  expect(vi.mocked(request).mock.calls[1][1]?.method).toBe('PUT')
  expect(payload(1).expected_revision).toBe(1)
})

it('does not close another module editor when a previous editor acknowledges its save', async () => {
  fixtures.grades.modules.push({ ...fixtures.module, id: 8, title: 'Anderes erfundenes Modul' })
  openPage('grades')
  fireEvent.click(screen.getAllByRole('button', { name: 'editButton' })[0])
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), { target: { value: 'Abgeschicktes Modul A' } })
  const pending = deferred<typeof fixtures.module>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'saveModuleButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  fireEvent.click(screen.getAllByRole('button', { name: 'editButton' })[1])
  fireEvent.change(screen.getByLabelText('moduleNameLabel'), { target: { value: 'Offener Entwurf für Modul B' } })
  await act(async () => {
    pending.resolve({ ...fixtures.module, title: 'Abgeschicktes Modul A', revision: 2 })
    await pending.promise
  })
  expect((screen.getByLabelText('moduleNameLabel') as HTMLInputElement).value).toBe('Offener Entwurf für Modul B')
})

it('ignores an older forecast response after a newer calculation completes', async () => {
  openPage('grades')
  const first = deferred<typeof fixtures.grades>(),
    second = deferred<typeof fixtures.grades>()
  vi.mocked(request).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  fireEvent.change(screen.getByLabelText('Erfundene Mathematik'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'calculateScenarioButton' }))
  fireEvent.change(screen.getByLabelText('Erfundene Mathematik'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'calculateScenarioButton' }))
  await act(async () => {
    second.resolve({ ...fixtures.grades, scenario_average: '2.0' })
    await second.promise
  })
  expect(screen.getByText('hypotheticalAverageResult 2.0')).toBeTruthy()
  expect(screen.getByText('scenarioInputsLabel Erfundene Mathematik: 2')).toBeTruthy()
  await act(async () => {
    first.resolve({ ...fixtures.grades, scenario_average: '3.0' })
    await first.promise
  })
  expect(screen.getByText('hypotheticalAverageResult 2.0')).toBeTruthy()
  expect(screen.queryByText('hypotheticalAverageResult 3.0')).toBeNull()
})

it('hides a forecast when server module revisions change and rejects its still-pending predecessor', async () => {
  const page = openPage('grades')
  vi.mocked(request).mockResolvedValue({ ...fixtures.grades, scenario_average: '2.0' })
  fireEvent.change(screen.getByLabelText('Erfundene Mathematik'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'calculateScenarioButton' }))
  await waitFor(() => expect(screen.getByText('hypotheticalAverageResult 2.0')).toBeTruthy())
  fixtures.grades = { ...fixtures.grades, modules: [{ ...fixtures.module, revision: 2 }] }
  page.refresh()
  expect(screen.queryByText('hypotheticalAverageResult 2.0')).toBeNull()
  expect(screen.getByText('scenarioInputsChanged')).toBeTruthy()
  const pending = deferred<typeof fixtures.grades>()
  vi.mocked(request).mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'calculateScenarioButton' }))
  fixtures.grades = { ...fixtures.grades, modules: [{ ...fixtures.module, revision: 3 }] }
  page.refresh()
  await act(async () => {
    pending.resolve({ ...fixtures.grades, scenario_average: '1.0' })
    await pending.promise
  })
  expect(screen.queryByText('hypotheticalAverageResult 1.0')).toBeNull()
})
