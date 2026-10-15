// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { clearWorkspace, rememberWorkspace } from './workspaceState'
import { rememberStudySession, useStudyResume } from './studyResume'

afterEach(() => { cleanup(); clearWorkspace() })
describe('bounded session resume', () => {
  it('resumes the exact source page and note without storing a document body', () => {
    rememberStudySession({ kind: 'course', id: 3 }, { mode: 'notes', version: 7, page: 80,
      note: '2b763934-341c-4a99-8f1f-1fb99e22dcbd' }, 'Mathematik')
    const { result } = renderHook(useStudyResume)
    expect(result.current).toEqual({ title: 'Mathematik',
      to: '/learning/focus/course/3?mode=notes&version=7&note=2b763934-341c-4a99-8f1f-1fb99e22dcbd&page=80' })
    act(() => clearWorkspace())
    expect(result.current).toBeNull()
    expect(localStorage.getItem('unios-last-study-v1')).toBeNull()
  })
  it('restores a bounded last source handle in a fresh UI session', () => {
    localStorage.setItem('unios-last-study-v1', JSON.stringify({
      reference: { kind: 'course', id: 3 }, options: { mode: 'source', version: 7, page: 80 }, title: 'Mathematik',
    }))
    expect(renderHook(useStudyResume).result.current?.to).toBe('/learning/focus/course/3?mode=source&version=7&page=80')
  })
  it.each([
    { reference: { kind: 'course', id: -1 }, options: {}, title: 'Kurs' },
    { reference: { kind: 'course', id: 1 }, options: { version: Infinity }, title: 'Kurs' },
    { reference: { kind: 'course', id: 1 }, options: { note: '../../other' }, title: 'Kurs' },
    { reference: { kind: 'course', id: 1 }, options: { mode: 'https://evil.invalid' }, title: 'Kurs' },
    { reference: { kind: 'other', id: 1 }, options: {}, title: 'Kurs' },
  ])('rejects unsafe saved handles %#', entry => {
    rememberWorkspace('study:last-session', entry)
    expect(renderHook(useStudyResume).result.current).toBeNull()
  })
})
