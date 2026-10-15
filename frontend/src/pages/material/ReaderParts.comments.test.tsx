// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import type { MaterialAnnotation } from '@/types'
import { AnnotationRow } from './ReaderParts'

vi.mock('@/api', () => ({ localDate: () => 'Synthetic date' }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('react-pdf', () => ({ useDocumentContext: () => ({}) }))
vi.mock('./ReaderRenderLayer', () => ({ ReaderRenderLayer: () => null }))

const annotation: MaterialAnnotation = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  resource_id: 4,
  source_version_id: 17,
  revision: 1,
  kind: 'question',
  quote: 'Synthetic cited passage',
  comment: 'Inline $x^2$.\n\n$$\n\\frac{x+1}{2}\n$$',
  resolved: false,
  created_at: '2026-10-10T12:00:00Z',
  updated_at: '2026-10-10T12:00:00Z',
  anchor: { status: 'matched', page: 1, rects: [] },
}

function preview(open: boolean) {
  const details = screen.getByText('commentPreviewSummary').closest('details')!
  details.open = open
  fireEvent(details, new Event('toggle'))
}

function show(item = annotation, disabled = false) {
  const update = vi.fn().mockResolvedValue(undefined)
  const view = render(
    <AnnotationRow
      item={item}
      onPage={() => undefined}
      onUpdate={update}
      onDelete={async () => undefined}
      onReanchor={() => undefined}
      disabled={disabled}
    />,
  )
  return { ...view, update }
}

beforeEach(clearWorkspace)
afterEach(cleanup)

it('renders formulas only when requested and saves the original comment source', () => {
  const { container, update } = show()
  const field = screen.getByRole('textbox', { name: 'commentLabel' }) as HTMLTextAreaElement
  expect(container.querySelector('.assessment-question-document')).toBeNull()
  preview(true)
  expect(container.querySelectorAll('.katex')).toHaveLength(2)
  expect(field.value).toBe(annotation.comment)
  const edited = `${annotation.comment}\nOwn additional remark`
  fireEvent.change(field, { target: { value: edited } })
  expect(container.querySelector('.assessment-question-document')?.textContent).toContain('Own additional remark')
  fireEvent.click(screen.getByRole('button', { name: 'saveCommentButton' }))
  expect(update).toHaveBeenCalledWith(annotation, edited, false)
  preview(false)
  expect(container.querySelector('.assessment-question-document')).toBeNull()
})

it('keeps unsupported formulas, code, HTML and recall directives passive and readable', () => {
  const comment =
    '$\\unsupported{x}$\n\n```unios-recall\n{"question":"Synthetic prompt","answer":"Synthetic solution"}\n```\n\n<script>synthetic()</script>\n\n![Diagram](https://example.org/synthetic.png)'
  const { container } = show({ ...annotation, comment }, true)
  preview(true)
  const rendered = container.querySelector('.assessment-question-document')!
  expect(rendered.textContent).toContain('\\unsupported{x}')
  expect(rendered.textContent).toContain('Synthetic solution')
  expect(rendered.textContent).toContain('<script>synthetic()</script>')
  expect(rendered.querySelector('script, img, a, button, input')).toBeNull()
  expect((screen.getByRole('textbox', { name: 'commentLabel' }) as HTMLTextAreaElement).disabled).toBe(true)
})

it('does not add preview controls to an empty margin comment', () => {
  const { container } = show({ ...annotation, comment: '' })
  expect(screen.queryByText('commentPreviewSummary')).toBeNull()
  expect(container.querySelector('.assessment-question-document')).toBeNull()
})
