// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CourseDetail, Material } from '@/types'
import type { StudyResume } from '@/lib/studyResume'
import { CourseDesk } from './CourseDesk'

const mocks = vi.hoisted(() => ({
  resume: null as StudyResume | null,
  material: null as Material | null,
  error: null as string | null,
}))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/studyResume', () => ({ useCourseStudyResume: () => mocks.resume }))
vi.mock('@/api', () => ({ useApi: () => ({ data: mocks.material, error: mocks.error }) }))
const detail = {
  course: { id: 3 },
  resources: [
    { id: 4, name: 'Erfundenes Skript', filename: 'Skript.pdf', group_category: 'general' },
    { id: 5, name: 'Fremde Gruppe', filename: 'Andere.pdf', group_category: 'other_group' },
  ],
  versions: {
    4: [{ id: 7, version: 1, mime_type: 'application/pdf' }],
    5: [{ id: 8, version: 1, mime_type: 'application/pdf' }],
  },
} as unknown as CourseDetail
function desk(data = detail) {
  return render(
    <MemoryRouter>
      <CourseDesk detail={data} />
    </MemoryRouter>,
  )
}
beforeEach(() => {
  mocks.resume = null
  mocks.material = null
  mocks.error = null
})
afterEach(cleanup)

it('opens an available own source when the course has no previous workspace', () => {
  desk()
  expect(screen.getByRole('link', { name: 'deskOpen' }).getAttribute('href')).toBe('/material/7?workspace=1')
})
it('prefers an available PDF over an Office document that may need conversion', () => {
  desk({
    ...detail,
    resources: [{ ...detail.resources[0], id: 6, name: 'Vortrag', filename: 'Vortrag.pptx' }, ...detail.resources],
    versions: {
      ...detail.versions,
      6: [
        {
          id: 9,
          version: 1,
          mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          downloaded_at: '2026-10-16T10:00:00Z',
          resource_id: 6,
          size: 24,
        },
      ],
    },
  })
  expect(screen.getByRole('link', { name: 'deskOpen' }).getAttribute('href')).toBe('/material/7?workspace=1')
})
it('restores a source on another result page only after checking its course and version', () => {
  mocks.resume = { reference: { kind: 'course', id: 3 }, options: { version: 44, page: 12 }, title: 'Frühere Quelle' }
  mocks.material = { course_id: 3, version_id: 44, resource_name: 'Älteres Skript' } as Material
  desk()
  expect(screen.getByRole('link', { name: 'deskOpen' }).getAttribute('href')).toBe('/material/44?workspace=1&page=12')
  expect(screen.getByRole('heading', { name: 'Älteres Skript' })).toBeTruthy()
})
it.each([
  { course_id: 99, version_id: 44 },
  { course_id: 3, version_id: 45 },
])('ignores foreign or stale source metadata %#', (material) => {
  mocks.resume = { reference: { kind: 'course', id: 3 }, options: { version: 44, page: 12 }, title: 'Frühere Quelle' }
  mocks.material = { ...material, resource_name: 'Fremde Quelle' } as Material
  desk()
  expect(screen.getByRole('link', { name: 'deskOpen' }).getAttribute('href')).toBe('/material/7?workspace=1')
  expect(screen.queryByText('Fremde Quelle')).toBeNull()
})
it('offers no invented workspace when only other-group files or downloads exist', () => {
  desk({ ...detail, resources: detail.resources.filter((resource) => resource.id === 5) })
  expect(screen.queryByRole('link', { name: 'deskOpen' })).toBeNull()
})
