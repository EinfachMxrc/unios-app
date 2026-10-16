// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { clearWorkspace, rememberWorkspace } from './workspaceState'
import { rememberStudySession, useStudyResume, useCourseStudyResume } from './studyResume'

afterEach(() => {
  cleanup()
  clearWorkspace()
})
describe('bounded session resume', () => {
  it('resumes the exact source page and note without storing a document body', () => {
    rememberStudySession(
      { kind: 'course', id: 3 },
      { mode: 'notes', version: 7, page: 80, note: '2b763934-341c-4a99-8f1f-1fb99e22dcbd' },
      'Mathematik',
    )
    const { result } = renderHook(useStudyResume)
    expect(result.current).toEqual({
      title: 'Mathematik',
      to: '/learning/focus/course/3?mode=notes&version=7&note=2b763934-341c-4a99-8f1f-1fb99e22dcbd&page=80',
    })
    act(() => clearWorkspace())
    expect(result.current).toBeNull()
    expect(localStorage.getItem('unios-last-study-v1')).toBeNull()
  })
  it('restores a bounded last source handle in a fresh UI session', () => {
    localStorage.setItem(
      'unios-last-study-v1',
      JSON.stringify({
        reference: { kind: 'course', id: 3 },
        options: { mode: 'source', version: 7, page: 80 },
        title: 'Mathematik',
      }),
    )
    expect(renderHook(useStudyResume).result.current?.to).toBe('/learning/focus/course/3?mode=source&version=7&page=80')
  })
  it.each([
    { reference: { kind: 'course', id: -1 }, options: {}, title: 'Kurs' },
    { reference: { kind: 'course', id: 1 }, options: { version: Infinity }, title: 'Kurs' },
    { reference: { kind: 'course', id: 1 }, options: { note: '../../other' }, title: 'Kurs' },
    { reference: { kind: 'course', id: 1 }, options: { mode: 'https://evil.invalid' }, title: 'Kurs' },
    { reference: { kind: 'other', id: 1 }, options: {}, title: 'Kurs' },
  ])('rejects unsafe saved handles %#', (entry) => {
    rememberWorkspace('study:last-session', entry)
    expect(renderHook(useStudyResume).result.current).toBeNull()
  })
  it('keeps separate course workspaces when the most recent session belongs to another course', () => {
    rememberStudySession({ kind: 'course', id: 3 }, { mode: 'source', version: 7, page: 80 }, 'Erster Kurs')
    rememberStudySession({ kind: 'block', id: 41 }, { mode: 'source', version: 9, page: 12 }, 'Zweiter Kurs', 4)
    const first = renderHook(() => useCourseStudyResume(3))
    const second = renderHook(() => useCourseStudyResume(4))
    expect(first.result.current?.options).toMatchObject({ version: 7, page: 80 })
    expect(second.result.current?.reference).toEqual({ kind: 'course', id: 4 })
    expect(second.result.current?.options).toMatchObject({ version: 9, page: 12 })
    expect(renderHook(() => useCourseStudyResume(41)).result.current).toBeNull()
    act(() => clearWorkspace())
    expect(first.result.current).toBeNull()
    expect(second.result.current).toBeNull()
    expect(localStorage.getItem('unios-course-study-v1')).toBeNull()
  })
  it('restores only safe course handles from a previous app session and bounds the history', () => {
    localStorage.setItem(
      'unios-course-study-v1',
      JSON.stringify([
        { reference: { kind: 'course', id: 3 }, options: { version: 7, page: 80 }, title: 'Synthetischer Kurs' },
        { reference: { kind: 'course', id: 4 }, options: { note: '../../foreign' }, title: 'Unsicher' },
        { reference: { kind: 'block', id: 5 }, options: { version: 9 }, title: 'Anderer Kontext' },
      ]),
    )
    expect(renderHook(() => useCourseStudyResume(3)).result.current?.options.page).toBe(80)
    expect(renderHook(() => useCourseStudyResume(4)).result.current).toBeNull()
    expect(renderHook(() => useCourseStudyResume(5)).result.current).toBeNull()
    for (let id = 10; id < 100; id++) rememberStudySession({ kind: 'course', id }, { version: id }, 'Kurs')
    const saved = JSON.parse(localStorage.getItem('unios-course-study-v1')!)
    expect(saved).toHaveLength(80)
    expect(saved[0].reference.id).toBe(99)
    expect(JSON.stringify(saved)).not.toContain('foreign')
  })
})
