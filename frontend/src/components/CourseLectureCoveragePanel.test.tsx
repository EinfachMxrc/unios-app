// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { linkInline, paragraph, parseBody, serializeDoc } from '@/editor/doc'
import { recordLectureCoverage, type LectureSource } from '@/lib/lectureCoverage'
import { CourseLectureCoveragePanel } from './CourseLectureCoveragePanel'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/api', () => ({
  useApi: () => ({
    data: {
      resources: [
        { id: 5, name: 'Synthetic.pdf', group_category: 'general' },
        { id: 6, name: 'Comparison.pdf', group_category: 'general' },
      ],
      versions: {
        5: [
          { id: 19, version: 3, mime_type: 'application/pdf' },
          { id: 17, version: 2, mime_type: 'application/pdf' },
        ],
        6: [{ id: 18, version: 1, mime_type: 'application/pdf' }],
      },
    },
    error: null,
    reload: vi.fn(),
  }),
}))
vi.mock('./LectureCoveragePanel', () => ({
  LectureCoveragePanel: ({ source }: { source: LectureSource }) => (
    <div data-testid="chosen-source">{source.versionId}</div>
  ),
}))
afterEach(cleanup)
const source: LectureSource = { courseId: 1, resourceId: 5, versionId: 17, version: 2, resourceName: 'Synthetic.pdf' }

it('keeps the recorded old PDF version selected despite an appended personal cross-reference', () => {
  const doc = parseBody(recordLectureCoverage('', source, '2026-10-14', '5-7').body)
  doc.blocks.push(
    paragraph([{ type: 'text', text: 'Eigener Vergleich: ' }, linkInline('S. 20', '/material/18?page=20')]),
  )
  const body = serializeDoc(doc)
  render(<CourseLectureCoveragePanel courseId={1} resourceId={5} body={body} onChange={vi.fn()} />)
  expect((screen.getByLabelText('source') as HTMLSelectElement).value).toBe('17')
  expect(screen.getByTestId('chosen-source').textContent).toBe('17')
  fireEvent.change(screen.getByLabelText('source'), { target: { value: '18' } })
  expect(screen.getByTestId('chosen-source').textContent).toBe('18')
})

it('uses the note resource when no lecture source was recorded instead of inferring it from an own link', () => {
  render(
    <CourseLectureCoveragePanel
      courseId={1}
      resourceId={5}
      body={serializeDoc({
        version: 1,
        blocks: [paragraph([linkInline('S. 20', '/material/18?page=20')])],
      })}
      onChange={vi.fn()}
    />,
  )
  expect((screen.getByLabelText('source') as HTMLSelectElement).value).toBe('19')
  expect(screen.getByTestId('chosen-source').textContent).toBe('19')
})
