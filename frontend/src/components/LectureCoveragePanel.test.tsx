// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LectureCoveragePanel, type LectureSource } from './LectureCoveragePanel'
import { recordLectureCoverage } from '@/lib/lectureCoverage'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
const source: LectureSource = {
  courseId: 1,
  resourceId: 3,
  versionId: 17,
  version: 2,
  resourceName: 'Synthetic.pdf',
  pageCount: 20,
}
const write = vi.fn<(text: string) => Promise<void>>(async () => undefined)
beforeEach(() => {
  write.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } })
})
afterEach(cleanup)
function Harness({ changed = vi.fn() }: { changed?: (body: string) => void }) {
  const [body, setBody] = useState('')
  return (
    <LectureCoveragePanel
      body={body}
      source={source}
      onChange={(next) => {
        changed(next)
        setBody(next)
      }}
    />
  )
}
it('records pages on Enter without submitting an enclosing note creation form', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
  const changed = vi.fn()
  render(
    <form onSubmit={submit}>
      <Harness changed={changed} />
      <button type="submit">Create</button>
    </form>,
  )
  fireEvent.change(screen.getByLabelText('pages'), { target: { value: '5-7' } })
  const allowed = fireEvent.keyDown(screen.getByLabelText('pages'), { key: 'Enter' })
  expect(allowed).toBe(false)
  expect(submit).not.toHaveBeenCalled()
  expect(changed.mock.calls[0][0]).toContain('/material/17?page=7')
})
it('records a source-only lecture in an empty note and copies the exact GPT source references', async () => {
  const changed = vi.fn()
  render(<Harness changed={changed} />)
  fireEvent.click(screen.getByText('title'))
  fireEvent.change(screen.getByLabelText('date'), { target: { value: '2026-10-14' } })
  fireEvent.change(screen.getByLabelText('pages'), { target: { value: '5-7, 12' } })
  fireEvent.click(screen.getByRole('button', { name: 'record' }))
  expect(changed.mock.calls[0][0]).toContain('/material/17?page=12')
  fireEvent.click(screen.getByRole('button', { name: 'copy' }))
  await waitFor(() => expect(write).toHaveBeenCalledOnce())
  expect(write.mock.calls[0][0]).toContain('/material/17?page=5')
  expect(write.mock.calls[0][0]).not.toContain('/material/17?page=8')
  expect(screen.getByRole('status').textContent).toBe('copied')
})
it('does not change a note or copy a prompt for invalid pages', () => {
  const changed = vi.fn()
  render(<Harness changed={changed} />)
  fireEvent.click(screen.getByText('title'))
  fireEvent.change(screen.getByLabelText('pages'), { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: 'record' }))
  expect(screen.getByRole('alert').textContent).toBe('error_range')
  expect(changed).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
})
it('restores saved coverage once note data loads but preserves newly typed page ranges', () => {
  const body = recordLectureCoverage('', source, '2026-10-14', '5-7').body
  const view = render(<LectureCoveragePanel body="" source={source} onChange={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('date'), { target: { value: '2026-10-14' } })
  view.rerender(<LectureCoveragePanel body={body} source={source} onChange={vi.fn()} />)
  expect((screen.getByLabelText('pages') as HTMLInputElement).value).toBe('5–7')
  fireEvent.change(screen.getByLabelText('pages'), { target: { value: '5-9' } })
  view.rerender(<LectureCoveragePanel body={body + '\nEigener Gedanke.'} source={{ ...source }} onChange={vi.fn()} />)
  expect((screen.getByLabelText('pages') as HTMLInputElement).value).toBe('5-9')
})
