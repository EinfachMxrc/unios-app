// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { CourseDetail } from '@/types'
import { CourseResourceList } from './CourseResourceList'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/api', () => ({ localDate: (value: string) => value }))
vi.mock('@/components/ResourceHistory', () => ({ ResourceHistory: () => null }))

afterEach(cleanup)

type Resource = CourseDetail['resources'][number]

function renderRow(resource: Partial<Resource>, mime: string) {
  const item = { id: 5, name: 'Tagebuch', kind: 'file', section_id: null, removed_upstream: false, group_category: 'own',
    filename: 'index.html', url: null, ...resource } as Resource
  const detail = { sections: [], versions: { 5: [{ id: 41, version: 1, mime_type: mime }] } } as unknown as CourseDetail
  render(<MemoryRouter><CourseResourceList resources={[item]} detail={detail} hash="" canWrite courseId="1" /></MemoryRouter>)
}

it('opens a Moodle page inside the app and keeps its download in "Mehr"', () => {
  renderRow({}, 'text/html')
  expect(screen.getByRole('link', { name: 'Tagebuch' }).getAttribute('href')).toBe('/document/41')
  expect(screen.getByRole('link', { name: /openPage/ }).getAttribute('href')).toBe('/document/41')
  const download = screen.getByRole('link', { name: /downloadFile/ })
  expect(download.closest('details.resource-more')).not.toBeNull()
})

it('keeps download and PDF reader side by side for a PDF', () => {
  renderRow({ name: 'Skript', filename: 'Skript.pdf' }, 'application/pdf')
  expect(screen.getByRole('link', { name: 'Skript' }).getAttribute('href')).toBe('/material/41')
  expect(screen.getByRole('link', { name: /downloadFile/ }).closest('details')).toBeNull()
  expect(screen.queryByRole('link', { name: /openPage/ })).toBeNull()
})
