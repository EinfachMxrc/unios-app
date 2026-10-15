// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Material } from '@/types'
import { ReaderCitations, citationsByPage, type MaterialCitation } from './ReaderCitations'

vi.mock('@/api', () => ({ useApi: () => ({ data: null, error: null, reload: () => undefined }) }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }),
}))
vi.mock('@/components/State', () => ({
  Panel: ({ title, children }: { title: string; children: React.ReactNode }) => <section aria-label={title}>{children}</section>,
  Failure: ({ message, retry }: { message: string; retry?: () => void }) => <p role="alert" onClick={retry}>{message}</p>,
}))

const material = { course_name: 'Synthetic Informatics', version_id: 17 } as Material
const sameCourse: MaterialCitation = {
  note_id: 'note-a', title: 'Lecture 04', course_name: 'Synthetic Informatics', revision: 3, pages: [2, 5], current_version: true,
}
const otherCourse: MaterialCitation = {
  note_id: 'note-b', title: 'Exam summary', course_name: 'Synthetic Maths', revision: 1, pages: [5], current_version: true,
}
const olderVersion: MaterialCitation = {
  note_id: 'note-c', title: 'Old script note', course_name: 'Synthetic Informatics', revision: 1, pages: [9], current_version: false,
}

afterEach(cleanup)

function show(citations: MaterialCitation[] | undefined, error: string | null = null) {
  const onPage = vi.fn()
  const onOpenBeside = vi.fn()
  const retry = vi.fn()
  render(<MemoryRouter><ReaderCitations material={material} citations={citations} error={error} retry={retry}
    onPage={onPage} onOpenBeside={onOpenBeside} /></MemoryRouter>)
  return { onPage, onOpenBeside, retry }
}

describe('citationsByPage', () => {
  it('counts citing notes per page of the open version only', () => {
    const pages = citationsByPage([sameCourse, otherCourse, olderVersion])
    expect([...pages.entries()].sort()).toEqual([[2, 1], [5, 2]])
    expect(citationsByPage(undefined).size).toBe(0)
  })
})

describe('ReaderCitations', () => {
  it('jumps to cited pages and opens same-course notes beside the PDF', () => {
    const { onPage, onOpenBeside } = show([sameCourse])
    fireEvent.click(screen.getByRole('button', { name: 'citationsPageAria:{"page":5}' }))
    expect(onPage).toHaveBeenCalledWith(5)
    fireEvent.click(screen.getByRole('button', { name: /citationsOpenBeside/ }))
    expect(onOpenBeside).toHaveBeenCalledWith('note-a')
    expect(screen.getByRole('link', { name: 'citationsOpenNote' }).getAttribute('href')).toBe('/notes?id=note-a')
  })

  it('names the other course and offers no split view for it', () => {
    show([otherCourse])
    expect(screen.getByText('Synthetic Maths')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /citationsOpenBeside/ })).toBeNull()
  })

  it('flags quotes of an earlier version without offering its stale page numbers', () => {
    show([olderVersion])
    expect(screen.getByText('citationsOlderVersion')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /citationsPageAria/ })).toBeNull()
  })

  it('explains the empty state and offers a retry on failure', () => {
    show([])
    expect(screen.getByText('citationsEmpty')).toBeTruthy()
    cleanup()
    const { retry } = show(undefined, 'HTTP 500')
    fireEvent.click(screen.getByRole('alert'))
    expect(retry).toHaveBeenCalled()
  })
})
